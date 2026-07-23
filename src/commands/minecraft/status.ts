import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types/Command.js";
import { config } from "../../config/config.js";
import { giizeEmbed } from "../../utils/embeds.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Checks the Glurps Events Minecraft server status."),
  async execute(interaction) {
    await interaction.deferReply();

    try {
      const res = await fetch(`https://api.mcstatus.io/v2/status/java/${config.mcHost}:${config.mcPort}`);
      const data = await res.json();

      const embed = giizeEmbed()
        .setTitle(data.online ? "🟢 Glurps Events is Online" : "🔴 Glurps Events is Offline")
        .addFields(
          { name: "IP", value: `\`${config.mcHost}\``, inline: true },
          { name: "Port", value: `\`${config.mcPort}\``, inline: true },
          { name: "Players", value: `\`${data.players?.online ?? 0}/${data.players?.max ?? 0}\``, inline: true },
          { name: "Version", value: `\`${data.version?.name_clean ?? "Unknown"}\``, inline: true },
          { name: "MOTD", value: data.motd?.clean || "No MOTD" }
        );

      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply({
        embeds: [
          giizeEmbed()
            .setTitle("🔴 Status Check Failed")
            .setDescription("Could not reach the status API.")
        ]
      });
    }
  }
};
