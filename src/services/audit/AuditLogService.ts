import {
  PermissionFlagsBits,
  type APIEmbedField,
  type Guild,
} from "discord.js";
import { config } from "../../config/config.js";
import { logger } from "../../utils/logger.js";
import { auditLogRenderer } from "./AuditLogRenderer.js";

export class AuditLogService {
  async send(guild: Guild, title: string, fields: APIEmbedField[]) {
    const channelId = config.auditLogsChannelId;
    if (!channelId) return;

    try {
      const channel = await guild.channels.fetch(channelId).catch(() => null);

      if (!channel?.isTextBased() || !("send" in channel)) {
        logger.warn(`Audit log skipped: channel ${channelId} missing or not text based.`);
        return;
      }

      const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
      const permissions = botMember ? channel.permissionsFor(botMember) : null;
      const missing = [
        permissions?.has(PermissionFlagsBits.ViewChannel) ? "" : "View Channel",
        permissions?.has(PermissionFlagsBits.SendMessages) ? "" : "Send Messages",
        permissions?.has(PermissionFlagsBits.EmbedLinks) ? "" : "Embed Links",
      ].filter(Boolean);

      if (missing.length > 0) {
        logger.warn(`Audit log skipped: missing ${missing.join(", ")} in ${channelId}.`);
        return;
      }

      await channel.send({ embeds: [auditLogRenderer.render(title, fields)] });
    } catch (error) {
      logger.warn("Failed to send audit log.", error);
    }
  }

  formatContent(value: string | null | undefined) {
    return auditLogRenderer.truncate(value?.trim() || "No content");
  }

  formatAttachments(attachments: Iterable<{ name: string | null; url: string }>) {
    const formatted = [...attachments].map(attachment => `${attachment.name ?? "attachment"} - ${attachment.url}`);
    return auditLogRenderer.truncate(formatted.length > 0 ? formatted.join("\n") : "None");
  }

  formatModerator(userId: string | null | undefined) {
    return userId ? `<@${userId}>` : "Unknown";
  }
}

export const auditLogService = new AuditLogService();
