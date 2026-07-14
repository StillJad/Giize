import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type TextChannel } from "discord.js";
import { moderationService } from "../../services/moderation/ModerationService.js";
import type { Command } from "../../types/Command.js";
import { logger } from "../../utils/logger.js";
import { hasStaffRole, isAdministrator } from "../../utils/permissions.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("channel")
    .setDescription("Manage channel permissions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("lock")
        .setDescription("Deny Send Messages for everyone.")
        .addChannelOption(option =>
          option.setName("channel").setDescription("Channel to lock. Defaults to this channel.").addChannelTypes(ChannelType.GuildText).setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("unlock")
        .setDescription("Restore Send Messages to inherited permissions.")
        .addChannelOption(option =>
          option.setName("channel").setDescription("Channel to unlock. Defaults to this channel.").addChannelTypes(ChannelType.GuildText).setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("slowmode")
        .setDescription("Set channel slowmode.")
        .addIntegerOption(option =>
          option.setName("seconds").setDescription("Slowmode seconds. Use 0 to disable.").setRequired(true).setMinValue(0).setMaxValue(21600)
        )
        .addChannelOption(option =>
          option.setName("channel").setDescription("Channel to update. Defaults to this channel.").addChannelTypes(ChannelType.GuildText).setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("hide")
        .setDescription("Deny View Channel for everyone.")
        .addChannelOption(option =>
          option.setName("channel").setDescription("Channel to hide. Defaults to this channel.").addChannelTypes(ChannelType.GuildText).setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("show")
        .setDescription("Restore View Channel to inherited permissions.")
        .addChannelOption(option =>
          option.setName("channel").setDescription("Channel to show. Defaults to this channel.").addChannelTypes(ChannelType.GuildText).setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const channel = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel | null;

    try {
      if (!interaction.inGuild() || !isAdministrator(interaction.memberPermissions)) {
        logger.warn(`Denied channel command. command=channel subcommand=${subcommand} userId=${interaction.user.id} hasAdministrator=${isAdministrator(interaction.memberPermissions)} hasStaffRole=${hasStaffRole(interaction.member)}`);
        await interaction.reply({ content: "You must be an administrator to use this command.", flags: 64 });
        return;
      }

      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: "This command can only be used in a text channel.", flags: 64 });
        return;
      }

      if (subcommand === "lock") {
        await moderationService.lock(interaction, channel);
        return;
      }

      if (subcommand === "unlock") {
        await moderationService.unlock(interaction, channel);
        return;
      }

      if (subcommand === "slowmode") {
        await moderationService.slowmode(interaction, channel, interaction.options.getInteger("seconds", true));
        return;
      }

      if (subcommand === "hide") {
        await moderationService.hide(interaction, channel);
        return;
      }

      if (subcommand === "show") {
        await moderationService.show(interaction, channel);
      }
    } catch (error) {
      logger.error("Channel command failed.", error, {
        type: "command",
        name: JSON.stringify({ command: "channel", subcommand, userId: interaction.user.id, channelId: channel?.id }),
      });

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong. Please try again.").catch(() => {});
      } else {
        await interaction.reply({ content: "Something went wrong. Please try again.", flags: 64 }).catch(() => {});
      }
    }
  },
};
