import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { giizeEmbed } from "../../utils/embeds.js";

export class PurgeRenderer {
  renderPreview(matchCount: number, filters: string[], requiresExtraConfirmation: boolean) {
    return {
      embeds: [
        giizeEmbed()
          .setTitle("Purge Preview")
          .setDescription([
            "About to delete:",
            "",
            `${matchCount} matching messages`,
            "",
            "Filters:",
            filters.length > 0 ? filters.map(filter => `• ${filter}`).join("\n") : "• none",
            requiresExtraConfirmation ? "\nLarge purge: an extra confirmation is required." : "",
          ].filter(Boolean).join("\n")),
      ],
    };
  }

  renderConfirmRows(purgeId: string, extraConfirmation = false) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`purge_confirm:${purgeId}:${extraConfirmation ? "final" : "preview"}`)
          .setLabel(extraConfirmation ? "Delete" : "Delete")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`purge_cancel:${purgeId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary)
      ),
    ];
  }

  renderExtraConfirmation(filters: string[]) {
    return {
      embeds: [
        giizeEmbed()
          .setTitle("Confirm Large Purge")
          .setDescription([
            "This purge targets 250 or more messages.",
            "",
            "Press Delete again to confirm.",
            "",
            "Filters:",
            filters.length > 0 ? filters.map(filter => `• ${filter}`).join("\n") : "• none",
          ].join("\n")),
      ],
    };
  }
}

export const purgeRenderer = new PurgeRenderer();
