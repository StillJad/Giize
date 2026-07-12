import { Events } from "discord.js";
import { client } from "../client.js";
import { safeReply } from "../services/tickets/interactionResponses.js";
import { ticketRouter } from "../services/tickets/TicketRouter.js";
import { logger } from "../utils/logger.js";

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId === "ticket_panel_select") {
      await ticketRouter.handleTicketPanelSelect(interaction);
    }
  } catch (error) {
    logger.error("Select menu interaction failed.", error, {
      type: "select",
      name: interaction.isStringSelectMenu() ? interaction.customId : "unknown",
    });

    if (interaction.isRepliable()) {
      await safeReply(interaction, { content: "Something went wrong. Please try again.", flags: 64 }).catch(replyError =>
        logger.warn("Failed to send select menu error response.", replyError)
      );
    }
  }
});
