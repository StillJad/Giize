import {
  SlashCommandBuilder,
  PermissionFlagsBits
} from "discord.js";

import type { Command } from "../../types/Command.js";
import { giizeEmbed } from "../../utils/embeds.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("View Giize Bot setup guidance.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = giizeEmbed()
      .setTitle("⚙️ Giize Setup")
      .setDescription(
`Use these commands to configure Giize Bot:

• /welcome setup
• /verification setup
• /server
• /status`
      );

    await interaction.reply({
      embeds: [embed],
      flags: 64
    });
  }
};
