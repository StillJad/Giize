import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { logger } from "../../utils/logger.js";
import { safeReply } from "./interactionResponses.js";
import { ticketService } from "./TicketService.js";

export class TicketRouter {
  async handleCloseButton(interaction: ButtonInteraction) {
    try {
      await ticketService.requestClose(interaction);
    } catch (error) {
      await this.handleError(interaction, error);
    }
  }

  async handleCloseReasonButton(interaction: ButtonInteraction) {
    try {
      await ticketService.requestCloseReason(interaction);
    } catch (error) {
      await this.handleError(interaction, error);
    }
  }

  async handleModal(interaction: ModalSubmitInteraction) {
    try {
      if (interaction.customId === "ticket_close_reason") {
        await ticketService.submitCloseReason(interaction);
        return true;
      }

      return false;
    } catch (error) {
      await this.handleError(interaction, error);
      return true;
    }
  }

  private async handleError(
    interaction: ButtonInteraction | ModalSubmitInteraction,
    error: unknown
  ) {
    logger.error("Ticket interaction failed.", error, {
      type: interaction.isButton() ? "button" : "modal",
      name: interaction.customId,
    });
    await safeReply(interaction, { content: "Something went wrong. Please try again.", flags: 64 }).catch(replyError =>
      logger.warn("Failed to send ticket error response.", replyError)
    );
  }
}

export const ticketRouter = new TicketRouter();
