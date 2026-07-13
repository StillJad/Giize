import type { APIEmbedField } from "discord.js";
import { giizeEmbed } from "../../utils/embeds.js";
import type { AutoModConfig, AutoModLogData } from "./AutoModService.js";

export class AutoModRenderer {
  renderStatus(config: AutoModConfig, bannedWordCount: number, allowedDomainCount: number) {
    return giizeEmbed()
      .setTitle("AutoMod Status")
      .addFields(
        { name: "Enabled", value: config.enabled ? "Yes" : "No", inline: true },
        { name: "Spam", value: config.spamEnabled ? "On" : "Off", inline: true },
        { name: "Duplicates", value: config.duplicateEnabled ? "On" : "Off", inline: true },
        { name: "Mention Limit", value: `${config.mentionLimit}`, inline: true },
        { name: "Emoji Limit", value: `${config.emojiLimit}`, inline: true },
        { name: "Invite Links", value: config.inviteLinksEnabled ? "Blocked" : "Allowed", inline: true },
        { name: "External Links", value: config.externalLinksEnabled ? "Blocked" : "Allowed", inline: true },
        { name: "Timeout", value: config.timeoutMinutes > 0 ? `${config.timeoutMinutes} minutes` : "Disabled", inline: true },
        { name: "Log Channel", value: config.logChannelId ? `<#${config.logChannelId}>` : "Audit log fallback", inline: true },
        { name: "Banned Words", value: `${bannedWordCount}`, inline: true },
        { name: "Allowed Domains", value: `${allowedDomainCount}`, inline: true }
      );
  }

  renderLog(data: AutoModLogData) {
    const fields: APIEmbedField[] = [
      { name: "User", value: `<@${data.userId}> (${data.userId})`, inline: true },
      { name: "Rule", value: data.rule, inline: true },
      { name: "Action", value: data.action, inline: true },
      { name: "Channel", value: `<#${data.channelId}>`, inline: true },
      { name: "Reason", value: data.reason, inline: false },
      { name: "Warning Count", value: `${data.warningCount}`, inline: true },
      { name: "Timeout Duration", value: data.timeoutDuration, inline: true },
      { name: "Message ID", value: data.messageId, inline: true },
      { name: "Message", value: this.truncate(data.messageContent || "No text content"), inline: false },
    ];

    if (data.attachments) {
      fields.push({ name: "Attachments", value: this.truncate(data.attachments), inline: false });
    }

    return giizeEmbed()
      .setTitle("AutoMod Action")
      .addFields(fields);
  }

  truncate(value: string, maxLength = 1000) {
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
  }
}

export const autoModRenderer = new AutoModRenderer();
