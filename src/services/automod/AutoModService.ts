import {
  GuildMember,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type Message,
  type Role,
  type TextChannel,
} from "discord.js";
import { config as botConfig } from "../../config/config.js";
import { sqlite } from "../../database/database.js";
import { logger } from "../../utils/logger.js";
import { autoModRenderer } from "./AutoModRenderer.js";
import { autoModTracker } from "./AutoModTracker.js";

const developerRoleId = "1518110330377736323";
const oneDay = 86_400_000;

export type MatchType = "exact" | "contains";
export type AutoModRule =
  | "Spam"
  | "Duplicate Messages"
  | "Excessive Mentions"
  | "Excessive Emojis"
  | "Invite Link"
  | "Suspicious Link"
  | "Banned Word"
  | "Excessive Caps";

export type AutoModConfig = {
  guildId: string;
  enabled: boolean;
  spamEnabled: boolean;
  duplicateEnabled: boolean;
  mentionLimit: number;
  emojiLimit: number;
  capsPercentage: number;
  inviteLinksEnabled: boolean;
  externalLinksEnabled: boolean;
  timeoutMinutes: number;
  logChannelId: string | null;
  exemptRoleIds: Set<string>;
  exemptChannelIds: Set<string>;
  bannedWords: { word: string; matchType: MatchType }[];
  allowedDomains: Set<string>;
};

export type AutoModLogData = {
  userId: string;
  rule: string;
  action: string;
  channelId: string;
  reason: string;
  warningCount: number;
  timeoutDuration: string;
  messageId: string;
  messageContent: string;
  attachments: string | null;
};

type AutoModConfigRow = {
  guild_id: string;
  enabled: number;
  spam_enabled: number;
  duplicate_enabled: number;
  mention_limit: number;
  emoji_limit: number;
  caps_percentage: number;
  invite_links_enabled: number;
  external_links_enabled: number;
  timeout_minutes: number;
  log_channel_id: string | null;
};

type Violation = {
  rule: AutoModRule;
  reason: string;
  detail?: string;
  timeoutEligible: boolean;
};

type CachedConfig = {
  config: AutoModConfig;
  expiresAt: number;
};

type ConfigureInput = {
  spam: boolean | null;
  duplicateMessages: boolean | null;
  mentionLimit: number | null;
  emojiLimit: number | null;
  capsPercentage: number | null;
  inviteLinks: boolean | null;
  externalLinks: boolean | null;
  timeoutMinutes: number | null;
  logChannel: TextChannel | null;
  exemptRole: Role | null;
  exemptChannel: TextChannel | null;
};

export class AutoModService {
  private readonly configCache = new Map<string, CachedConfig>();

  canManage(member: unknown) {
    return (
      member instanceof GuildMember &&
      (member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(developerRoleId))
    );
  }

  async status(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.editReply("AutoMod can only be viewed in a server.");
      return;
    }

    const config = this.getConfig(interaction.guildId);
    await interaction.editReply({
      embeds: [autoModRenderer.renderStatus(config, config.bannedWords.length, config.allowedDomains.size)],
    });
  }

  async enable(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 64 });

    if (!this.canManageCommand(interaction)) return;

    this.ensureConfig(interaction.guildId!);
    sqlite.prepare("UPDATE automod_configs SET enabled = 1, updated_at = ? WHERE guild_id = ?")
      .run(Date.now(), interaction.guildId);
    this.invalidate(interaction.guildId!);
    await interaction.editReply("AutoMod is now enabled.");
  }

  async disable(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 64 });

    if (!this.canManageCommand(interaction)) return;

    this.ensureConfig(interaction.guildId!);
    sqlite.prepare("UPDATE automod_configs SET enabled = 0, updated_at = ? WHERE guild_id = ?")
      .run(Date.now(), interaction.guildId);
    this.invalidate(interaction.guildId!);
    await interaction.editReply("AutoMod is now disabled.");
  }

  async configure(interaction: ChatInputCommandInteraction, input: ConfigureInput) {
    await interaction.deferReply({ flags: 64 });

    if (!this.canManageCommand(interaction)) return;

    this.ensureConfig(interaction.guildId!);

    const current = this.getConfig(interaction.guildId!);
    sqlite.prepare(`
      UPDATE automod_configs
      SET spam_enabled = ?,
          duplicate_enabled = ?,
          mention_limit = ?,
          emoji_limit = ?,
          caps_percentage = ?,
          invite_links_enabled = ?,
          external_links_enabled = ?,
          timeout_minutes = ?,
          log_channel_id = ?,
          updated_at = ?
      WHERE guild_id = ?
    `).run(
      (input.spam ?? current.spamEnabled) ? 1 : 0,
      (input.duplicateMessages ?? current.duplicateEnabled) ? 1 : 0,
      input.mentionLimit ?? current.mentionLimit,
      input.emojiLimit ?? current.emojiLimit,
      input.capsPercentage ?? current.capsPercentage,
      (input.inviteLinks ?? current.inviteLinksEnabled) ? 1 : 0,
      (input.externalLinks ?? current.externalLinksEnabled) ? 1 : 0,
      input.timeoutMinutes ?? current.timeoutMinutes,
      input.logChannel?.id ?? current.logChannelId,
      Date.now(),
      interaction.guildId
    );

    if (input.exemptRole) {
      sqlite.prepare("INSERT OR IGNORE INTO automod_exempt_roles (guild_id, role_id) VALUES (?, ?)")
        .run(interaction.guildId, input.exemptRole.id);
    }

    if (input.exemptChannel) {
      sqlite.prepare("INSERT OR IGNORE INTO automod_exempt_channels (guild_id, channel_id) VALUES (?, ?)")
        .run(interaction.guildId, input.exemptChannel.id);
    }

    this.invalidate(interaction.guildId!);
    await interaction.editReply("AutoMod configuration updated.");
  }

  async addWord(interaction: ChatInputCommandInteraction, word: string, matchType: MatchType) {
    await interaction.deferReply({ flags: 64 });

    if (!this.canManageCommand(interaction)) return;

    const normalized = word.trim().toLowerCase();
    if (!normalized) {
      await interaction.editReply("Please provide a word to block.");
      return;
    }

    this.ensureConfig(interaction.guildId!);
    sqlite.prepare(`
      INSERT INTO automod_banned_words (guild_id, word, match_type)
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id, word) DO UPDATE SET match_type = excluded.match_type
    `).run(interaction.guildId, normalized, matchType);
    this.invalidate(interaction.guildId!);
    await interaction.editReply("Banned word saved.");
  }

  async removeWord(interaction: ChatInputCommandInteraction, word: string) {
    await interaction.deferReply({ flags: 64 });

    if (!this.canManageCommand(interaction)) return;

    sqlite.prepare("DELETE FROM automod_banned_words WHERE guild_id = ? AND word = ?")
      .run(interaction.guildId, word.trim().toLowerCase());
    this.invalidate(interaction.guildId!);
    await interaction.editReply("Banned word removed.");
  }

  async listWords(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.editReply("AutoMod can only be viewed in a server.");
      return;
    }

    const config = this.getConfig(interaction.guildId);
    const lines = config.bannedWords.map(entry => `${entry.word} (${entry.matchType})`);
    await interaction.editReply(lines.length > 0 ? lines.join("\n").slice(0, 1900) : "No banned words configured.");
  }

  async allowDomain(interaction: ChatInputCommandInteraction, domain: string) {
    await interaction.deferReply({ flags: 64 });

    if (!this.canManageCommand(interaction)) return;

    const normalized = this.normalizeDomain(domain);
    if (!normalized) {
      await interaction.editReply("Please provide a valid domain.");
      return;
    }

    this.ensureConfig(interaction.guildId!);
    sqlite.prepare("INSERT OR IGNORE INTO automod_allowed_domains (guild_id, domain) VALUES (?, ?)")
      .run(interaction.guildId, normalized);
    this.invalidate(interaction.guildId!);
    await interaction.editReply("Allowed domain saved.");
  }

  async removeDomain(interaction: ChatInputCommandInteraction, domain: string) {
    await interaction.deferReply({ flags: 64 });

    if (!this.canManageCommand(interaction)) return;

    const normalized = this.normalizeDomain(domain);
    if (!normalized) {
      await interaction.editReply("Please provide a valid domain.");
      return;
    }

    sqlite.prepare("DELETE FROM automod_allowed_domains WHERE guild_id = ? AND domain = ?")
      .run(interaction.guildId, normalized);
    this.invalidate(interaction.guildId!);
    await interaction.editReply("Allowed domain removed.");
  }

  async listDomains(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.editReply("AutoMod can only be viewed in a server.");
      return;
    }

    const config = this.getConfig(interaction.guildId);
    const domains = [...config.allowedDomains].sort();
    await interaction.editReply(domains.length > 0 ? domains.join("\n").slice(0, 1900) : "No allowed domains configured.");
  }

  async handleMessage(message: Message) {
    if (!message.guild || !message.member || message.author.bot || message.webhookId) return;

    const config = this.getConfig(message.guild.id);
    if (!config.enabled || this.isExempt(message.member, message, config)) return;

    const violation = await this.detectViolation(message, config);
    if (!violation) return;

    await this.applyViolation(message, config, violation);
  }

  private async detectViolation(message: Message, config: AutoModConfig): Promise<Violation | null> {
    const content = message.content ?? "";

    const bannedWord = this.detectBannedWord(content, config);
    if (bannedWord) return bannedWord;

    if (config.inviteLinksEnabled) {
      const invite = await this.detectInvite(message);
      if (invite) return invite;
    }

    if (config.externalLinksEnabled) {
      const link = this.detectExternalLink(content, config);
      if (link) return link;
    }

    const mentionCount = this.countMentions(message);
    if (mentionCount > config.mentionLimit) {
      return {
        rule: "Excessive Mentions",
        reason: `Too many mentions (${mentionCount}/${config.mentionLimit}).`,
        timeoutEligible: true,
      };
    }

    const emojiCount = this.countEmojis(content);
    if (emojiCount > config.emojiLimit) {
      return {
        rule: "Excessive Emojis",
        reason: `Too many emojis (${emojiCount}/${config.emojiLimit}).`,
        timeoutEligible: true,
      };
    }

    const capsPercentage = this.capsPercentage(content);
    if (capsPercentage !== null && capsPercentage > config.capsPercentage) {
      return {
        rule: "Excessive Caps",
        reason: `Too many capital letters (${capsPercentage}%).`,
        timeoutEligible: false,
      };
    }

    const normalized = this.normalizeMessage(content);
    const trackedMessages = autoModTracker.trackMessage(message.guild!.id, message.author.id, normalized, message.createdTimestamp);

    if (config.spamEnabled) {
      const recentCount = trackedMessages.filter(entry => message.createdTimestamp - entry.createdAt <= 7_000).length;
      if (recentCount >= 6) {
        return {
          rule: "Spam",
          reason: "Message flooding.",
          timeoutEligible: true,
        };
      }
    }

    if (config.duplicateEnabled && normalized) {
      const duplicateCount = trackedMessages.filter(entry =>
        entry.content === normalized && message.createdTimestamp - entry.createdAt <= 20_000
      ).length;

      if (duplicateCount >= 3) {
        return {
          rule: "Duplicate Messages",
          reason: "Repeated duplicate messages.",
          timeoutEligible: true,
        };
      }
    }

    return null;
  }

  private async applyViolation(message: Message, config: AutoModConfig, violation: Violation) {
    const warningCount = this.createWarning(message.guild!.id, message.author.id, violation.rule, violation.reason);
    const timeoutMinutes = this.timeoutMinutes(config, warningCount, violation.timeoutEligible);
    let action = "Message deleted; warning recorded";
    let timeoutDuration = "None";

    autoModTracker.markAutoModDelete(message.id);
    await message.delete().catch(error => logger.warn("AutoMod failed to delete message.", error));

    if (timeoutMinutes > 0 && message.member && await this.applyTimeout(message.member, timeoutMinutes, violation.reason)) {
      action = "Message deleted; warning recorded; timeout applied";
      timeoutDuration = `${timeoutMinutes} minutes`;
    }

    await this.notifyUser(message, violation.reason);
    await this.logAction(message, config, {
      userId: message.author.id,
      rule: violation.rule,
      action,
      channelId: message.channel.id,
      reason: violation.reason,
      warningCount,
      timeoutDuration,
      messageId: message.id,
      messageContent: autoModRenderer.truncate(message.content || "No text content"),
      attachments: this.attachmentText(message),
    });
  }

  private canManageCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId || !this.canManage(interaction.member)) {
      void interaction.editReply("You don't have permission to configure AutoMod.");
      return false;
    }

    return true;
  }

  private getConfig(guildId: string): AutoModConfig {
    const cached = this.configCache.get(guildId);
    if (cached && cached.expiresAt > Date.now()) return cached.config;

    this.ensureConfig(guildId);
    const row = sqlite.prepare("SELECT * FROM automod_configs WHERE guild_id = ?").get(guildId) as AutoModConfigRow;
    const bannedWords = sqlite
      .prepare("SELECT word, match_type AS matchType FROM automod_banned_words WHERE guild_id = ? ORDER BY word")
      .all(guildId) as { word: string; matchType: MatchType }[];
    const allowedDomains = sqlite
      .prepare("SELECT domain FROM automod_allowed_domains WHERE guild_id = ?")
      .all(guildId) as { domain: string }[];
    const exemptRoles = sqlite
      .prepare("SELECT role_id AS roleId FROM automod_exempt_roles WHERE guild_id = ?")
      .all(guildId) as { roleId: string }[];
    const exemptChannels = sqlite
      .prepare("SELECT channel_id AS channelId FROM automod_exempt_channels WHERE guild_id = ?")
      .all(guildId) as { channelId: string }[];

    const config: AutoModConfig = {
      guildId,
      enabled: row.enabled === 1,
      spamEnabled: row.spam_enabled === 1,
      duplicateEnabled: row.duplicate_enabled === 1,
      mentionLimit: row.mention_limit,
      emojiLimit: row.emoji_limit,
      capsPercentage: row.caps_percentage,
      inviteLinksEnabled: row.invite_links_enabled === 1,
      externalLinksEnabled: row.external_links_enabled === 1,
      timeoutMinutes: row.timeout_minutes,
      logChannelId: row.log_channel_id,
      exemptRoleIds: new Set(exemptRoles.map(role => role.roleId)),
      exemptChannelIds: new Set(exemptChannels.map(channel => channel.channelId)),
      bannedWords,
      allowedDomains: new Set(allowedDomains.map(domain => domain.domain)),
    };

    this.configCache.set(guildId, { config, expiresAt: Date.now() + 30_000 });
    return config;
  }

  private ensureConfig(guildId: string) {
    const now = Date.now();
    sqlite.prepare(`
      INSERT OR IGNORE INTO automod_configs (guild_id, created_at, updated_at)
      VALUES (?, ?, ?)
    `).run(guildId, now, now);
  }

  private invalidate(guildId: string) {
    this.configCache.delete(guildId);
  }

  private isExempt(member: GuildMember, message: Message, config: AutoModConfig) {
    if (member.id === member.guild.ownerId) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (member.roles.cache.has(developerRoleId)) return true;
    if (config.exemptChannelIds.has(message.channel.id)) return true;
    return member.roles.cache.some(role => config.exemptRoleIds.has(role.id));
  }

  private detectBannedWord(content: string, config: AutoModConfig): Violation | null {
    const lowerContent = content.toLowerCase();
    const words: string[] = lowerContent.match(/[\p{L}\p{N}_'-]+/gu) ?? [];

    for (const entry of config.bannedWords) {
      const blockedWord = entry.word.toLowerCase();
      const matched = entry.matchType === "exact"
        ? words.includes(blockedWord)
        : lowerContent.includes(blockedWord);

      if (matched) {
        return {
          rule: "Banned Word",
          reason: "Blocked language.",
          detail: blockedWord,
          timeoutEligible: true,
        };
      }
    }

    return null;
  }

  private async detectInvite(message: Message): Promise<Violation | null> {
    const matches = [...message.content.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]+)/gi)];
    if (matches.length === 0) return null;

    for (const match of matches) {
      const code = match[1];
      if (code && await this.isOwnInvite(message.guild!, code)) continue;

      return {
        rule: "Invite Link",
        reason: "External Discord invite link.",
        detail: code,
        timeoutEligible: true,
      };
    }

    return null;
  }

  private async isOwnInvite(guild: Guild, code: string) {
    try {
      const invites = await guild.invites.fetch();
      return invites.some(invite => invite.code.toLowerCase() === code.toLowerCase());
    } catch (error) {
      logger.warn("AutoMod could not fetch guild invites. Treating invite as external.", error);
      return false;
    }
  }

  private detectExternalLink(content: string, config: AutoModConfig): Violation | null {
    for (const url of this.extractUrls(content)) {
      const domain = this.normalizeDomain(url.hostname);
      if (!domain || this.isDiscordCdnDomain(domain) || this.isAllowedDomain(domain, config.allowedDomains)) continue;

      return {
        rule: "Suspicious Link",
        reason: "External links are not allowed.",
        detail: domain,
        timeoutEligible: true,
      };
    }

    return null;
  }

  private extractUrls(content: string) {
    const urls: URL[] = [];

    for (const match of content.matchAll(/https?:\/\/[^\s<>()]+/gi)) {
      try {
        urls.push(new URL(match[0]));
      } catch {
        continue;
      }
    }

    return urls;
  }

  private isDiscordCdnDomain(domain: string) {
    return ["cdn.discordapp.com", "media.discordapp.net"].includes(domain) ||
      domain.endsWith(".discordapp.net");
  }

  private isAllowedDomain(domain: string, allowedDomains: Set<string>) {
    return [...allowedDomains].some(allowedDomain =>
      domain === allowedDomain || domain.endsWith(`.${allowedDomain}`)
    );
  }

  private countMentions(message: Message) {
    const userMentionCount = message.mentions.users.filter(user => user.id !== message.author.id).size;
    return userMentionCount + message.mentions.roles.size;
  }

  private countEmojis(content: string) {
    const customEmojiCount = content.match(/<a?:[A-Za-z0-9_]{2,32}:\d{15,25}>/g)?.length ?? 0;
    const withoutCustomEmojis = content.replace(/<a?:[A-Za-z0-9_]{2,32}:\d{15,25}>/g, "");
    const unicodeEmojiCount = withoutCustomEmojis.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
    return customEmojiCount + unicodeEmojiCount;
  }

  private capsPercentage(content: string) {
    const cleaned = content
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]*`/g, "")
      .replace(/https?:\/\/[^\s<>()]+/gi, "")
      .replace(/<a?:[A-Za-z0-9_]{2,32}:\d{15,25}>/g, "");
    const letters = cleaned.match(/\p{L}/gu) ?? [];

    if (letters.length < 12) return null;

    const uppercase = letters.filter(letter => letter === letter.toUpperCase() && letter !== letter.toLowerCase()).length;
    return Math.round((uppercase / letters.length) * 100);
  }

  private normalizeMessage(content: string) {
    return content.toLowerCase().trim().replace(/\s+/g, " ");
  }

  private createWarning(guildId: string, userId: string, rule: string, reason: string) {
    const now = Date.now();
    sqlite.prepare(`
      INSERT INTO automod_warnings (guild_id, user_id, rule, reason, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId, rule, reason, now);

    const row = sqlite.prepare(`
      SELECT COUNT(*) AS total
      FROM automod_warnings
      WHERE guild_id = ? AND user_id = ? AND created_at >= ?
    `).get(guildId, userId, now - oneDay) as { total: number };

    return row.total;
  }

  private timeoutMinutes(config: AutoModConfig, warningCount: number, timeoutEligible: boolean) {
    if (!timeoutEligible || config.timeoutMinutes <= 0 || warningCount < 2) return 0;
    return Math.min(warningCount >= 3 ? config.timeoutMinutes * 2 : config.timeoutMinutes, 1440);
  }

  private async applyTimeout(member: GuildMember, minutes: number, reason: string) {
    if (member.id === member.guild.ownerId) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return false;
    if (member.roles.cache.has(developerRoleId)) return false;
    if (member.id === member.client.user.id) return false;

    const botMember = member.guild.members.me ?? (await member.guild.members.fetchMe().catch(() => null));
    if (!botMember || member.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) return false;

    return member.timeout(minutes * 60_000, `AutoMod: ${reason}`)
      .then(() => true)
      .catch(error => {
        logger.warn("AutoMod timeout failed.", error);
        return false;
      });
  }

  private async notifyUser(message: Message, reason: string) {
    if (!message.channel.isSendable()) return;

    const notification = await message.channel.send({
      content: `<@${message.author.id}>, your message was removed: ${reason}.`,
      allowedMentions: { users: [message.author.id], roles: [], parse: [] },
    }).catch(() => null);

    if (notification) {
      setTimeout(() => void notification.delete().catch(() => {}), 5_000);
    }
  }

  private async logAction(message: Message, config: AutoModConfig, data: AutoModLogData) {
    const channelId = config.logChannelId || botConfig.auditLogsChannelId;
    if (!channelId || !message.guild) return;

    const channel = await message.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || !("send" in channel)) return;

    await channel.send({
      embeds: [autoModRenderer.renderLog(data)],
      allowedMentions: { parse: [] },
    }).catch(error => logger.warn("Failed to send AutoMod log.", error));
  }

  private attachmentText(message: Message) {
    const attachments = [...message.attachments.values()];
    if (attachments.length === 0) return null;
    return attachments.map(attachment => `${attachment.name ?? "attachment"} - ${attachment.url}`).join("\n");
  }

  private normalizeDomain(input: string) {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return null;

    try {
      const parsed = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      const domain = trimmed.replace(/^www\./, "");
      return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(domain) ? domain : null;
    }
  }
}

export const autoModService = new AutoModService();
