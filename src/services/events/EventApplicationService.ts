import {
  ActionRowBuilder,
  ChannelType,
  GuildMember,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import { config } from "../../config/config.js";
import { sqlite } from "../../database/database.js";
import { logger } from "../../utils/logger.js";
import { safeEdit, safeReply } from "../tickets/interactionResponses.js";
import { VerificationService } from "../verification/VerificationService.js";
import { eventService } from "./EventService.js";
import {
  eventApplicationRenderer,
  type EventApplicationPlatform,
  type EventApplicationPriority,
  type EventApplicationRecord,
  type EventApplicationStatus,
} from "./EventApplicationRenderer.js";
import type { EventRecord } from "./EventRenderer.js";

const developerRoleId = "1518110330377736323";

type ApplicationRow = {
  id: number;
  event_id: number;
  guild_id: string;
  discord_id: string;
  minecraft_username: string;
  platform: EventApplicationPlatform;
  answer_one: string;
  answer_two: string;
  status: EventApplicationStatus;
  priority: EventApplicationPriority;
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
};

type VerifiedRow = {
  java_username: string | null;
  bedrock_username: string | null;
};

export class EventApplicationService {
  async openModal(interaction: ButtonInteraction, eventId: number) {
    if (!interaction.inGuild()) {
      await safeReply(interaction, { content: "Events can only be used in a server.", flags: 64 });
      return;
    }

    const event = eventService.getEventById(eventId);

    if (!event || event.guildId !== interaction.guildId || event.status === "ended") {
      await safeReply(interaction, { content: "❌ This event is not accepting applications.", flags: 64 });
      return;
    }

    const verified = this.getVerifiedAccount(interaction.guildId!, interaction.user.id);

    if (!verified) {
      await safeReply(interaction, {
        content: "You must verify your Minecraft account before applying for this event. Use `/verify`.",
        flags: 64,
      });
      return;
    }

    if (this.hasExistingApplication(event.id, interaction.user.id)) {
      await safeReply(interaction, { content: "You have already applied for this event.", flags: 64 });
      return;
    }

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`event_application:${event.id}`)
        .setTitle("Event Application")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("answer_one")
              .setLabel("Why should you play the event?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMinLength(40)
              .setMaxLength(1000)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("answer_two")
              .setLabel("What will you do in the event?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMinLength(40)
              .setMaxLength(1000)
          )
        )
    );
  }

  async submit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild) {
      await safeEdit(interaction, { content: "Events can only be used in a server." });
      return;
    }

    const eventId = Number(interaction.customId.substring("event_application:".length));
    const event = eventService.getEventById(eventId);

    if (!event || event.guildId !== interaction.guildId || event.status === "ended") {
      await safeEdit(interaction, { content: "❌ This event is not accepting applications." });
      return;
    }

    if (this.hasExistingApplication(event.id, interaction.user.id)) {
      await safeEdit(interaction, { content: "You have already applied for this event." });
      return;
    }

    const answerOne = interaction.fields.getTextInputValue("answer_one").trim();
    const answerTwo = interaction.fields.getTextInputValue("answer_two").trim();

    if (!this.isValidAnswer(answerOne) || !this.isValidAnswer(answerTwo)) {
      await safeEdit(interaction, { content: "Both answers must contain at least two complete sentences." });
      return;
    }

    const verified = this.getVerifiedAccount(interaction.guildId, interaction.user.id);

    if (!verified) {
      await safeEdit(interaction, { content: "You must verify your Minecraft account before applying for this event. Use `/verify`." });
      return;
    }

    const member = interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);
    const priority = this.priorityFor(member);
    const autoAccepted = priority !== "Normal";
    const application = this.createApplication({
      event,
      discordId: interaction.user.id,
      minecraftUsername: verified.minecraftUsername,
      platform: verified.platform,
      answerOne,
      answerTwo,
      priority,
      status: autoAccepted ? "accepted" : "pending",
      reviewedBy: autoAccepted ? interaction.client.user.id : null,
    });

    if (autoAccepted) {
      await eventService.acceptApplicant(interaction.guild, interaction.client, event, interaction.user.id);
    }

    await this.createApplicationTicket(interaction.guild, event, application, autoAccepted);
    await this.logApplication(interaction.guild, event, application, "Application submitted", null, false);

    if (autoAccepted) {
      await this.logApplication(interaction.guild, event, application, "Automatically accepted", application.reviewedBy, true);
    }

    await safeEdit(interaction, {
      content: autoAccepted
        ? "✅ Application submitted and automatically accepted."
        : "✅ Application submitted for staff review.",
    });
  }

  async review(interaction: ButtonInteraction, applicationId: number, status: "accepted" | "rejected") {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild || !this.canReview(interaction.member)) {
      await safeEdit(interaction, { content: "You don't have permission to review event applications." });
      return;
    }

    const application = this.getApplication(applicationId);
    if (!application) {
      await safeEdit(interaction, { content: "Application not found." });
      return;
    }

    const event = eventService.getEventById(application.eventId);
    if (!event || event.guildId !== interaction.guildId) {
      await safeEdit(interaction, { content: "Event not found." });
      return;
    }

    if (application.status !== "pending") {
      await safeEdit(interaction, { content: "This application has already been reviewed." });
      return;
    }

    const reviewedAt = Date.now();
    sqlite.prepare(`
      UPDATE event_applications
      SET status = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ?
    `).run(status, interaction.user.id, reviewedAt, application.id);

    const updated = this.getApplication(application.id);
    if (!updated) {
      await safeEdit(interaction, { content: "Application could not be updated." });
      return;
    }

    if (status === "accepted") {
      await eventService.acceptApplicant(interaction.guild, interaction.client, event, application.discordId);
    }

    await interaction.message.edit({
      embeds: [eventApplicationRenderer.renderTicketEmbed(event, updated)],
      components: eventApplicationRenderer.renderReviewComponents(application.id, true),
    }).catch(error => logger.warn("Failed to update application ticket message.", error));

    if (interaction.channel?.isTextBased() && "send" in interaction.channel) {
      await interaction.channel.send({
        content: status === "accepted"
          ? `<@${application.discordId}> your application has been accepted.`
          : `<@${application.discordId}> your application has been rejected.`,
        allowedMentions: { users: [application.discordId] },
      }).catch(() => {});
    }

    await this.logApplication(
      interaction.guild,
      event,
      updated,
      status === "accepted" ? "Manually accepted" : "Rejected",
      interaction.user.id,
      false
    );

    await safeEdit(interaction, { content: status === "accepted" ? "Application accepted." : "Application rejected." });
  }

  private createApplication(input: {
    event: EventRecord;
    discordId: string;
    minecraftUsername: string;
    platform: EventApplicationPlatform;
    answerOne: string;
    answerTwo: string;
    priority: EventApplicationPriority;
    status: EventApplicationStatus;
    reviewedBy: string | null;
  }) {
    const now = Date.now();
    const insert = sqlite.prepare(`
      INSERT INTO event_applications (
        event_id, guild_id, discord_id, minecraft_username, platform, answer_one,
        answer_two, status, priority, reviewed_by, reviewed_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.event.id,
      input.event.guildId,
      input.discordId,
      input.minecraftUsername,
      input.platform,
      input.answerOne,
      input.answerTwo,
      input.status,
      input.priority,
      input.reviewedBy,
      input.reviewedBy ? now : null,
      now
    );

    const application = this.getApplication(Number(insert.lastInsertRowid));
    if (!application) throw new Error("Application insert failed.");
    return application;
  }

  private async createApplicationTicket(guild: Guild, event: EventRecord, application: EventApplicationRecord, autoAccepted: boolean) {
    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    const categoryId = config.eventApplicationCategoryId || config.ticketCategoryId;
    const category = categoryId ? await guild.channels.fetch(categoryId).catch(() => null) : null;
    const channel = await guild.channels.create({
      name: this.nextApplicationChannelName(guild, application.minecraftUsername),
      type: ChannelType.GuildText,
      parent: category?.type === ChannelType.GuildCategory ? category.id : undefined,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: application.discordId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: config.staffRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
        },
        {
          id: botMember.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
        },
      ],
      reason: `Event application ${application.id}`,
    });

    await channel.send({
      embeds: [eventApplicationRenderer.renderTicketEmbed(event, application, autoAccepted ? "automatic" : "manual")],
      components: autoAccepted ? [] : eventApplicationRenderer.renderReviewComponents(application.id, false),
    });
  }

  private async logApplication(guild: Guild, event: EventRecord, application: EventApplicationRecord, action: string, reviewerId: string | null, automatic: boolean) {
    const channel = await guild.channels.fetch(config.eventLogsChannelId).catch(() => null);
    if (!channel?.isTextBased() || !("send" in channel)) return;

    await channel.send({
      embeds: [eventApplicationRenderer.renderLogEmbed(event, application, action, reviewerId, automatic)],
      allowedMentions: { parse: [] },
    }).catch(error => logger.warn("Failed to send event application log.", error));
  }

  private getVerifiedAccount(guildId: string, discordId: string) {
    const row = sqlite.prepare(`
      SELECT java_username, bedrock_username
      FROM verified_players
      WHERE guild_id = ? AND discord_id = ?
    `).get(guildId, discordId) as VerifiedRow | undefined;

    if (row?.java_username) {
      return {
        minecraftUsername: row.java_username,
        platform: "Java" as const,
      };
    }

    if (row?.bedrock_username) {
      return {
        minecraftUsername: VerificationService.normalizeBedrockNickname(row.bedrock_username),
        platform: "Bedrock" as const,
      };
    }

    return null;
  }

  private hasExistingApplication(eventId: number, discordId: string) {
    return Boolean(sqlite.prepare(`
      SELECT 1 FROM event_applications
      WHERE event_id = ? AND discord_id = ? AND status IN ('pending', 'accepted', 'rejected')
    `).get(eventId, discordId));
  }

  private getApplication(applicationId: number) {
    const row = sqlite.prepare("SELECT * FROM event_applications WHERE id = ?").get(applicationId) as ApplicationRow | undefined;
    return row ? this.toApplication(row) : null;
  }

  private toApplication(row: ApplicationRow): EventApplicationRecord {
    return {
      id: row.id,
      eventId: row.event_id,
      guildId: row.guild_id,
      discordId: row.discord_id,
      minecraftUsername: row.minecraft_username,
      platform: row.platform,
      answerOne: row.answer_one,
      answerTwo: row.answer_two,
      status: row.status,
      priority: row.priority,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    };
  }

  private isValidAnswer(answer: string) {
    return answer.trim().length >= 40 && (answer.match(/[.!?]/g)?.length ?? 0) >= 2;
  }

  private priorityFor(member: GuildMember): EventApplicationPriority {
    if (config.diamondSupporterRoleId && member.roles.cache.has(config.diamondSupporterRoleId)) return "Diamond";
    if (config.ironSupporterRoleId && member.roles.cache.has(config.ironSupporterRoleId)) return "Iron";
    if (config.dirtSupporterRoleId && member.roles.cache.has(config.dirtSupporterRoleId)) return "Dirt";
    return "Normal";
  }

  private canReview(member: unknown) {
    return member instanceof GuildMember && (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.has(developerRoleId) ||
      member.roles.cache.has(config.staffRoleId)
    );
  }

  private nextApplicationChannelName(guild: Guild, username: string) {
    const baseName = `event-app-${this.slug(username)}`.slice(0, 80) || "event-app-user";
    let candidate = baseName;
    let suffix = 2;

    while (guild.channels.cache.some(channel => channel.name === candidate)) {
      candidate = `${baseName}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private slug(value: string) {
    return value
      .toLowerCase()
      .replace(/^\./, "")
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "user";
  }
}

export const eventApplicationService = new EventApplicationService();
