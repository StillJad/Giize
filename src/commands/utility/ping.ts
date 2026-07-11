import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types/Command.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Checks Giize Bot latency."),
  async execute(interaction) {
    await interaction.reply({
      content: `Pong! ${interaction.client.ws.ping}ms`,
      flags: 64
    });
  }
};
