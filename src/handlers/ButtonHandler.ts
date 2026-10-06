import { Events, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, GuildMember, PermissionFlagsBits, type ButtonInteraction } from "discord.js";
import { levelService } from "../services/community/LevelService.js";
import { client } from "../client.js";
import { eventApplicationRouter } from "../services/events/EventApplicationRouter.js";
import { eventRouter } from "../services/events/EventRouter.js";
import { safeReply } from "../services/tickets/interactionResponses.js";
import { ticketService } from "../services/tickets/TicketService.js";
import { ticketRouter } from "../services/tickets/TicketRouter.js";
import { VerificationService, verificationService } from "../services/verification/VerificationService.js";
import { purgeService } from "../services/purge/PurgeService.js";
import { moderationService } from "../services/moderation/ModerationService.js";
import { glurpsEmbed } from "../utils/embeds.js";
import { logger } from "../utils/logger.js";

async function safeUpdate(
  interaction: ButtonInteraction,
  options: Parameters<ButtonInteraction["update"]>[0]
) {
  if (!interaction.replied && !interaction.deferred) {
    await interaction.update(options);
    return;
  }

  await interaction.editReply(options);
}

function canManageTickets(interaction: ButtonInteraction): boolean {
  if (!interaction.inGuild() || !(interaction.member instanceof GuildMember)) {
    return false;
  }

  return (
    interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
    interaction.member.roles.cache.has("1513916326400495838")
  );
}

function decodeVerificationUsername(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isButton()) return;
    if (interaction.customId === "account_verify") {
      await interaction.showModal(new ModalBuilder().setCustomId("account_verify_submit").setTitle("Minecraft Verification").addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("username").setLabel("Minecraft username / Bedrock gamertag").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("platform").setLabel("Edition: Java or Bedrock").setStyle(TextInputStyle.Short).setValue("Java").setRequired(true).setMaxLength(7)))); return;
    }
    if (interaction.customId.startsWith("levels_")) { await levelService.button(interaction); return; }

    if (interaction.customId.startsWith("purge_confirm:")) {
      const [, purgeId, stage] = interaction.customId.split(":");
      await purgeService.confirm(interaction, purgeId, stage === "final");
      return;
    }

    if (interaction.customId.startsWith("purge_cancel:")) {
      const [, purgeId] = interaction.customId.split(":");
      await purgeService.cancel(interaction, purgeId);
      return;
    }

    if (interaction.customId.startsWith("moderation_clear_warnings_confirm:")) {
      const confirmationId = interaction.customId.substring("moderation_clear_warnings_confirm:".length);
      await moderationService.confirmClearWarnings(interaction, confirmationId);
      return;
    }

    if (interaction.customId.startsWith("moderation_clear_warnings_cancel:")) {
      const confirmationId = interaction.customId.substring("moderation_clear_warnings_cancel:".length);
      await moderationService.cancelClearWarnings(interaction, confirmationId);
      return;
    }

    if (
      interaction.customId.startsWith("event_apply:")
      || interaction.customId.startsWith("event_apply_form:")
      || interaction.customId.startsWith("event_app_")
    ) {
      await eventApplicationRouter.handleButton(interaction);
      return;
    }

    if (interaction.customId.startsWith("event_")) {
      await eventRouter.handleButton(interaction);
      return;
    }

    if (interaction.customId === "ticket_claim" || interaction.customId === "ticket_unclaim" || interaction.customId.startsWith("ticket_confirm:") || interaction.customId.startsWith("ticket_cancel:")) {
      await ticketService.handleManagementButton(interaction);return;
    }
    if (interaction.customId === "ticket_close") {
      if (!canManageTickets(interaction)) {
        await safeReply(interaction, { content: "Only ticket staff can close tickets.", flags: 64 });
        return;
      }

      await ticketRouter.handleCloseButton(interaction);
      return;
    }

    if (interaction.customId === "ticket_close_reason") {
      if (!canManageTickets(interaction)) {
        await safeReply(interaction, { content: "Only ticket staff can close tickets.", flags: 64 });
        return;
      }

      await ticketRouter.handleCloseReasonButton(interaction);
      return;
    }

    if (interaction.customId === "verify_no") {
      await safeUpdate(interaction, {
        content: "",
        embeds: [
          glurpsEmbed()
            .setTitle("Verification Cancelled")
            .setDescription("Your Minecraft account was not linked.")
            .setFooter({ text: "Glurps Events Verification System" }),
        ],
        components: [],
      });
      return;
    }

    if (!interaction.customId.startsWith("verify_yes:")) {
      return;
    }

    const verificationPayload = interaction.customId.substring("verify_yes:".length);
    const verificationParts = verificationPayload.split(":");
    const hasPlatformPayload = verificationParts[0] === "java" || verificationParts[0] === "bedrock";
    const platform = hasPlatformPayload && verificationParts[0] === "bedrock" ? "bedrock" : "java";
    const platformLabel = platform === "java" ? "Java" : "Bedrock";
    const hasUuidPayload = hasPlatformPayload && verificationParts.length >= 3;
    const javaUuid = hasUuidPayload && platform === "java" && verificationParts[1] !== "none" ? verificationParts[1] || null : null;
    const encodedUsername = hasPlatformPayload
      ? verificationParts.slice(hasUuidPayload ? 2 : 1).join(":")
      : verificationPayload;
    const username = decodeVerificationUsername(encodedUsername);

    if (!username) {
      await safeReply(interaction, {
        embeds: [VerificationService.failureEmbed()],
        flags: 64,
      });
      return;
    }

    try {
      if (!interaction.inGuild()) {
        await safeReply(interaction, {
          content: "This button can only be used in a server.",
          flags: 64,
        });
        return;
      }

      const guild = interaction.guild!;

      const member = interaction.member as GuildMember;

      const result = await verificationService.verifyMember(guild, member, platform, username, javaUuid);

      await safeUpdate(interaction, {
        content: "",
        embeds: [
          glurpsEmbed()
            .setTitle("Verification Successful")
            .setDescription("You have successfully linked your Discord account to your Minecraft account.")
            .addFields(
              { name: "Minecraft Username", value: username, inline: true },
              { name: "Platform", value: platformLabel, inline: true },
              { name: "Nickname", value: result.nickname, inline: false }
            )
            .setFooter({ text: "Glurps Events Verification System" }),
        ],
        components: [],
      });
    } catch (err) {
      logger.error("Verification button failed.", err, { type: "button", name: interaction.customId });

      await safeReply(interaction, {
        embeds: [VerificationService.saveFailureEmbed()],
        flags: 64,
      });
    }
  } catch (error) {
    logger.error("Button interaction failed.", error, {
      type: "button",
      name: interaction.isButton() ? interaction.customId : "unknown",
    });
    if (interaction.isRepliable()) {
      await safeReply(interaction, { content: "Something went wrong. Please try again.", flags: 64 }).catch(error =>
        logger.warn("Failed to send button error response.", error)
      );
    }
  }
});
