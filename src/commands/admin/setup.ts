import {
  SlashCommandBuilder,
  PermissionFlagsBits
} from "discord.js";

import type { Command } from "../../types/Command.js";
import { giizeEmbed } from "../../utils/embeds.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Setup Giize Bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = giizeEmbed()
      .setTitle("⚙️ Giize Setup")
      .setDescription(
`This wizard is not finished yet.

Upcoming:

• Welcome
• Tickets
• Roles
• Verification
• Minecraft
• Logs`
      );

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};