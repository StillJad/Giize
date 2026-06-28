import {
  SlashCommandBuilder,
  PermissionFlagsBits
} from "discord.js";

import type { Command } from "../../types/Command.js";
import { WelcomeService } from "../../services/welcome/WelcomeService.js";
import { config } from "../../config/config.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Welcome commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName("test")
        .setDescription("Preview the welcome embed")
    ),

  async execute(interaction) {
    const embed = WelcomeService.create(
      interaction.user.username,
      interaction.user.displayAvatarURL(),
      config.welcomeImageUrl
    );

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};