import { type APIEmbedField, type GuildMember, type User } from "discord.js";
import { giizeEmbed } from "../../utils/embeds.js";

export type ModerationLogData = {
  action: string;
  target: string;
  moderator: string;
  reason?: string | null;
  channel?: string | null;
  duration?: string | null;
};

export class ModerationRenderer {
  warningDm(moderator: GuildMember, reason: string) {
    return giizeEmbed()
      .setTitle("Moderation Warning")
      .setDescription(`You received a warning in ${moderator.guild.name}.`)
      .addFields(
        { name: "Moderator", value: `${moderator.user}`, inline: true },
        { name: "Reason", value: reason, inline: false }
      );
  }

  actionDm(title: string, guildName: string, reason: string) {
    return giizeEmbed()
      .setTitle(title)
      .setDescription(`This action was taken in ${guildName}.`)
      .addFields({ name: "Reason", value: reason, inline: false });
  }

  warnings(target: User, fields: APIEmbedField[]) {
    return giizeEmbed()
      .setTitle("Moderation Warnings")
      .setDescription(`Active warnings for ${target}.`)
      .addFields(fields.length > 0 ? fields : [{ name: "No Warnings", value: "This member has no active warnings." }]);
  }

  logFields(data: ModerationLogData): APIEmbedField[] {
    return [
      { name: "Action", value: data.action, inline: true },
      { name: "Target", value: data.target, inline: true },
      { name: "Moderator", value: data.moderator, inline: true },
      { name: "Reason", value: data.reason?.trim() || "No reason provided.", inline: false },
      { name: "Channel", value: data.channel || "Not applicable", inline: true },
      { name: "Duration", value: data.duration || "Not applicable", inline: true },
      { name: "Timestamp", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
    ];
  }
}

export const moderationRenderer = new ModerationRenderer();
