import {
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  GuildMember,
  type TextChannel,
} from "discord.js";
import { giizeEmbed } from "../../utils/embeds.js";
import type { Command } from "../../types/Command.js";

const ticketStaffRoleId = "1513916326400495838";

function canCreateTicketPanel(member: unknown) {
  return (
    member instanceof GuildMember &&
    (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.has(ticketStaffRoleId)
    )
  );
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Ticket panel commands.")
    .addSubcommand(subcommand =>
      subcommand
        .setName("send")
        .setDescription("Send a public ticket panel.")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel where the ticket panel will be posted.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName("title")
            .setDescription("Panel title.")
            .setRequired(false)
            .setMaxLength(256)
        )
        .addStringOption(option =>
          option
            .setName("description")
            .setDescription("Panel description.")
            .setRequired(false)
            .setMaxLength(4000)
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !canCreateTicketPanel(interaction.member)) {
      await interaction.reply({
        content: "You don't have permission to create ticket panels.",
        flags: 64,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel", true) as TextChannel;
    const title = interaction.options.getString("title") ?? "Ticket 🎟️";
    const description = interaction.options.getString("description") ?? "Select a ticket type below!";

    await channel.send({
      embeds: [
        giizeEmbed()
          .setTitle(title)
          .setDescription(description),
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ticket_panel_select")
            .setPlaceholder("Make a selection")
            .addOptions(
              {
                label: "Support",
                description: "Get help from the staff team.",
                emoji: "🎫",
                value: "support",
              },
              {
                label: "Player Report",
                description: "Report a player or rule violation.",
                emoji: "🚨",
                value: "report",
              },
              {
                label: "Appeal",
                description: "Appeal a punishment or staff action.",
                emoji: "⚖️",
                value: "appeal",
              }
            )
        ),
      ],
    });

    await interaction.reply({
      content: "Ticket panel sent successfully.",
      flags: 64,
    });
  },
};
