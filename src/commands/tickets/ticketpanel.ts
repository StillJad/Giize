import {
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type TextChannel,
} from "discord.js";
import { giizeEmbed } from "../../utils/embeds.js";
import type { Command } from "../../types/Command.js";
import { ticketService } from "../../services/tickets/TicketService.js";
import { logger } from "../../utils/logger.js";
import { hasStaffRole, isAdministrator } from "../../utils/permissions.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Ticket panel commands.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    const subcommand = interaction.options.getSubcommand();

    try {
      if (!interaction.inGuild() || !isAdministrator(interaction.memberPermissions)) {
        logger.warn(`Denied ticket panel command. command=ticketpanel subcommand=${subcommand} userId=${interaction.user.id} hasAdministrator=${isAdministrator(interaction.memberPermissions)} hasStaffRole=${hasStaffRole(interaction.member)}`);
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
                  label: "Help",
                  description: "General questions or other assistance.",
                  emoji: "❓",
                  value: "help",
                }
              )
          ),
        ],
      });

      await interaction.reply({
        content: "Ticket panel sent successfully.",
        flags: 64,
      });
    } catch (error) {
      logger.error("Ticket command failed.", error, {
        type: "command",
        name: JSON.stringify({
          command: "ticketpanel",
          subcommand,
          userId: interaction.user.id,
          channelId: interaction.channelId,
          channelMetadataFound: ticketService.hasStandardTicketMetadata(interaction.channel),
        }),
      });

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply("Something went wrong. Please try again.").catch(() => {});
      } else {
        await interaction.reply({ content: "Something went wrong. Please try again.", flags: 64 }).catch(() => {});
      }
    }
  },
};
