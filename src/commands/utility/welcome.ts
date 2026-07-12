import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { welcomeService } from "../../services/welcome/WelcomeService.js";
import type { Command } from "../../types/Command.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Welcome system.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("setup")
        .setDescription("Configure the welcome system.")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel for welcome messages.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName("title")
            .setDescription("Welcome embed title.")
            .setRequired(true)
            .setMaxLength(256)
        )
        .addStringOption(option =>
          option
            .setName("description")
            .setDescription("Welcome embed description.")
            .setRequired(true)
            .setMaxLength(4000)
        )
        .addRoleOption(option =>
          option
            .setName("role")
            .setDescription("Optional role to give new members.")
        )
        .addStringOption(option =>
          option
            .setName("image")
            .setDescription("Optional welcome image URL.")
        )
        .addStringOption(option =>
          option
            .setName("thumbnail")
            .setDescription("Optional thumbnail URL.")
        )
        .addStringOption(option =>
          option
            .setName("color")
            .setDescription("Optional embed color, like #5865F2.")
            .setMaxLength(7)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("preview")
        .setDescription("Preview the configured welcome message.")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("disable")
        .setDescription("Disable welcome messages for this server.")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("enable")
        .setDescription("Enable welcome messages for this server.")
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ content: "❌ This command can only be used in a server.", flags: 64 });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") {
      const color = interaction.options.getString("color");

      if (color && !/^#[0-9a-f]{6}$/i.test(color)) {
        await interaction.reply({ content: "❌ Color must be a hex value like #5865F2.", flags: 64 });
        return;
      }

      await welcomeService.saveConfig({
        guildId: interaction.guild.id,
        channelId: interaction.options.getChannel("channel", true).id,
        title: interaction.options.getString("title", true),
        description: interaction.options.getString("description", true),
        roleId: interaction.options.getRole("role")?.id,
        imageUrl: interaction.options.getString("image"),
        thumbnailUrl: interaction.options.getString("thumbnail"),
        color,
      });

      await interaction.reply({ content: "✅ Welcome system configured.", flags: 64 });
      return;
    }

    if (subcommand === "preview") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const embed = await welcomeService.preview(interaction.guild, member);

      if (!embed) {
        await interaction.reply({ content: "❌ Welcome system is not configured.", flags: 64 });
        return;
      }

      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    if (subcommand === "disable") {
      await welcomeService.disable(interaction.guild.id);
      await interaction.reply({ content: "✅ Welcome system disabled.", flags: 64 });
      return;
    }

    if (subcommand === "enable") {
      await welcomeService.enable(interaction.guild.id);
      await interaction.reply({ content: "Welcome messages are now enabled.", flags: 64 });
    }
  },
};
