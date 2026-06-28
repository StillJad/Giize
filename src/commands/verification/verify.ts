import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

import type { Command } from "../../types/Command.js";
import { giizeEmbed } from "../../utils/embeds.js";
import { VerificationService } from "../../services/verification/VerificationService.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify your Minecraft account.")
    .addStringOption(option =>
      option
        .setName("username")
        .setDescription("Minecraft Username")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Java or Bedrock")
        .addChoices(
          { name: "Java", value: "java" },
          { name: "Bedrock", value: "bedrock" }
        )
        .setRequired(true)
    ),

  async execute(interaction) {
    const username = interaction.options.getString("username", true);

    const platform = interaction.options.getString(
      "platform",
      true
    ) as "Java" | "Bedrock";

    const normalized = VerificationService.normalizeUsername(
      username,
      platform
    );

    const embed = giizeEmbed()
      .setTitle("🔐 Confirm Verification")
      .setDescription(
`**Username**
${normalized}

**Platform**
${platform}

Is this information correct?`
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`verify_yes:${normalized}`)
        .setLabel("Confirm")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("verify_no")
        .setLabel("Cancel")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: 64
    });
  }
};