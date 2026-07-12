import {
  AttachmentBuilder,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TicketType } from "./TicketRenderer.js";

export type TranscriptMetadata = {
  serverName: string;
  ticketNumber: string;
  ticketChannel: string;
  ticketChannelId: string;
  ticketCreator: string;
  ticketCreatorId: string;
  type: TicketType;
  openedAt: Date;
  closedAt: Date;
  duration: string;
  closedBy: string;
  closedById: string;
  openingReason: string;
  closingReason: string;
};

export class TranscriptService {
  async createText(channel: TextBasedChannel, metadata: TranscriptMetadata) {
    const messages = await this.fetchMessages(channel);
    return this.renderText(messages.reverse(), metadata);
  }

  async createTempFile(transcript: string, ticketNumber: string) {
    const baseFilename = `ticket-${ticketNumber.replace("#", "")}`;
    const directory = path.join(process.cwd(), "data", "transcripts", `${Date.now()}-${baseFilename}`);
    const filename = `${baseFilename}.txt`;
    const filePath = path.join(directory, filename);

    await mkdir(directory, { recursive: true });
    await writeFile(filePath, transcript, "utf8");

    return {
      directory,
      filePath,
      filename,
    };
  }

  createAttachment(filePath: string, filename: string) {
    return new AttachmentBuilder(filePath, { name: filename });
  }

  async removeTempFile(file: { directory: string; filePath: string }) {
    await rm(file.filePath, { force: true }).catch(() => {});
    await rm(file.directory, { force: true, recursive: true }).catch(() => {});
  }

  createFallbackText(metadata: TranscriptMetadata) {
    return this.renderText([], metadata);
  }

  private async fetchMessages(channel: TextBasedChannel) {
    const messages: Message[] = [];
    let before: string | undefined;

    for (;;) {
      const batch = await channel.messages.fetch({ limit: 100, before });
      messages.push(...batch.values());

      if (batch.size < 100) break;
      before = batch.last()?.id;
    }

    return messages;
  }

  private renderText(messages: Message[], metadata: TranscriptMetadata) {
    return [
      "GIIZE EVENTS TICKET TRANSCRIPT",
      "",
      `Ticket: ${metadata.ticketNumber}`,
      `Channel: ${metadata.ticketChannel}`,
      `Opened By: ${metadata.ticketCreator} (${metadata.ticketCreatorId})`,
      `Closed By: ${metadata.closedBy} (${metadata.closedById})`,
      `Ticket Type: ${metadata.type}`,
      `Opened At: ${this.formatDateTime(metadata.openedAt)}`,
      `Closed At: ${this.formatDateTime(metadata.closedAt)}`,
      `Duration: ${metadata.duration}`,
      `Opening Reason: ${metadata.openingReason}`,
      `Closing Reason: ${metadata.closingReason}`,
      "",
      "==================================================",
      "",
      messages.map(message => this.renderMessageText(message)).join("\n\n"),
    ].join("\n");
  }

  private renderMessageText(message: Message) {
    const lines = [
      `[${this.formatDateTime(message.createdAt)}] ${message.member?.displayName ?? message.author.username} (${message.author.id}):`,
      message.content || "[no text content]",
    ];

    if (message.reference?.messageId) {
      lines.push(`Reply To: ${message.reference.messageId}`);
    }

    const mentions = [
      ...message.mentions.users.map(user => `@${user.tag} (${user.id})`),
      ...message.mentions.roles.map(role => `@${role.name} (${role.id})`),
      ...message.mentions.channels.map(channel => ("name" in channel ? `#${channel.name} (${channel.id})` : `#${channel.id}`)),
    ].join(", ");

    if (mentions) {
      lines.push(`Mentions: ${mentions}`);
    }

    if (message.editedAt) {
      lines.push(`Edited At: ${this.formatDateTime(message.editedAt)}`);
    }

    for (const attachment of message.attachments.values()) {
      lines.push(`Attachment: ${attachment.name ?? "attachment"} - ${attachment.url}`);
    }

    for (const sticker of message.stickers.values()) {
      lines.push(`Sticker: ${sticker.name} - ${sticker.url}`);
    }

    for (const embed of message.embeds) {
      if (embed.title) {
        lines.push(`Embed Title: ${embed.title}`);
      }

      if (embed.description) {
        lines.push(`Embed Description: ${embed.description}`);
      }
    }

    for (const row of message.components) {
      lines.push(`Components: ${JSON.stringify(row.toJSON())}`);
    }

    return lines.join("\n");
  }

  private formatDateTime(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const rawHours = date.getHours();
    const hours = rawHours % 12 || 12;
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const period = rawHours >= 12 ? "PM" : "AM";

    return `${year}-${month}-${day} ${hours}:${minutes} ${period}`;
  }
}

export const transcriptService = new TranscriptService();
