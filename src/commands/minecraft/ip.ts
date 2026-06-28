import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types/Command.js";
import { giizeEmbed } from "../../utils/embeds.js";
import { config } from "../../config/config.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ip")
    .setDescription("Shows the Giize Events Minecraft server IP."),
  async execute(interaction) {
    const embed = giizeEmbed()
      .setTitle("Giize Events Server")
      .addFields(
        { name: "IP", value: `\`${config.mcHost}\``, inline: true },
        { name: "Port", value: `\`${config.mcPort}\``, inline: true },
        { name: "Crossplay", value: "Java + Bedrock supported" }
      );

    await interaction.reply({ embeds: [embed] });
  }
};
