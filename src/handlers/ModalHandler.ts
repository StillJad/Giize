import { Events } from "discord.js";
import { client } from "../client.js";
import { safeReply } from "../services/tickets/interactionResponses.js";
import { ticketRouter } from "../services/tickets/TicketRouter.js";
import { logger } from "../utils/logger.js";

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (!interaction.isModalSubmit()) return;

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
