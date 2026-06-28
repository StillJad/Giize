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
        { name: "Minecraft", value: "`/ip` `/status`" },
        { name: "Utility", value: "`/help` `/ping`" },
        { name: "Server", value: "`/welcome test` `/roles panel`" }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
