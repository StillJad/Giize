import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { moderationService } from "../../services/moderation/ModerationService.js";
import type { Command } from "../../types/Command.js";
import { logger } from "../../utils/logger.js";
import { hasStaffRole, isAdministrator } from "../../utils/permissions.js";

const deleteMessageChoices = [
  { name: "0 hours", value: 0 },
  { name: "1 hour", value: 3600 },
  { name: "6 hours", value: 21600 },
  { name: "12 hours", value: 43200 },
  { name: "24 hours", value: 86400 },
  { name: "3 days", value: 259200 },
  { name: "7 days", value: 604800 },
];

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("adminmod")
    .setDescription("Administrator moderation actions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("ban")
        .setDescription("Ban a member.")
        .addUserOption(option => option.setName("user").setDescription("Member to ban.").setRequired(true))
        .addStringOption(option => option.setName("reason").setDescription("Reason for the ban.").setRequired(false).setMaxLength(1000))
        .addIntegerOption(option =>
          option
            .setName("delete_messages")
            .setDescription("How much recent message history to delete.")
            .setRequired(false)
            .addChoices(...deleteMessageChoices)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("kick")
        .setDescription("Kick a member.")
        .addUserOption(option => option.setName("user").setDescription("Member to kick.").setRequired(true))
        .addStringOption(option => option.setName("reason").setDescription("Reason for the kick.").setRequired(false).setMaxLength(1000))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("unban")
        .setDescription("Unban a user by Discord ID.")
        .addStringOption(option => option.setName("user_id").setDescription("Discord user ID to unban.").setRequired(true))
        .addStringOption(option => option.setName("reason").setDescription("Reason for the unban.").setRequired(false).setMaxLength(1000))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (!interaction.inGuild() || !isAdministrator(interaction.memberPermissions)) {
        logger.warn(`Denied admin moderation command. command=adminmod subcommand=${subcommand} userId=${interaction.user.id} hasAdministrator=${isAdministrator(interaction.memberPermissions)} hasStaffRole=${hasStaffRole(interaction.member)}`);
        await interaction.reply({ content: "You must be an administrator to use this command.", flags: 64 });
        return;
      }

      if (subcommand === "ban") {
        await moderationService.ban(
          interaction,
          interaction.options.getUser("user", true),
          interaction.options.getString("reason") ?? "No reason provided.",
          interaction.options.getInteger("delete_messages") ?? 0
        );
        return;
      }

      if (subcommand === "kick") {
        await moderationService.kick(
          interaction,
          interaction.options.getUser("user", true),
          interaction.options.getString("reason") ?? "No reason provided."
        );
        return;
      }

      if (subcommand === "unban") {
        await moderationService.unban(
          interaction,
          interaction.options.getString("user_id", true),
          interaction.options.getString("reason") ?? "No reason provided."
        );
      }
    } catch (error) {
      logger.error("Admin moderation command failed.", error, {
        type: "command",
        name: JSON.stringify({ command: "adminmod", subcommand, userId: interaction.user.id }),
      });

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong. Please try again.").catch(() => {});
      } else {
        await interaction.reply({ content: "Something went wrong. Please try again.", flags: 64 }).catch(() => {});
      }
    }
  },
};
