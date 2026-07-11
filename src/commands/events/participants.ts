import { SlashCommandBuilder } from "discord.js";
import { eventService } from "../../services/events/EventService.js";
import type { Command } from "../../types/Command.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("participants")
    .setDescription("View participants for an active event.")
    .addStringOption(option =>
      option
        .setName("event")
        .setDescription("Optional event title or event number.")
        .setRequired(false)
    ),

  async execute(interaction) {
    await eventService.participants(interaction, interaction.options.getString("event"));
  },
};
