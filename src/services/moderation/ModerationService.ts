import { randomUUID } from "node:crypto";
import {
  ChannelType,
  GuildMember,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type TextChannel,
  type User,
} from "discord.js";
import { config } from "../../config/config.js";
import { sqlite } from "../../database/database.js";
import { auditLogService } from "../audit/AuditLogService.js";
import { safeEdit } from "../tickets/interactionResponses.js";
import { logger } from "../../utils/logger.js";
import { moderationRenderer } from "./ModerationRenderer.js";

const developerRoleId = "1518110330377736323";
const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000;

type WarningRow = {
  id: number;
  guild_id: string;
  user_id: string;
  moderator_id: string;
  reason: string;
  created_at: number;
};

type PendingClearWarnings = {
  guildId: string;
  userId: string;
  moderatorId: string;
  count: number;
  createdAt: number;
};

type ActionCheck =
  | { ok: true; moderator: GuildMember; target: GuildMember }
  | { ok: false; reason: string };

export class ModerationService {
  private pendingClearWarnings = new Map<string, PendingClearWarnings>();

  async warn(interaction: ChatInputCommandInteraction, user: User, reason: string) {
    await interaction.deferReply({ flags: 64 });
    const moderator = await this.requireModerator(interaction);
    if (!moderator) return;

    const target = await interaction.guild!.members.fetch(user.id).catch(() => null);
    if (!target) {
      await safeEdit(interaction, "That member is not in this server.");
      return;
    }

    sqlite.prepare(`
      INSERT INTO moderation_warnings (guild_id, user_id, moderator_id, reason, source, created_at)
      VALUES (?, ?, ?, ?, 'manual', ?)
    `).run(interaction.guildId!, user.id, interaction.user.id, reason, Date.now());

    await target.send({ embeds: [moderationRenderer.warningDm(moderator, reason)] }).catch(error =>
      logger.warn("Failed to DM warning target.", error)
    );

    await this.log(interaction, "Warning Issued", user, reason);
    await safeEdit(interaction, `Warned ${user}.`);
  }

  async warnings(interaction: ChatInputCommandInteraction, user: User) {
    await interaction.deferReply({ flags: 64 });
    const moderator = await this.requireModerator(interaction);
    if (!moderator) return;

    const rows = sqlite.prepare(`
      SELECT id, guild_id, user_id, moderator_id, reason, created_at
      FROM moderation_warnings
      WHERE guild_id = ? AND user_id = ? AND source = 'manual'
      ORDER BY created_at DESC
    `).all(interaction.guildId, user.id) as WarningRow[];

    const fields = rows.slice(0, 20).map(row => ({
      name: `Warning #${row.id}`,
      value: [
        `Moderator: <@${row.moderator_id}>`,
        `Reason: ${this.truncate(row.reason, 500)}`,
        `Created: <t:${Math.floor(row.created_at / 1000)}:F>`,
      ].join("\n"),
    }));

    await safeEdit(interaction, { embeds: [moderationRenderer.warnings(user, fields)] });
  }

  async clearWarning(interaction: ChatInputCommandInteraction, warningId: number) {
    await interaction.deferReply({ flags: 64 });
    const moderator = await this.requireModerator(interaction);
    if (!moderator) return;

    const row = sqlite.prepare(`
      SELECT id, guild_id, user_id, moderator_id, reason, created_at
      FROM moderation_warnings
      WHERE guild_id = ? AND id = ? AND source = 'manual'
    `).get(interaction.guildId, warningId) as WarningRow | undefined;

    if (!row) {
      await safeEdit(interaction, "No active warning was found with that ID.");
      return;
    }

    sqlite.prepare("DELETE FROM moderation_warnings WHERE guild_id = ? AND id = ? AND source = 'manual'")
      .run(interaction.guildId, warningId);

    await this.log(interaction, "Warning Cleared", { id: row.user_id } as User, `Cleared warning #${warningId}`);
    await safeEdit(interaction, `Cleared warning #${warningId}.`);
  }

  async requestClearWarnings(interaction: ChatInputCommandInteraction, user: User) {
    await interaction.deferReply({ flags: 64 });
    const moderator = await this.requireModerator(interaction);
    if (!moderator) return;

    const count = (sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM moderation_warnings
      WHERE guild_id = ? AND user_id = ? AND source = 'manual'
    `).get(interaction.guildId, user.id) as { count: number }).count;

    if (count === 0) {
      await safeEdit(interaction, `${user} has no active warnings.`);
      return;
    }

    const id = randomUUID();
    this.pendingClearWarnings.set(id, {
      guildId: interaction.guildId!,
      userId: user.id,
      moderatorId: interaction.user.id,
      count,
      createdAt: Date.now(),
    });

    await safeEdit(interaction, {
      content: `Clear ${count} warning${count === 1 ? "" : "s"} for ${user}?`,
      components: [this.confirmRow(id)],
    });
  }

  async confirmClearWarnings(interaction: ButtonInteraction, confirmationId: string) {
    await interaction.deferUpdate();
    const pending = this.pendingClearWarnings.get(confirmationId);

    if (!pending || pending.guildId !== interaction.guildId || pending.moderatorId !== interaction.user.id) {
      await safeEdit(interaction, { content: "This confirmation is no longer valid.", components: [] });
      return;
    }

    sqlite.prepare("DELETE FROM moderation_warnings WHERE guild_id = ? AND user_id = ? AND source = 'manual'")
      .run(pending.guildId, pending.userId);
    this.pendingClearWarnings.delete(confirmationId);

    await this.log(interaction, "Warnings Cleared", { id: pending.userId } as User, `Cleared ${pending.count} warnings`);
    await safeEdit(interaction, { content: `Cleared ${pending.count} warning${pending.count === 1 ? "" : "s"}.`, components: [] });
  }

  async cancelClearWarnings(interaction: ButtonInteraction, confirmationId: string) {
    await interaction.deferUpdate();
    this.pendingClearWarnings.delete(confirmationId);
    await safeEdit(interaction, { content: "Warning clear cancelled.", components: [] });
  }

  async kick(interaction: ChatInputCommandInteraction, user: User, reason: string) {
    await interaction.deferReply({ flags: 64 });
    const check = await this.checkMemberAction(interaction, user, PermissionFlagsBits.KickMembers);
    if (!check.ok) {
      await safeEdit(interaction, check.reason);
      return;
    }

    await check.target.send({ embeds: [moderationRenderer.actionDm("You were kicked", interaction.guild!.name, reason)] })
      .catch(error => logger.warn("Failed to DM kick target.", error));
    await check.target.kick(reason);
    await this.log(interaction, "Member Kicked", user, reason);
    await safeEdit(interaction, `Kicked ${user}.`);
  }

  async ban(interaction: ChatInputCommandInteraction, user: User, reason: string, deleteMessageSeconds: number) {
    await interaction.deferReply({ flags: 64 });
    const check = await this.checkMemberAction(interaction, user, PermissionFlagsBits.BanMembers, true);
    if (!check.ok) {
      await safeEdit(interaction, check.reason);
      return;
    }

    await user.send({ embeds: [moderationRenderer.actionDm("You were banned", interaction.guild!.name, reason)] })
      .catch(error => logger.warn("Failed to DM ban target.", error));

    await interaction.guild!.members.ban(user.id, { reason, deleteMessageSeconds });
    await this.log(interaction, "Member Banned", user, reason, null, this.formatDeleteWindow(deleteMessageSeconds));
    await safeEdit(interaction, `Banned ${user}.`);
  }

  async unban(interaction: ChatInputCommandInteraction, userId: string, reason: string) {
    await interaction.deferReply({ flags: 64 });
    const moderator = await this.requireModerator(interaction);
    if (!moderator) return;

    if (!/^\d{17,20}$/.test(userId)) {
      await safeEdit(interaction, "That is not a valid Discord user ID.");
      return;
    }

    if (!await this.requireBotPermission(interaction, PermissionFlagsBits.BanMembers, "Ban Members")) return;

    await interaction.guild!.members.unban(userId, reason);
    await this.log(interaction, "Member Unbanned", { id: userId } as User, reason);
    await safeEdit(interaction, `Unbanned <@${userId}>.`);
  }

  async timeout(interaction: ChatInputCommandInteraction, user: User, duration: string, reason: string) {
    await interaction.deferReply({ flags: 64 });
    const ms = this.parseDuration(duration);
    if (!ms || ms > maxTimeoutMs) {
      await safeEdit(interaction, "Use a valid duration like 10m, 1h, 2h 30m, 1d, or 7d.");
      return;
    }

    const check = await this.checkMemberAction(interaction, user, PermissionFlagsBits.ModerateMembers);
    if (!check.ok) {
      await safeEdit(interaction, check.reason);
      return;
    }

    await check.target.timeout(ms, reason);
    await this.log(interaction, "Member Timed Out", user, reason, null, duration);
    await safeEdit(interaction, `Timed out ${user} for ${duration}.`);
  }

  async removeTimeout(interaction: ChatInputCommandInteraction, user: User, reason: string) {
    await interaction.deferReply({ flags: 64 });
    const check = await this.checkMemberAction(interaction, user, PermissionFlagsBits.ModerateMembers);
    if (!check.ok) {
      await safeEdit(interaction, check.reason);
      return;
    }

    await check.target.timeout(null, reason);
    await this.log(interaction, "Timeout Removed", user, reason);
    await safeEdit(interaction, `Removed timeout from ${user}.`);
  }

  async nickname(interaction: ChatInputCommandInteraction, user: User, nickname: string | null) {
    await interaction.deferReply({ flags: 64 });
    const check = await this.checkMemberAction(interaction, user, PermissionFlagsBits.ManageNicknames);
    if (!check.ok) {
      await safeEdit(interaction, check.reason);
      return;
    }

    await check.target.setNickname(nickname || null, `Nickname updated by ${interaction.user.tag}`);
    await this.log(interaction, nickname ? "Nickname Updated" : "Nickname Reset", user, nickname ? `New nickname: ${nickname}` : "Nickname reset");
    await safeEdit(interaction, nickname ? `Updated ${user}'s nickname.` : `Reset ${user}'s nickname.`);
  }

  async lock(interaction: ChatInputCommandInteraction, channel: TextChannel) {
    await this.updateEveryoneOverwrite(interaction, channel, "Channel Locked", { SendMessages: false });
  }

  async unlock(interaction: ChatInputCommandInteraction, channel: TextChannel) {
    await this.updateEveryoneOverwrite(interaction, channel, "Channel Unlocked", { SendMessages: null });
  }

  async slowmode(interaction: ChatInputCommandInteraction, channel: TextChannel, seconds: number) {
    await interaction.deferReply({ flags: 64 });
    const moderator = await this.requireModerator(interaction);
    if (!moderator) return;
    if (!await this.requireBotPermission(interaction, PermissionFlagsBits.ManageChannels, "Manage Channels")) return;

    await channel.setRateLimitPerUser(seconds, `Slowmode updated by ${interaction.user.tag}`);
    await this.log(interaction, "Slowmode Updated", { id: channel.id } as User, `${seconds} seconds`, channel.toString());
    await safeEdit(interaction, seconds === 0 ? `Disabled slowmode in ${channel}.` : `Set slowmode in ${channel} to ${seconds} seconds.`);
  }

  async hide(interaction: ChatInputCommandInteraction, channel: TextChannel) {
    await this.updateEveryoneOverwrite(interaction, channel, "Channel Hidden", { ViewChannel: false });
  }

  async show(interaction: ChatInputCommandInteraction, channel: TextChannel) {
    await this.updateEveryoneOverwrite(interaction, channel, "Channel Shown", { ViewChannel: null });
  }

  cleanup() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, pending] of this.pendingClearWarnings) {
      if (pending.createdAt < cutoff) this.pendingClearWarnings.delete(id);
    }
  }

  private async updateEveryoneOverwrite(
    interaction: ChatInputCommandInteraction,
    channel: TextChannel,
    action: string,
    change: { SendMessages?: boolean | null; ViewChannel?: boolean | null }
  ) {
    await interaction.deferReply({ flags: 64 });
    const moderator = await this.requireModerator(interaction);
    if (!moderator) return;
    if (!await this.requireBotPermission(interaction, PermissionFlagsBits.ManageChannels, "Manage Channels")) return;

    await channel.permissionOverwrites.edit(
      interaction.guild!.roles.everyone,
      change,
      { reason: `${action} by ${interaction.user.tag}` }
    );

    await this.log(interaction, action, { id: channel.id } as User, null, channel.toString());
    await safeEdit(interaction, `${action} ${channel}.`);
  }

  private async requireModerator(interaction: ChatInputCommandInteraction | ButtonInteraction) {
    if (!interaction.inGuild() || !(interaction.member instanceof GuildMember)) {
      await safeEdit(interaction, { content: "This command can only be used in a server." });
      return null;
    }

    const allowed = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
      interaction.member.roles.cache.has(config.staffRoleId) ||
      interaction.member.roles.cache.has(developerRoleId);

    if (!allowed) {
      await safeEdit(interaction, { content: "You don't have permission to use this command." });
      return null;
    }

    return interaction.member;
  }

  private async checkMemberAction(
    interaction: ChatInputCommandInteraction,
    user: User,
    botPermission: bigint,
    allowMissingMember = false
  ): Promise<ActionCheck> {
    const moderator = await this.requireModerator(interaction);
    if (!moderator) return { ok: false, reason: "You don't have permission to use this command." };
    if (!await this.requireBotPermission(interaction, botPermission, this.permissionName(botPermission))) {
      return { ok: false, reason: "I do not have permission to perform that action." };
    }

    const target = await interaction.guild!.members.fetch(user.id).catch(() => null);
    if (!target) {
      if (allowMissingMember) return { ok: true, moderator, target: moderator };
      return { ok: false, reason: "That member is not in this server." };
    }

    if (target.id === interaction.guild!.ownerId) {
      return { ok: false, reason: "You cannot moderate the server owner." };
    }

    if (target.id === interaction.client.user.id) {
      return { ok: false, reason: "I cannot moderate myself." };
    }

    if (target.roles.highest.position >= moderator.roles.highest.position && moderator.id !== interaction.guild!.ownerId) {
      return { ok: false, reason: "You cannot moderate a member with an equal or higher role." };
    }

    const botMember = interaction.guild!.members.me ?? await interaction.guild!.members.fetchMe();
    if (target.roles.highest.position >= botMember.roles.highest.position) {
      return { ok: false, reason: "I cannot moderate a member with an equal or higher role than mine." };
    }

    return { ok: true, moderator, target };
  }

  private async requireBotPermission(
    interaction: ChatInputCommandInteraction,
    permission: bigint,
    label: string
  ) {
    const botMember = interaction.guild?.members.me ?? await interaction.guild?.members.fetchMe().catch(() => null);
    if (!botMember?.permissions.has(permission)) {
      await safeEdit(interaction, `I need the ${label} permission to do that.`);
      return false;
    }

    return true;
  }

  private confirmRow(id: string) {
    return {
      type: 1 as const,
      components: [
        { type: 2 as const, style: 4 as const, label: "Clear Warnings", custom_id: `moderation_clear_warnings_confirm:${id}` },
        { type: 2 as const, style: 2 as const, label: "Cancel", custom_id: `moderation_clear_warnings_cancel:${id}` },
      ],
    };
  }

  private async log(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    action: string,
    target: User,
    reason?: string | null,
    channel?: string | null,
    duration?: string | null
  ) {
    if (!interaction.guild) return;

    await auditLogService.send(interaction.guild, action, moderationRenderer.logFields({
      action,
      target: target.id ? `<@${target.id}> (${target.id})` : "Unknown",
      moderator: `<@${interaction.user.id}> (${interaction.user.id})`,
      reason,
      channel,
      duration,
    }));
  }

  private parseDuration(value: string) {
    const matches = value.toLowerCase().matchAll(/(\d+)\s*([dhm])/g);
    let total = 0;
    let matched = false;

    for (const match of matches) {
      matched = true;
      const amount = Number(match[1]);
      const unit = match[2];
      if (unit === "d") total += amount * 24 * 60 * 60 * 1000;
      if (unit === "h") total += amount * 60 * 60 * 1000;
      if (unit === "m") total += amount * 60 * 1000;
    }

    return matched && total > 0 ? total : null;
  }

  private permissionName(permission: bigint) {
    if (permission === PermissionFlagsBits.KickMembers) return "Kick Members";
    if (permission === PermissionFlagsBits.BanMembers) return "Ban Members";
    if (permission === PermissionFlagsBits.ModerateMembers) return "Moderate Members";
    if (permission === PermissionFlagsBits.ManageNicknames) return "Manage Nicknames";
    return "Manage Channels";
  }

  private formatDeleteWindow(seconds: number) {
    if (seconds === 0) return "0 hours";
    if (seconds < 86400) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
    return `${seconds / 86400} day${seconds === 86400 ? "" : "s"}`;
  }

  private truncate(value: string, max: number) {
    return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
  }
}

export const moderationService = new ModerationService();
