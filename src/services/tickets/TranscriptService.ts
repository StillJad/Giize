import {
  AttachmentBuilder,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
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
  async createHtml(channel: TextBasedChannel, metadata: TranscriptMetadata) {
    const messages = await this.fetchMessages(channel);
    return this.renderHtml(messages.reverse(), metadata);
  }

  async createTempArchive(html: string, ticketNumber: string) {
    const baseFilename = `ticket-${ticketNumber.replace("#", "")}`;
    const directory = path.join(process.cwd(), "data", "transcripts", `${Date.now()}-${baseFilename}`);
    const htmlFilename = `${baseFilename}.html`;
    const zipFilename = `${baseFilename}.zip`;
    const htmlPath = path.join(directory, htmlFilename);
    const zipPath = path.join(directory, zipFilename);
    const htmlBuffer = Buffer.from(html, "utf8");

    await mkdir(directory, { recursive: true });
    await writeFile(htmlPath, htmlBuffer);
    await writeFile(zipPath, this.createZipBuffer(htmlFilename, htmlBuffer));

    return {
      directory,
      htmlPath,
      zipPath,
      zipFilename,
    };
  }

  createAttachment(filePath: string, filename: string) {
    return new AttachmentBuilder(filePath, { name: filename });
  }

  async removeTempArchive(archive: { directory: string; htmlPath: string; zipPath: string }) {
    await rm(archive.htmlPath, { force: true }).catch(() => {});
    await rm(archive.zipPath, { force: true }).catch(() => {});
    await rm(archive.directory, { force: true, recursive: true }).catch(() => {});
  }

  private createZipBuffer(filename: string, contents: Buffer) {
    const filenameBuffer = Buffer.from(filename, "utf8");
    const compressedContents = deflateRawSync(contents);
    const crc = this.crc32(contents);
    const { date, time } = this.zipDateTime(new Date());
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedContents.length, 18);
    localHeader.writeUInt32LE(contents.length, 22);
    localHeader.writeUInt16LE(filenameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralDirectory = Buffer.alloc(46);
    centralDirectory.writeUInt32LE(0x02014b50, 0);
    centralDirectory.writeUInt16LE(20, 4);
    centralDirectory.writeUInt16LE(20, 6);
    centralDirectory.writeUInt16LE(0, 8);
    centralDirectory.writeUInt16LE(8, 10);
    centralDirectory.writeUInt16LE(time, 12);
    centralDirectory.writeUInt16LE(date, 14);
    centralDirectory.writeUInt32LE(crc, 16);
    centralDirectory.writeUInt32LE(compressedContents.length, 20);
    centralDirectory.writeUInt32LE(contents.length, 24);
    centralDirectory.writeUInt16LE(filenameBuffer.length, 28);
    centralDirectory.writeUInt16LE(0, 30);
    centralDirectory.writeUInt16LE(0, 32);
    centralDirectory.writeUInt16LE(0, 34);
    centralDirectory.writeUInt16LE(0, 36);
    centralDirectory.writeUInt32LE(0, 38);
    centralDirectory.writeUInt32LE(0, 42);

    const centralDirectoryOffset = localHeader.length + filenameBuffer.length + compressedContents.length;
    const centralDirectorySize = centralDirectory.length + filenameBuffer.length;
    const end = Buffer.alloc(22);

    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(centralDirectorySize, 12);
    end.writeUInt32LE(centralDirectoryOffset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([
      localHeader,
      filenameBuffer,
      compressedContents,
      centralDirectory,
      filenameBuffer,
      end,
    ]);
  }

  private crc32(contents: Buffer) {
    let crc = 0xffffffff;

    for (const byte of contents) {
      crc ^= byte;

      for (let index = 0; index < 8; index += 1) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  private zipDateTime(date: Date) {
    const year = Math.max(date.getFullYear(), 1980);

    return {
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    };
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

  private renderHtml(messages: Message[], metadata: TranscriptMetadata) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${this.escape(metadata.ticketChannel)} Transcript</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #101114; color: #f2f3f5; line-height: 1.45; }
    main { max-width: 1040px; margin: 0 auto; padding: 32px 20px; }
    header, article { background: #1c1d22; border: 1px solid #2b2d33; border-radius: 10px; padding: 18px; }
    header { margin-bottom: 22px; }
    article { margin: 12px 0; }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 0; }
    dt { color: #b5bac1; font-size: 12px; text-transform: uppercase; }
    dd { margin: 4px 0 0; overflow-wrap: anywhere; }
    .meta { color: #b5bac1; font-size: 13px; margin-bottom: 8px; }
    .content { white-space: pre-wrap; overflow-wrap: anywhere; }
    .section { border-left: 3px solid #5865f2; background: #15161a; margin-top: 10px; padding: 10px 12px; border-radius: 4px; }
    .attachment img, .sticker img { display: block; max-width: 420px; max-height: 320px; margin-top: 8px; border-radius: 6px; }
    a { color: #64b5ff; }
    code { background: #090a0d; padding: 2px 4px; border-radius: 4px; white-space: pre-wrap; }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Ticket Transcript</h1>
    <dl>
      ${this.headerItem("Server", metadata.serverName)}
      ${this.headerItem("Ticket Number", metadata.ticketNumber)}
      ${this.headerItem("Ticket Channel", `${metadata.ticketChannel} (${metadata.ticketChannelId})`)}
      ${this.headerItem("Opened By", `${metadata.ticketCreator} (${metadata.ticketCreatorId})`)}
      ${this.headerItem("Ticket Type", metadata.type)}
      ${this.headerItem("Opened At", metadata.openedAt.toISOString())}
      ${this.headerItem("Closed By", `${metadata.closedBy} (${metadata.closedById})`)}
      ${this.headerItem("Closed At", metadata.closedAt.toISOString())}
      ${this.headerItem("Duration", metadata.duration)}
      ${this.headerItem("Opening Reason", metadata.openingReason)}
      ${this.headerItem("Closing Reason", metadata.closingReason)}
    </dl>
  </header>
  <h2>Messages</h2>
  ${messages.map(message => this.renderMessage(message)).join("\n")}
</main>
</body>
</html>`;
  }

  private renderMessage(message: Message) {
    const reply = message.reference
      ? `<div class="section">Reply to: ${this.escape(message.reference.messageId ?? "unknown message")}</div>`
      : "";
    const attachments = message.attachments.map(attachment => this.renderAttachment(attachment.url, attachment.name)).join("");
    const stickers = message.stickers
      .map(sticker => `<div class="section sticker">Sticker: ${this.escape(sticker.name)}<br><img src="${this.escape(sticker.url)}" alt="${this.escape(sticker.name)}"></div>`)
      .join("");
    const embeds = message.embeds
      .map(embed => `<div class="section">Embed: <code>${this.escape(JSON.stringify(embed.toJSON(), null, 2))}</code></div>`)
      .join("");
    const mentions = [
      ...message.mentions.users.map(user => `@${user.tag} (${user.id})`),
      ...message.mentions.roles.map(role => `@${role.name} (${role.id})`),
      ...message.mentions.channels.map(channel => ("name" in channel ? `#${channel.name} (${channel.id})` : `#${channel.id}`)),
    ].join(", ");

    return `<article>
  <div class="meta">${this.escape(message.author.tag)} (${message.author.id}) • ${message.createdAt.toISOString()}${message.editedAt ? ` • edited ${message.editedAt.toISOString()}` : ""}</div>
  ${reply}
  <div class="content">${this.escape(message.content || "[no text content]")}</div>
  ${mentions ? `<div class="section">Mentions: ${this.escape(mentions)}</div>` : ""}
  ${attachments}
  ${stickers}
  ${embeds}
</article>`;
  }

  private renderAttachment(url: string, name: string | null) {
    const safeUrl = this.escape(url);
    const safeName = this.escape(name ?? "attachment");
    const image = /\.(png|jpe?g|gif|webp|bmp)$/i.test(url)
      ? `<img src="${safeUrl}" alt="${safeName}">`
      : "";

    return `<div class="section attachment">Attachment: <a href="${safeUrl}">${safeName}</a>${image}</div>`;
  }

  private headerItem(label: string, value: string) {
    return `<div><dt>${this.escape(label)}</dt><dd>${this.escape(value)}</dd></div>`;
  }

  private escape(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
}

export const transcriptService = new TranscriptService();
