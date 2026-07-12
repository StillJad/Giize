import type { User } from "discord.js";
import { giizeEmbed } from "../../utils/embeds.js";

export type TicketType = "Support" | "Report" | "Player Report" | "Appeal" | "Builder" | "Media";

export type TicketWelcome = {
  ticketNumber: string;
  openedBy: User;
  type: TicketType;
  reason: string;
  openedAt: Date;
};

export type TicketCloseLog = {
  ticketNumber: string;
  ticketChannel: string;
  openedBy: string;
  creatorId: string;
  closedBy: User;
  type: TicketType;
  openingReason: string;
  closingReason: string;
  openedAt: Date;
  closedAt: Date;
  duration: string;
};

export class TicketRenderer {
  renderWelcomeEmbed(ticket: TicketWelcome) {
    return giizeEmbed()
      .setTitle("Ticket Opened")
      .addFields(
        { name: "Ticket", value: ticket.ticketNumber, inline: true },
        { name: "Opened by", value: `${ticket.openedBy}`, inline: true },
        { name: "Type", value: ticket.type, inline: true },
        { name: "Reason", value: ticket.reason, inline: false },
        {
          name: "Opened at",
          value: `<t:${Math.floor(ticket.openedAt.getTime() / 1000)}:F>`,
          inline: true,
        }
      );
  }

  renderLogEmbed(ticket: TicketCloseLog) {
    return giizeEmbed()
      .setTitle("Ticket Closed")
      .addFields(
        { name: "Ticket #", value: ticket.ticketNumber, inline: true },
        { name: "Channel", value: ticket.ticketChannel, inline: true },
        { name: "Opened By", value: ticket.openedBy, inline: true },
        { name: "Closed By", value: `${ticket.closedBy}`, inline: true },
        { name: "Ticket Type", value: ticket.type, inline: true },
        {
          name: "Opened",
          value: `<t:${Math.floor(ticket.openedAt.getTime() / 1000)}:F>`,
          inline: true,
        },
        {
          name: "Closed",
          value: `<t:${Math.floor(ticket.closedAt.getTime() / 1000)}:F>`,
          inline: true,
        },
        { name: "Duration", value: ticket.duration, inline: true },
        { name: "Opening Reason", value: ticket.openingReason, inline: false },
        { name: "Closing Reason", value: ticket.closingReason, inline: false },
        { name: "Creator ID", value: ticket.creatorId, inline: true },
        { name: "Closer ID", value: ticket.closedBy.id, inline: true }
      );
  }

  renderClosedDmEmbed(ticket: TicketCloseLog) {
    return giizeEmbed()
      .setTitle("Ticket Closed")
      .setDescription("Your support ticket has been closed.")
      .addFields(
        { name: "Ticket #", value: ticket.ticketNumber, inline: true },
        { name: "Closed By", value: `${ticket.closedBy}`, inline: true },
        { name: "Reason", value: ticket.closingReason, inline: false },
        { name: "Duration", value: ticket.duration, inline: true }
      );
  }
}

export const ticketRenderer = new TicketRenderer();
