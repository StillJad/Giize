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
    )
    .addSubcommand(sub =>
      sub.setName("test").setDescription("Send a fake verification log.")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "setup") {
      await interaction.reply({
        embeds: [
          giizeEmbed()
            .setTitle("🔐 Verification Setup")
            .setDescription("Configure these verification settings:\n\n• Verified Role\n• Log Channel\n• Auto Nicknames"),
        ],
        flags: 64,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        giizeEmbed()
          .setTitle("✅ Test Verification")
          .addFields(
            { name: "Discord", value: `${interaction.user}`, inline: true },
            { name: "Minecraft Username", value: "Notch", inline: true },
            { name: "Platform", value: "Java", inline: true }
          ),
      ],
      flags: 64,
    });
  },
};
