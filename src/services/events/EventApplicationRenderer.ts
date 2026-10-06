import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { glurpsEmbed } from "../../utils/embeds.js";
import type { EventRecord } from "./EventRenderer.js";

export type EventApplicationStatus = "pending" | "accepted" | "rejected";
export type EventApplicationPriority = "Diamond" | "Iron" | "Dirt" | "Normal";
export type EventApplicationPlatform = "Java" | "Bedrock" | "Unverified";

export type EventApplicationRecord = {
  id: number;
  eventId: number;
  guildId: string;
  discordId: string;
  minecraftUsername: string;
  platform: EventApplicationPlatform;
  answerOne: string;
  answerTwo: string;
  status: EventApplicationStatus;
  priority: EventApplicationPriority;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
};

export class EventApplicationRenderer {
  renderTicketEmbed(event: EventRecord, application: EventApplicationRecord, mode: "automatic" | "manual" = "manual") {
    const minecraftAccount = application.platform === "Unverified"
      ? `${application.minecraftUsername} (not verified)`
      : application.minecraftUsername;
    const embed = glurpsEmbed()
      .setTitle("Event Application")
      .addFields(
        { name: "Event ID", value: `${event.eventNumber}`, inline: true },
        { name: "Event Name", value: event.title, inline: true },
        { name: "Applicant", value: `<@${application.discordId}>`, inline: true },
        { name: "Minecraft Account", value: minecraftAccount, inline: true },
        { name: "Platform", value: application.platform, inline: true },
        { name: "Priority", value: application.priority, inline: true },
        { name: "Status", value: this.statusLabel(application.status, mode), inline: false },
        { name: "Why should you play the event?", value: this.truncate(application.answerOne || "Not provided"), inline: false },
        { name: "What will you do in the event?", value: this.truncate(application.answerTwo || "Not provided"), inline: false }
      );

    if (mode === "automatic") {
      embed.setDescription("Supporter priority caused this application to be automatically accepted.");
    }

    return embed;
  }

  renderReviewComponents(applicationId: number, disabled: boolean) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`event_app_accept:${applicationId}`)
          .setEmoji("✅")
          .setLabel("Accept")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`event_app_reject:${applicationId}`)
          .setEmoji("❌")
          .setLabel("Deny")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
        new ButtonBuilder().setCustomId(`event_app_reset:${applicationId}`).setLabel("Set Pending").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`event_app_edit:${applicationId}`).setLabel("Edit Username").setStyle(ButtonStyle.Secondary).setDisabled(disabled)
      ),
    ];
  }

  renderLogEmbed(event: EventRecord, application: EventApplicationRecord, action: string, reviewerId: string | null, automatic: boolean) {
    const minecraftAccount = application.platform === "Unverified"
      ? `${application.minecraftUsername} (not verified)`
      : application.minecraftUsername;
    return glurpsEmbed()
      .setTitle("Event Application")
      .addFields(
        { name: "Action", value: action, inline: true },
        { name: "Event ID", value: `${event.eventNumber}`, inline: true },
        { name: "Event Name", value: event.title, inline: true },
        { name: "Applicant", value: `<@${application.discordId}>`, inline: true },
        { name: "Minecraft Account", value: minecraftAccount, inline: true },
        { name: "Platform", value: application.platform, inline: true },
        { name: "Priority", value: application.priority, inline: true },
        { name: "Status", value: this.statusLabel(application.status, automatic ? "automatic" : "manual"), inline: true },
        { name: "Reviewed By", value: reviewerId ? `<@${reviewerId}>` : "Not reviewed", inline: true },
        { name: "Automatic or Manual", value: automatic ? "Automatic" : "Manual", inline: true },
        { name: "Timestamp", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      );
  }

  statusLabel(status: EventApplicationStatus, mode: "automatic" | "manual" = "manual") {
    if (status === "pending") return "🟡 Pending Review";
    if (status === "accepted" && mode === "automatic") return "✅ Automatically Accepted";
    if (status === "accepted") return "✅ Accepted";
    return "❌ Rejected";
  }

  private truncate(value: string) {
    return value.length > 1000 ? `${value.slice(0, 997)}...` : value;
  }
}

export const eventApplicationRenderer = new EventApplicationRenderer();
