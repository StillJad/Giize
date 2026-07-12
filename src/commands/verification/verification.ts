import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";

import type { Command } from "../../types/Command.js";
import { giizeEmbed } from "../../utils/embeds.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("verification")
    .setDescription("Verification settings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName("setup").setDescription("Configure verification.")
    ),

  async execute(interaction) {
    await interaction.reply({
      embeds: [
        giizeEmbed()
          .setTitle("🔐 Verification Setup")
          .setDescription("Configure these verification settings:\n\n• Verified Role\n• Log Channel\n• Auto Nicknames"),
      ],
      flags: 64,
    });
  },
};
