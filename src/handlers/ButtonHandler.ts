import { Events, GuildMember, PermissionFlagsBits, type ButtonInteraction } from "discord.js";
import { client } from "../client.js";
import { config } from "../config/config.js";
import { eventRouter } from "../services/events/EventRouter.js";
import { safeReply } from "../services/tickets/interactionResponses.js";
import { ticketRouter } from "../services/tickets/TicketRouter.js";
import { giizeEmbed } from "../utils/embeds.js";
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

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith("event_")) {
      await eventRouter.handleButton(interaction);
      return;
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
          giizeEmbed()
            .setTitle("Verification Cancelled")
            .setDescription("Your Minecraft account was not linked.")
            .setFooter({ text: "Giize Events Verification System" }),
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
    const username = hasPlatformPayload ? verificationParts.slice(1).join(":") : verificationPayload;

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

      if (member.manageable) {
        await member.setNickname(username);
      }

      const roleId = config.verifyRoleId;

      if (roleId) {
        const role = guild.roles.cache.get(roleId);

        if (role) {
          await member.roles.add(role, "Verified via /verify");
        }
      }

      const logChannelId = config.verificationLogsChannelId;

      if (logChannelId) {
        const channel = guild.channels.cache.get(logChannelId);

        if (channel?.isTextBased()) {
          await channel.send({
            embeds: [
              giizeEmbed()
                .setTitle("✅ Member Verified")
                .addFields(
                  {
                    name: "Discord",
                    value: `${member}`,
                    inline: true,
                  },
                  {
                    name: "Minecraft Username",
                    value: username,
                    inline: true,
                  }
                )
                .setFooter({ text: "Giize Events Verification System" })
                .setTimestamp(),
            ],
          });
        }
      }

      await safeUpdate(interaction, {
        content: "",
        embeds: [
          giizeEmbed()
            .setTitle("Verification Successful")
            .setDescription("You have successfully linked your Discord account to your Minecraft account.")
            .addFields(
              { name: "Minecraft Username", value: username, inline: true },
              { name: "Platform", value: platformLabel, inline: true },
              { name: "Nickname", value: username, inline: false }
            )
            .setFooter({ text: "Giize Events Verification System" }),
        ],
        components: [],
      });
    } catch (err) {
      logger.error("Verification button failed.", err, { type: "button", name: interaction.customId });

      await safeReply(interaction, {
        embeds: [
          giizeEmbed()
            .setTitle("Verification Failed")
            .setDescription("That Minecraft username could not be found.\n\nPlease double-check the spelling and try again.")
            .setFooter({ text: "Giize Events Verification System" }),
        ],
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
