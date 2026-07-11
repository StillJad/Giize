import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types/Command.js";
import { giizeEmbed } from "../../utils/embeds.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows Giize Bot commands."),
  async execute(interaction) {
    const embed = giizeEmbed()
      .setTitle("Giize Bot Help")
      .setDescription("Your Minecraft event server assistant.")
      .addFields(
        { name: "Minecraft", value: "`/server` `/status`" },
        { name: "Utility", value: "`/help` `/ping`" },
        { name: "Server", value: "`/event` `/ticket` `/welcome preview`" }
      );

    await interaction.reply({ embeds: [embed], flags: 64 });
  }
};
