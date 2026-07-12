import type { GuildMember, User } from "discord.js";
import { config } from "../../config/config.js";
import { giizeEmbed } from "../../utils/embeds.js";

type PlaceholderTarget = GuildMember | User;

export const welcomeTitle = "Welcome, {username}! 👋";
export const welcomeDescription = `We're glad you're here!

Here's everything you need to get started:

📋 {rules}
❓ {about}
🎭 {roles}
⚔️ {bedrock}
📢 {announcements}
💎 {ip}

You're member #{membercount} of Giize Events.

Enjoy your stay!`;

export class WelcomeRenderer {
  render(target: PlaceholderTarget) {
    const embed = giizeEmbed()
      .setTitle(this.replacePlaceholders(welcomeTitle, target))
      .setDescription(this.replacePlaceholders(welcomeDescription, target));

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
      .replaceAll("{rules}", this.channelMention(config.rulesChannelId))
      .replaceAll("{about}", this.channelMention(config.aboutChannelId))
      .replaceAll("{roles}", this.channelMention(config.rolesChannelId))
      .replaceAll("{bedrock}", this.channelMention(config.bedrockChannelId))
      .replaceAll("{announcements}", this.channelMention(config.announcementsChannelId))
      .replaceAll("{ip}", this.channelMention(config.ipChannelId))
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
