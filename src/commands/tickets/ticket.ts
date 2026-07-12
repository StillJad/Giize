import { SlashCommandBuilder } from "discord.js";
import { ticketService } from "../../services/tickets/TicketService.js";
import type { TicketType } from "../../services/tickets/TicketRenderer.js";
import type { Command } from "../../types/Command.js";

const ticketTypes: TicketType[] = ["Support", "Report", "Appeal", "Builder", "Media"];

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket system.")
    .addSubcommand(subcommand =>
      subcommand
        .setName("open")
        .setDescription("Open a private ticket.")
        .addStringOption(option =>
          option
            .setName("type")
            .setDescription("Ticket type.")
            .setRequired(true)
            .addChoices(...ticketTypes.map(type => ({ name: type, value: type })))
        )
        .addStringOption(option =>
          option
            .setName("reason")
            .setDescription("Reason for opening this ticket.")
            .setRequired(true)
            .setMaxLength(1000)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "open") {
      await ticketService.open(
        interaction,
        interaction.options.getString("type", true) as TicketType,
        interaction.options.getString("reason", true)
      );
    }
  },
};
