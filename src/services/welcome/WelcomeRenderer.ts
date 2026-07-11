import type { GuildMember, User } from "discord.js";
import { config } from "../../config/config.js";
import { giizeEmbed } from "../../utils/embeds.js";

type PlaceholderTarget = GuildMember | User;

export class WelcomeRenderer {
  render(target: PlaceholderTarget) {
    const embed = giizeEmbed()
      .setTitle(this.replacePlaceholders("Welcome {username} to Giize Events!", target))
      .setDescription(this.replacePlaceholders(
`Welcome {mention} to Giize Events!
There are now {membercount} members.

Useful Channels:

📋 {rules_channel}
❓ {about_channel}
🎭 {roles_channel}
⚔️ {bedrock_channel}
📢 {announcements_channel}
💎 {ip_channel}`,
        target
      ));

    if (config.welcomeBannerUrl) {
      embed.setImage(config.welcomeBannerUrl);
    }

    return embed;
  }

  private replacePlaceholders(value: string, target: PlaceholderTarget) {
    const user = "user" in target ? target.user : target;
    const guild = "guild" in target ? target.guild : undefined;

    return value
      .replaceAll("{user}", user.tag)
      .replaceAll("{username}", user.username)
      .replaceAll("{mention}", `${user}`)
      .replaceAll("{server}", guild?.name ?? "this server")
      .replaceAll("{membercount}", String(guild?.memberCount ?? 0))
      .replaceAll("{rules_channel}", this.channelMention(config.rulesChannelId))
      .replaceAll("{about_channel}", this.channelMention(config.aboutChannelId))
      .replaceAll("{roles_channel}", this.channelMention(config.rolesChannelId))
      .replaceAll("{bedrock_channel}", this.channelMention(config.bedrockChannelId))
      .replaceAll("{announcements_channel}", this.channelMention(config.announcementsChannelId))
      .replaceAll("{ip_channel}", this.channelMention(config.ipChannelId));
  }

  private channelMention(channelId: string) {
    return channelId ? `<#${channelId}>` : "Not configured";
  }
}

export const welcomeRenderer = new WelcomeRenderer();
