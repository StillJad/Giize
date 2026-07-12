import crypto from "node:crypto";
import { GuildMember, type Guild } from "discord.js";
import { config } from "../../config/config.js";
import { sqlite } from "../../database/database.js";
import { giizeEmbed } from "../../utils/embeds.js";
import { logger } from "../../utils/logger.js";

export type VerificationPlatform = "java" | "bedrock";

export type StoredMinecraftAccounts = {
  javaUsername: string | null;
  javaUuid: string | null;
  bedrockUsername: string | null;
};

export type BedrockValidationResult =
  | {
      valid: true;
      cleanUsername: string;
      nickname: string;
    }
  | {
      valid: false;
      reason: "empty" | "unsupported_symbols" | "too_long";
    };

type VerifiedPlayerRow = {
  java_username: string | null;
  java_uuid: string | null;
  bedrock_username: string | null;
};

export class VerificationService {
  static generateCode() {
    return crypto.randomBytes(4).toString("hex").toUpperCase();
  }

  static normalizeUsername(username: string, platform: "java" | "bedrock") {
    username = username.trim();

    if (platform === "bedrock") {
      return this.normalizeBedrockNickname(username);
    }

    return username;
  }

  static validateBedrockUsername(username: string): BedrockValidationResult {
    const cleanUsername = username.trim().replace(/^\.+/, "").trim();

    if (!cleanUsername) {
      return { valid: false, reason: "empty" };
    }

    if (cleanUsername.length > 15) {
      return { valid: false, reason: "too_long" };
    }

    if (!/^[A-Za-z0-9 _-]+$/.test(cleanUsername)) {
      return { valid: false, reason: "unsupported_symbols" };
    }

    return {
      valid: true,
      cleanUsername,
      nickname: this.normalizeBedrockNickname(cleanUsername),
    };
  }

  static normalizeBedrockNickname(username: string) {
    const cleanUsername = username.trim().replace(/^\.+/, "").trim();
    return `.${cleanUsername}`;
  }

  static failureEmbed() {
    return giizeEmbed()
      .setTitle("Verification Failed")
      .setDescription("That Minecraft username could not be found.\n\nPlease double-check the spelling and try again.")
      .setFooter({ text: "Giize Events Verification System" });
  }

  static bedrockFailureEmbed() {
    return giizeEmbed()
      .setTitle("Verification Failed")
      .setDescription("That Bedrock gamertag format is invalid.\n\nPlease double-check the spelling and try again.")
      .setFooter({ text: "Giize Events Verification System" });
  }

  getStoredAccounts(guildId: string, discordId: string): StoredMinecraftAccounts {
    const row = sqlite
      .prepare(`
        SELECT java_username, java_uuid, bedrock_username
        FROM verified_players
        WHERE guild_id = ? AND discord_id = ?
      `)
      .get(guildId, discordId) as VerifiedPlayerRow | undefined;

    return {
      javaUsername: row?.java_username ?? null,
      javaUuid: row?.java_uuid ?? null,
      bedrockUsername: row?.bedrock_username ?? null,
    };
  }

  async verifyMember(
    guild: Guild,
    member: GuildMember,
    platform: VerificationPlatform,
    username: string,
    javaUuid: string | null
  ) {
    const now = Date.now();
    const existing = this.getStoredAccounts(guild.id, member.id);
    const nextJavaUsername = platform === "java" ? username : existing.javaUsername;
    const nextJavaUuid = platform === "java" ? javaUuid : existing.javaUuid;
    const nextBedrockUsername = platform === "bedrock" ? username : existing.bedrockUsername;

    sqlite
      .prepare("UPDATE verified_players SET guild_id = ? WHERE discord_id = ? AND guild_id IS NULL")
      .run(guild.id, member.id);

    const update = sqlite.prepare(`
      UPDATE verified_players
      SET guild_id = ?,
          java_username = ?,
          java_uuid = ?,
          bedrock_username = ?,
          verified_java_at = COALESCE(?, verified_java_at),
          verified_bedrock_at = COALESCE(?, verified_bedrock_at),
          minecraft_uuid = ?,
          minecraft_username = ?,
          platform = ?,
          verified = 1,
          verified_at = ?
      WHERE discord_id = ? AND guild_id = ?
    `).run(
      guild.id,
      nextJavaUsername,
      nextJavaUuid,
      nextBedrockUsername,
      platform === "java" ? now : null,
      platform === "bedrock" ? now : null,
      platform === "java" ? javaUuid : nextJavaUuid,
      username,
      platform,
      now,
      member.id,
      guild.id
    );

    if (update.changes === 0) {
      sqlite.prepare(`
        INSERT INTO verified_players (
          guild_id, discord_id, java_username, java_uuid, bedrock_username,
          verified_java_at, verified_bedrock_at, minecraft_uuid, minecraft_username,
          platform, verified, verified_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        guild.id,
        member.id,
        nextJavaUsername,
        nextJavaUuid,
        nextBedrockUsername,
        platform === "java" ? now : null,
        platform === "bedrock" ? now : null,
        platform === "java" ? javaUuid : nextJavaUuid,
        username,
        platform,
        now,
        now
      );
    }

    const stored = this.getStoredAccounts(guild.id, member.id);
    const nickname = stored.javaUsername
      ?? (stored.bedrockUsername ? VerificationService.normalizeBedrockNickname(stored.bedrockUsername) : null)
      ?? member.nickname
      ?? member.user.username;

    if (member.manageable && nickname !== member.nickname) {
      await member.setNickname(nickname, "Verified via /verify").catch(error =>
        logger.warn(`Failed to update verification nickname for ${member.id}.`, error)
      );
    }

    await this.addPlatformRole(guild, member, platform);
    await this.sendVerificationLog(guild, member, platform, username, javaUuid, stored);

    return {
      stored,
      nickname,
      javaPreferredForNickname: Boolean(stored.javaUsername),
    };
  }

  async unverifyMember(guild: Guild, member: GuildMember) {
    sqlite
      .prepare("DELETE FROM verified_players WHERE discord_id = ? AND (guild_id = ? OR guild_id IS NULL)")
      .run(member.id, guild.id);

    for (const roleId of [config.verifyRoleId, config.javaVerifiedRoleId, config.bedrockVerifiedRoleId].filter(Boolean)) {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role || !member.roles.cache.has(roleId)) continue;

      await member.roles.remove(role, "Unverified via /unverify").catch(error =>
        logger.warn(`Failed to remove verification role ${roleId} from ${member.id}.`, error)
      );
    }

    if (member.manageable) {
      await member.setNickname(null, "Unverified via /unverify").catch(error =>
        logger.warn(`Failed to reset verification nickname for ${member.id}.`, error)
      );
    }
  }

  private async addPlatformRole(guild: Guild, member: GuildMember, platform: VerificationPlatform) {
    const roleIds = [
      config.verifyRoleId,
      platform === "java" ? config.javaVerifiedRoleId : config.bedrockVerifiedRoleId,
    ].filter(Boolean);

    for (const roleId of roleIds) {
      const role = await guild.roles.fetch(roleId).catch(() => null);

      if (!role) {
        logger.warn(`Verification role ${roleId} was not found.`);
        continue;
      }

      await member.roles.add(role, "Verified via /verify").catch(error =>
        logger.warn(`Failed to add verification role ${roleId} to ${member.id}.`, error)
      );
    }
  }

  private async sendVerificationLog(
    guild: Guild,
    member: GuildMember,
    platform: VerificationPlatform,
    username: string,
    javaUuid: string | null,
    stored: StoredMinecraftAccounts
  ) {
    if (!config.verificationLogsChannelId) return;

    const channel = await guild.channels.fetch(config.verificationLogsChannelId).catch(() => null);
    if (!channel?.isTextBased() || !("send" in channel)) return;

    await channel.send({
      embeds: [
        giizeEmbed()
          .setTitle("✅ Member Verified")
          .addFields(
            { name: "Discord Member", value: `${member}`, inline: true },
            { name: "Minecraft Username", value: username, inline: true },
            { name: "Platform", value: platform === "java" ? "Java" : "Bedrock", inline: true },
            { name: "Java UUID", value: javaUuid ?? "Not applicable", inline: false },
            { name: "Java Preferred For Nickname", value: stored.javaUsername ? "Yes" : "No", inline: true },
            { name: "Stored Java Account", value: stored.javaUsername ?? "None", inline: true },
            { name: "Stored Bedrock Account", value: stored.bedrockUsername ?? "None", inline: true }
          )
          .setFooter({ text: "Giize Events Verification System" })
          .setTimestamp(),
      ],
    }).catch(error => logger.warn("Failed to send verification log.", error));
  }
}

export const verificationService = new VerificationService();
