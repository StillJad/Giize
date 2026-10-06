import type { ButtonInteraction, ModalSubmitInteraction } from "discord.js";
import { safeReply } from "../tickets/interactionResponses.js";
import { logger } from "../../utils/logger.js";
import { eventApplicationService } from "./EventApplicationService.js";

export class EventApplicationRouter {
  async handleButton(interaction: ButtonInteraction) {
    try {
      if (interaction.customId.startsWith("event_app_edit:")) {
        await eventApplicationService.editUsername(interaction, Number(interaction.customId.split(":")[1]));
        return;
      }
      if (interaction.customId.startsWith("event_app_reset:")) {
        await eventApplicationService.review(interaction, Number(interaction.customId.split(":")[1]), "pending");
        return;
      }
      if (interaction.customId.startsWith("event_apply:")) {
        await eventApplicationService.openModal(interaction, Number(interaction.customId.split(":")[1]));
        return;
      }

      if (interaction.customId.startsWith("event_apply_form:")) {
        await eventApplicationService.openGoogleForm(interaction, Number(interaction.customId.split(":")[1]));
        return;
      }

      if (interaction.customId.startsWith("event_app_accept:")) {
        await eventApplicationService.review(interaction, Number(interaction.customId.split(":")[1]), "accepted");
        return;
      }

      if (interaction.customId.startsWith("event_app_reject:")) {
        await eventApplicationService.review(interaction, Number(interaction.customId.split(":")[1]), "rejected");
      }
    } catch (error) {
      logger.error("Event application button failed.", error, { type: "button", name: interaction.customId });
      await safeReply(interaction, { content: "Something went wrong. Please try again.", flags: 64 }).catch(replyError =>
        logger.warn("Failed to send event application button error response.", replyError)
      );
    }
  }

  async handleModal(interaction: ModalSubmitInteraction) {
    try {
      if (interaction.customId.startsWith("event_app_username:")) {
        await eventApplicationService.saveUsername(interaction);
        return true;
      }
      if (!interaction.customId.startsWith("event_application:")) return false;
      await eventApplicationService.submit(interaction);
      return true;
    } catch (error) {
      logger.error("Event application modal failed.", error, { type: "modal", name: interaction.customId });
      await safeReply(interaction, { content: "Something went wrong. Please try again.", flags: 64 }).catch(replyError =>
        logger.warn("Failed to send event application modal error response.", replyError)
      );
      return true;
    }
  }
}

export const eventApplicationRouter = new EventApplicationRouter();
