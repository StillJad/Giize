import {
  GuildMember,
  MessageType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type TextChannel,
  type User,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { config } from "../../config/config.js";
import { sqlite } from "../../database/database.js";
import { logger } from "../../utils/logger.js";
import { auditLogService } from "../audit/AuditLogService.js";
import { safeEdit, safeReply } from "../tickets/interactionResponses.js";
import { ticketService } from "../tickets/TicketService.js";
import { purgeRenderer } from "./PurgeRenderer.js";

const developerRoleId = "1518110330377736323";
const fourteenDays = 14 * 24 * 60 * 60 * 1000;

export type PurgeFilters = {
  amount: number;
  user: User | null;
  contains: string | null;
  startswith: string | null;
  endswith: string | null;
  excludes: string | null;
  bots: boolean | null;
  embeds: boolean | null;
  uploads: boolean | null;
  links: boolean | null;
  invites: boolean | null;
  stickers: boolean | null;
  gifs: boolean | null;
  polls: boolean | null;
  voiceNotes: boolean | null;
  system: boolean | null;
  commands: boolean | null;
  any: boolean | null;
};

type PendingPurge = {
  moderatorId: string;
  guildId: string;
  channelId: string;
  messageIds: string[];
  skippedOld: number;
  filters: string[];
  requiresExtraConfirmation: boolean;
  extraConfirmed: boolean;
  createdAt: number;
};

export class PurgeService {
  private readonly pendingPurges = new Map<string, PendingPurge>();

  async preview(interaction: ChatInputCommandInteraction, filters: PurgeFilters) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild || !interaction.channel || !("messages" in interaction.channel)) {
      await safeEdit(interaction, { content: "This command can only be used in a server text channel." });
      return;
    }

    if (!this.canPurge(interaction.member)) {
      const member = interaction.member instanceof GuildMember ? interaction.member : null;
      logger.warn(`Denied purge command. command=purge subcommand=preview userId=${interaction.user.id} hasAdministrator=${Boolean(member?.permissions.has(PermissionFlagsBits.Administrator))} hasStaffRole=${Boolean(member?.roles.cache.has(config.staffRoleId))}`);
      await safeEdit(interaction, { content: "You don't have permission to use this command." });
      return;
    }

    if (filters.amount > 1000) {
      await safeEdit(interaction, { content: "Amount cannot be greater than 1000." });
      return;
    }

    const channel = interaction.channel as TextChannel;
    if (!filters.any && this.isProtectedTicketChannel(channel)) {
      await safeEdit(interaction, { content: "Use `any:true` to purge inside ticket channels." });
      return;
    }

    const searchResult = await this.findMatchingMessages(channel, filters);
    const purgeId = randomUUID();
    const activeFilters = this.describeFilters(filters);
    const requiresExtraConfirmation = filters.amount >= 250;

    this.pendingPurges.set(purgeId, {
      moderatorId: interaction.user.id,
      guildId: interaction.guild.id,
      channelId: channel.id,
      messageIds: searchResult.messages.map(message => message.id),
      skippedOld: searchResult.skippedOld,
      filters: activeFilters,
      requiresExtraConfirmation,
      extraConfirmed: false,
      createdAt: Date.now(),
    });

    const preview = purgeRenderer.renderPreview(searchResult.messages.length, activeFilters, requiresExtraConfirmation);
    await safeEdit(interaction, {
      ...preview,
      components: purgeRenderer.renderConfirmRows(purgeId),
    });
  }

  async confirm(interaction: ButtonInteraction, purgeId: string, finalConfirm: boolean) {
    await interaction.deferUpdate();

    const pending = this.pendingPurges.get(purgeId);

    if (!pending || pending.moderatorId !== interaction.user.id) {
      await interaction.editReply({ content: "This purge confirmation has expired.", embeds: [], components: [] });
      return;
    }

    if (pending.requiresExtraConfirmation && !pending.extraConfirmed && !finalConfirm) {
      pending.extraConfirmed = true;
      this.pendingPurges.set(purgeId, pending);
      await interaction.editReply({
        ...purgeRenderer.renderExtraConfirmation(pending.filters),
        components: purgeRenderer.renderConfirmRows(purgeId, true),
      });
      return;
    }

    const channel = await interaction.client.channels.fetch(pending.channelId).catch(() => null);

    if (!channel?.isTextBased() || !("bulkDelete" in channel)) {
      await interaction.editReply({ content: "Unable to find the purge channel.", embeds: [], components: [] });
      return;
    }

    const deleted = pending.messageIds.length > 0
      ? await channel.bulkDelete(pending.messageIds, true).catch(() => null)
      : null;
    const deletedCount = deleted?.size ?? 0;
    const skippedCount = pending.skippedOld + Math.max(0, pending.messageIds.length - deletedCount);

    this.pendingPurges.delete(purgeId);

    if (interaction.guild) {
      await auditLogService.send(interaction.guild, "Purge Log", [
        { name: "Moderator", value: `${interaction.user} (${interaction.user.id})`, inline: true },
        { name: "Channel", value: `<#${pending.channelId}>`, inline: true },
        { name: "Deleted count", value: `${deletedCount}`, inline: true },
        { name: "Skipped count", value: `${skippedCount}`, inline: true },
        { name: "Filters used", value: pending.filters.length > 0 ? pending.filters.join("\n").slice(0, 1024) : "None", inline: false },
      ]);
    }

    await interaction.editReply({
      content: `Deleted ${deletedCount} messages.\nSkipped ${skippedCount} older than 14 days.`,
      embeds: [],
      components: [],
    });
    setTimeout(() => void interaction.deleteReply().catch(() => {}), 5_000);
  }

  async cancel(interaction: ButtonInteraction, purgeId: string) {
    await interaction.deferUpdate();
    this.pendingPurges.delete(purgeId);
    await interaction.editReply({ content: "Purge cancelled.", embeds: [], components: [] });
    setTimeout(() => void interaction.deleteReply().catch(() => {}), 5_000);
  }

  cleanup() {
    const expiresBefore = Date.now() - 10 * 60_000;
    for (const [purgeId, pending] of this.pendingPurges.entries()) {
      if (pending.createdAt < expiresBefore) this.pendingPurges.delete(purgeId);
    }
  }

  private canPurge(member: unknown) {
    return member instanceof GuildMember &&
      (
        member.permissions.has(PermissionFlagsBits.ManageMessages) ||
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.roles.cache.has(config.staffRoleId) ||
        member.roles.cache.has(developerRoleId)
      );
  }

  private isProtectedTicketChannel(channel: TextChannel) {
    if (ticketService.hasStandardTicketMetadata(channel)) return true;
    return Boolean(sqlite.prepare("SELECT 1 FROM event_applications WHERE application_channel_id = ?").get(channel.id));
  }

  private async findMatchingMessages(channel: TextChannel, filters: PurgeFilters) {
    const messages: Message[] = [];
    let skippedOld = 0;
    let inspected = 0;
    let before: string | undefined;

    while (messages.length < filters.amount && inspected < 1000) {
      const batch = await channel.messages.fetch({ limit: Math.min(100, 1000 - inspected), before });
      if (batch.size === 0) break;

      for (const message of batch.values()) {
        inspected += 1;
        if (!this.matches(message, filters)) continue;

        if (Date.now() - message.createdTimestamp >= fourteenDays) {
          skippedOld += 1;
        } else {
          messages.push(message);
        }

        if (messages.length >= filters.amount || inspected >= 1000) break;
      }

      before = batch.last()?.id;
      if (batch.size < 100) break;
    }

    return { messages, skippedOld };
  }

  private matches(message: Message, filters: PurgeFilters) {
    if (!filters.any && !this.hasAnyFilter(filters)) return true;
    const content = message.content.toLowerCase();

    if (filters.user && message.author.id !== filters.user.id) return false;
    if (filters.contains && !content.includes(filters.contains.toLowerCase())) return false;
    if (filters.startswith && !content.startsWith(filters.startswith.toLowerCase())) return false;
    if (filters.endswith && !content.endsWith(filters.endswith.toLowerCase())) return false;
    if (filters.excludes && content.includes(filters.excludes.toLowerCase())) return false;
    if (filters.bots === true && !message.author.bot) return false;
    if (filters.embeds === true && message.embeds.length === 0) return false;
    if (filters.uploads === true && message.attachments.size === 0) return false;
    if (filters.links === true && !/https?:\/\/\S+/i.test(message.content)) return false;
    if (filters.invites === true && !/(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/i.test(message.content)) return false;
    if (filters.stickers === true && message.stickers.size === 0) return false;
    if (filters.gifs === true && !this.hasGif(message)) return false;
    if (filters.polls === true && !("poll" in message && message.poll)) return false;
    if (filters.voiceNotes === true && !this.hasVoiceNote(message)) return false;
    if (filters.system === true && message.type === MessageType.Default) return false;
    if (filters.commands === true && !this.isCommandInvocation(message)) return false;

    return true;
  }

  private hasAnyFilter(filters: PurgeFilters) {
    return Boolean(
      filters.user ||
      filters.contains ||
      filters.startswith ||
      filters.endswith ||
      filters.excludes ||
      filters.bots ||
      filters.embeds ||
      filters.uploads ||
      filters.links ||
      filters.invites ||
      filters.stickers ||
      filters.gifs ||
      filters.polls ||
      filters.voiceNotes ||
      filters.system ||
      filters.commands ||
      filters.any
    );
  }

  private hasGif(message: Message) {
    if (/https?:\/\/(?:www\.)?(?:tenor\.com|giphy\.com|media\.giphy\.com)\S+/i.test(message.content)) return true;
    return message.embeds.some(embed =>
      Boolean(embed.url?.includes("tenor.com") || embed.url?.includes("giphy.com"))
    );
  }

  private hasVoiceNote(message: Message) {
    return message.attachments.some(attachment =>
      attachment.contentType?.startsWith("audio/") ||
      attachment.name?.toLowerCase().endsWith(".ogg")
    );
  }

  private isCommandInvocation(message: Message) {
    return message.interactionMetadata !== null || message.type === MessageType.ChatInputCommand;
  }

  private describeFilters(filters: PurgeFilters) {
    const descriptions: string[] = [];
    if (filters.any) descriptions.push("any");
    if (filters.user) descriptions.push(`user: ${filters.user.tag}`);
    if (filters.contains) descriptions.push(`contains: ${filters.contains}`);
    if (filters.startswith) descriptions.push(`startswith: ${filters.startswith}`);
    if (filters.endswith) descriptions.push(`endswith: ${filters.endswith}`);
    if (filters.excludes) descriptions.push(`excludes: ${filters.excludes}`);
    if (filters.bots) descriptions.push("bots");
    if (filters.embeds) descriptions.push("embeds");
    if (filters.uploads) descriptions.push("uploads");
    if (filters.links) descriptions.push("links");
    if (filters.invites) descriptions.push("invites");
    if (filters.stickers) descriptions.push("stickers");
    if (filters.gifs) descriptions.push("gifs");
    if (filters.polls) descriptions.push("polls");
    if (filters.voiceNotes) descriptions.push("voice_notes");
    if (filters.system) descriptions.push("system");
    if (filters.commands) descriptions.push("commands");
    return descriptions;
  }
}

export const purgeService = new PurgeService();
