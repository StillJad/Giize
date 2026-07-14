import { SlashCommandBuilder } from "discord.js";
import { eventService } from "../../services/events/EventService.js";
import type { Command } from "../../types/Command.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("events")
    .setDescription("View Giize events.")
    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("List events.")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "list") {
      await eventService.list(interaction);
    }
  },
};
