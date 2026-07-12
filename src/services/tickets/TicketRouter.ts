import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { logger } from "../../utils/logger.js";
import { safeReply } from "./interactionResponses.js";
import { ticketService } from "./TicketService.js";
import type { TicketType } from "./TicketRenderer.js";

const panelTicketTypes = {
  support: "Support",
  report: "Player Report",
  appeal: "Appeal",
} satisfies Record<string, TicketType>;

function panelTicketType(value: string) {
  return panelTicketTypes[value as keyof typeof panelTicketTypes];
}

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

  async handleTicketPanelSelect(interaction: StringSelectMenuInteraction) {
    try {
      const selectedType = interaction.values[0];
      const ticketType = selectedType ? panelTicketType(selectedType) : undefined;

      if (!selectedType || !ticketType) {
        await safeReply(interaction, { content: "Invalid ticket type.", flags: 64 });
        return;
      }

      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`ticket_panel_open:${selectedType}`)
          .setTitle("Open Ticket")
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("ticketIssue")
                .setLabel("Describe your issue")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000)
            )
          )
      );
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

      if (interaction.customId.startsWith("ticket_panel_open:")) {
        const selectedType = interaction.customId.substring("ticket_panel_open:".length);
        const ticketType = panelTicketType(selectedType);

        if (!ticketType) {
          await safeReply(interaction, { content: "Invalid ticket type.", flags: 64 });
          return true;
        }

        await ticketService.open(
          interaction,
          ticketType,
          interaction.fields.getTextInputValue("ticketIssue")
        );
        return true;
      }

      return false;
    } catch (error) {
      await this.handleError(interaction, error);
      return true;
    }
  }

  private async handleError(
    interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
    error: unknown
  ) {
    logger.error("Ticket interaction failed.", error, {
      type: interaction.isButton() ? "button" : interaction.isModalSubmit() ? "modal" : "select",
      name: interaction.customId,
    });
    await safeReply(interaction, { content: "Something went wrong. Please try again.", flags: 64 }).catch(replyError =>
      logger.warn("Failed to send ticket error response.", replyError)
    );
  }
}

export const ticketRouter = new TicketRouter();
