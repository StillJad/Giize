import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

import type { Command } from "../../types/Command.js";
import { giizeEmbed } from "../../utils/embeds.js";
import { VerificationService } from "../../services/verification/VerificationService.js";
import { minecraftProfileService } from "../../services/verification/MinecraftProfileService.js";
import { logger } from "../../utils/logger.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify your Minecraft account.")
    .addStringOption(option =>
      option
        .setName("minecraft_username")
        .setDescription("Your Minecraft username (Java or Bedrock)")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Platform")
        .addChoices(
          { name: "Java", value: "java" },
          { name: "Bedrock", value: "bedrock" }
        )
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const username = interaction.options.getString("minecraft_username", true);

    const platform = interaction.options.getString(
      "platform",
      true
    ) as "java" | "bedrock";
    const platformLabel = platform === "java" ? "Java" : "Bedrock";

    let normalized = username.trim();
    let nicknameAfterVerification = normalized;
    let javaUuid = "";
    let javaLookupRun = false;
    let validationFailureReason = "none";

    if (platform === "java") {
      javaLookupRun = true;
      const result = await minecraftProfileService.checkJavaUsername(normalized);

      if (!result.exists) {
        validationFailureReason = result.reason;
        logger.info(`Verification validation: platform=${platform} submitted="${username}" normalized="${normalized}" javaLookupRun=${javaLookupRun} validationFailureReason=${validationFailureReason}`);
        await interaction.editReply({
          content: result.reason === "network"
            ? "Minecraft account lookup is temporarily unavailable. Please try again later."
            : "",
          embeds: result.reason === "network" ? [] : [VerificationService.failureEmbed()],
        });
        return;
      }

      normalized = result.canonicalUsername;
      nicknameAfterVerification = normalized;
      javaUuid = result.uuid;
    } else {
      const result = VerificationService.validateBedrockUsername(username);

      if (!result.valid) {
        validationFailureReason = result.reason;
        logger.info(`Verification validation: platform=${platform} submitted="${username}" normalized="${normalized}" javaLookupRun=${javaLookupRun} validationFailureReason=${validationFailureReason}`);
        await interaction.editReply({
          content: "",
          embeds: [VerificationService.bedrockFailureEmbed()],
        });
        return;
      }

      normalized = result.cleanUsername;
      nicknameAfterVerification = result.nickname;
    }

    logger.info(`Verification validation: platform=${platform} submitted="${username}" normalized="${normalized}" javaLookupRun=${javaLookupRun} validationFailureReason=${validationFailureReason}`);

    const embed = giizeEmbed()
      .setTitle("Verify Minecraft Account")
      .setDescription("Please confirm that this is your Minecraft account before continuing.")
      .addFields(
        { name: "Minecraft Username", value: normalized, inline: true },
        { name: "Platform", value: platformLabel, inline: true },
        { name: "Nickname After Verification", value: nicknameAfterVerification, inline: false }
      )
      .setFooter({ text: "Giize Events Verification System" });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`verify_yes:${platform}:${javaUuid || "none"}:${encodeURIComponent(normalized)}`)
        .setLabel("Confirm Verification")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("verify_no")
        .setLabel("Cancel")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  }
};
