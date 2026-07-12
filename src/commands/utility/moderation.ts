import { SlashCommandBuilder } from "discord.js";
import { moderationService } from "../../services/moderation/ModerationService.js";
import type { Command } from "../../types/Command.js";
import { logger } from "../../utils/logger.js";

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
    .setName("moderation")
    .setDescription("Moderate members.")
    .addSubcommand(subcommand =>
      subcommand
        .setName("warn")
        .setDescription("Warn a member.")
        .addUserOption(option => option.setName("user").setDescription("Member to warn.").setRequired(true))
        .addStringOption(option => option.setName("reason").setDescription("Reason for the warning.").setRequired(true).setMaxLength(1000))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("warnings")
        .setDescription("View a member's active warnings.")
        .addUserOption(option => option.setName("user").setDescription("Member to inspect.").setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("clear-warning")
        .setDescription("Clear one warning by ID.")
        .addIntegerOption(option => option.setName("warning_id").setDescription("Warning ID to clear.").setRequired(true).setMinValue(1))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("clear-warnings")
        .setDescription("Clear all warnings for a member.")
        .addUserOption(option => option.setName("user").setDescription("Member whose warnings should be cleared.").setRequired(true))
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
        .setName("unban")
        .setDescription("Unban a user by Discord ID.")
        .addStringOption(option => option.setName("user_id").setDescription("Discord user ID to unban.").setRequired(true))
        .addStringOption(option => option.setName("reason").setDescription("Reason for the unban.").setRequired(false).setMaxLength(1000))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("timeout")
        .setDescription("Timeout a member.")
        .addUserOption(option => option.setName("user").setDescription("Member to timeout.").setRequired(true))
        .addStringOption(option => option.setName("duration").setDescription("Duration like 10m, 1h, 2h 30m, 1d, or 7d.").setRequired(true))
        .addStringOption(option => option.setName("reason").setDescription("Reason for the timeout.").setRequired(false).setMaxLength(1000))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove-timeout")
        .setDescription("Remove a member's active timeout.")
        .addUserOption(option => option.setName("user").setDescription("Member to update.").setRequired(true))
        .addStringOption(option => option.setName("reason").setDescription("Reason for removing the timeout.").setRequired(false).setMaxLength(1000))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("nickname")
        .setDescription("Update or reset a member's nickname.")
        .addUserOption(option => option.setName("user").setDescription("Member to update.").setRequired(true))
        .addStringOption(option => option.setName("nickname").setDescription("New nickname. Omit to reset.").setRequired(false).setMaxLength(32))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "warn") {
        await moderationService.warn(
          interaction,
          interaction.options.getUser("user", true),
          interaction.options.getString("reason", true)
        );
        return;
      }

      if (subcommand === "warnings") {
        await moderationService.warnings(interaction, interaction.options.getUser("user", true));
        return;
      }

      if (subcommand === "clear-warning") {
        await moderationService.clearWarning(interaction, interaction.options.getInteger("warning_id", true));
        return;
      }

      if (subcommand === "clear-warnings") {
        await moderationService.requestClearWarnings(interaction, interaction.options.getUser("user", true));
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

      if (subcommand === "ban") {
        await moderationService.ban(
          interaction,
          interaction.options.getUser("user", true),
          interaction.options.getString("reason") ?? "No reason provided.",
          interaction.options.getInteger("delete_messages") ?? 0
        );
        return;
      }

      if (subcommand === "unban") {
        await moderationService.unban(
          interaction,
          interaction.options.getString("user_id", true),
          interaction.options.getString("reason") ?? "No reason provided."
        );
        return;
      }

      if (subcommand === "timeout") {
        await moderationService.timeout(
          interaction,
          interaction.options.getUser("user", true),
          interaction.options.getString("duration", true),
          interaction.options.getString("reason") ?? "No reason provided."
        );
        return;
      }

      if (subcommand === "remove-timeout") {
        await moderationService.removeTimeout(
          interaction,
          interaction.options.getUser("user", true),
          interaction.options.getString("reason") ?? "No reason provided."
        );
        return;
      }

      if (subcommand === "nickname") {
        await moderationService.nickname(
          interaction,
          interaction.options.getUser("user", true),
          interaction.options.getString("nickname")
        );
      }
    } catch (error) {
      logger.error("Moderation command failed.", error, {
        type: "command",
        name: JSON.stringify({ command: "moderation", subcommand, userId: interaction.user.id }),
      });

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong. Please try again.").catch(() => {});
      } else {
        await interaction.reply({ content: "Something went wrong. Please try again.", flags: 64 }).catch(() => {});
      }
    }
  },
};
