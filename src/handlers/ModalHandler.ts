import { Events } from "discord.js";
import { beginVerification } from "../commands/verification/verify.js";
import { client } from "../client.js";
import { eventApplicationRouter } from "../services/events/EventApplicationRouter.js";
import { safeReply } from "../services/tickets/interactionResponses.js";
import { ticketRouter } from "../services/tickets/TicketRouter.js";
import { logger } from "../utils/logger.js";

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (!interaction.isModalSubmit()) return;
    if(interaction.customId==="account_verify_submit") {
      const platform=interaction.fields.getTextInputValue("platform").trim().toLowerCase();
      if(platform!=="java" && platform!=="bedrock") {await interaction.reply({content:"Enter Java or Bedrock as the edition.",flags:64});return;}
      await beginVerification(interaction,interaction.fields.getTextInputValue("username"),platform);return;
    }

    if (await eventApplicationRouter.handleModal(interaction)) return;

    await ticketRouter.handleModal(interaction);
  } catch (error) {
    logger.error("Modal interaction failed.", error, {
      type: "modal",
      name: interaction.isModalSubmit() ? interaction.customId : "unknown",
    });
    if (interaction.isRepliable()) {
      await safeReply(interaction, { content: "Something went wrong. Please try again.", flags: 64 }).catch(replyError =>
        logger.warn("Failed to send modal error response.", replyError)
      );
    }
  }
});
