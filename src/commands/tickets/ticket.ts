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
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("close")
        .setDescription("Close the current ticket.")
        .addStringOption(option =>
          option
            .setName("reason")
            .setDescription("Reason for closing this ticket.")
            .setRequired(true)
            .setMaxLength(1000)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Add a user to the current ticket.")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User to add.")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Remove a user from the current ticket.")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User to remove.")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("rename")
        .setDescription("Rename the current ticket.")
        .addStringOption(option =>
          option
            .setName("name")
            .setDescription("New ticket name.")
            .setRequired(true)
            .setMaxLength(80)
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
      return;
    }

    if (subcommand === "close") {
      await ticketService.closeFromCommand(interaction, interaction.options.getString("reason", true));
      return;
    }

    if (subcommand === "add") {
      await ticketService.addUser(interaction, interaction.options.getUser("user", true));
      return;
    }

    if (subcommand === "remove") {
      await ticketService.removeUser(interaction, interaction.options.getUser("user", true));
      return;
    }

    if (subcommand === "rename") {
      await ticketService.rename(interaction, interaction.options.getString("name", true));
    }
  },
};
