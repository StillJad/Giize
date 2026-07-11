import type { ButtonInteraction } from "discord.js";
import { safeReply } from "../tickets/interactionResponses.js";
import { logger } from "../../utils/logger.js";
import { eventService } from "./EventService.js";
import type { RsvpStatus } from "./EventRenderer.js";

const rsvpStatuses = new Set<RsvpStatus>(["going", "maybe", "cant"]);

export class EventRouter {
  async handleButton(interaction: ButtonInteraction) {
    try {
      if (interaction.customId.startsWith("event_rsvp:")) {
        const [, status, eventId] = interaction.customId.split(":");

        if (!rsvpStatuses.has(status as RsvpStatus) || !eventId) {
          await safeReply(interaction, { content: "❌ Invalid event button.", flags: 64 });
          return;
        }

        await eventService.setRsvp(interaction, Number(eventId), status as RsvpStatus);
        return;
      }

      if (interaction.customId.startsWith("event_participants:")) {
        const eventId = Number(interaction.customId.split(":")[1]);
        await eventService.showParticipants(interaction, eventId);
      }
    } catch (error) {
      logger.error("Event button failed.", error, { type: "button", name: interaction.customId });
      await safeReply(interaction, { content: "Something went wrong. Please try again.", flags: 64 }).catch(replyError =>
        logger.warn("Failed to send event button error response.", replyError)
      );
    }
  }
}

export const eventRouter = new EventRouter();
