import type { GuildMember, User } from "discord.js";
import { config } from "../../config/config.js";
import { glurpsEmbed } from "../../utils/embeds.js";

type PlaceholderTarget = GuildMember | User;

export const welcomeTitle = "Welcome, {username}! 👋";
export const welcomeDescription = `Welcome to **Glurps**! Glad to have you here.

Take a moment to read {rules}, then keep an eye on {announcements} for upcoming events.

You're member #{membercount}.

Make yourself at home — see you at the next event!`;

export class WelcomeRenderer {
  render(target: PlaceholderTarget) {
    const embed = glurpsEmbed()
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
      .replaceAll("{rules}", this.channelMention(config.rulesChannelId, "the rules"))
      .replaceAll("{announcements}", this.channelMention(config.announcementsChannelId, "announcements"));
  }

  private channelMention(channelId: string, fallback: string) {
    return channelId ? `<#${channelId}>` : fallback;
  }
}

export const welcomeRenderer = new WelcomeRenderer();
