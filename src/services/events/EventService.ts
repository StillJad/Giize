import {
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type Role,
  type TextChannel,
} from "discord.js";
import { config } from "../../config/config.js";
import { sqlite } from "../../database/database.js";
import { logger } from "../../utils/logger.js";
import { safeEdit, safeReply } from "../tickets/interactionResponses.js";
import {
  eventRenderer,
  type EventCounts,
  type EventParticipantGroup,
  type EventRecord,
  type EventStatus,
  type RsvpStatus,
} from "./EventRenderer.js";

type EventRow = {
  id: number;
  event_number: number;
  guild_id: string;
  message_id: string;
  channel_id: string;
  host_id: string;
  title: string;
  description: string;
  location: string | null;
  start_timestamp: number;
  end_timestamp: number;
  max_players: number | null;
  ping_role: string | null;
  going_role: string | null;
  status: EventStatus;
  created_at: number;
};

type EventCreateInput = {
  title: string;
  description: string;
  date: string;
  time: string | null;
  duration: string;
  location: string | null;
  maxPlayers: number | null;
  pingRole: Role | null;
  goingRole: Role | null;
  channel: TextChannel;
};

type EventEditInput = {
  eventNumber: number;
  title: string | null;
  description: string | null;
  date: string | null;
  time: string | null;
  duration: string | null;
  location: string | null;
  maxPlayers: number | null;
  pingRole: Role | null;
  goingRole: Role | null;
};

export class EventService {
  async create(interaction: ChatInputCommandInteraction, input: EventCreateInput) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild) {
      await safeEdit(interaction, { content: "❌ Events can only be created in a server." });
      return;
    }

    if (!this.canSendEvent(interaction.guild, input.channel)) {
      await safeEdit(interaction, { content: "❌ I can't send embeds and buttons in that channel." });
      return;
    }

    const parsedTime = this.parseEventTime(input.date, input.time, input.duration);

    if (!parsedTime) {
      await safeEdit(interaction, {
        content: "Paste a Discord timestamp like <t:1735689600:F>.",
      });
      return;
    }

    const eventNumber = this.nextEventNumber(interaction.guild.id);
    const now = Date.now();
    const insert = sqlite.prepare(`
      INSERT INTO events (
        event_number, guild_id, message_id, channel_id, host_id, title, description, location,
        start_timestamp, end_timestamp, max_players, ping_role, going_role, status, created_at
      )
      VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
    `).run(
      eventNumber,
      interaction.guild.id,
      input.channel.id,
      interaction.user.id,
      input.title,
      input.description,
      input.location,
      parsedTime.startTimestamp,
      parsedTime.endTimestamp,
      input.maxPlayers,
      input.pingRole?.id ?? null,
      input.goingRole?.id ?? null,
      now
    );

    const event = this.getById(Number(insert.lastInsertRowid));

    if (!event) {
      await safeEdit(interaction, { content: "❌ Event could not be created." });
      return;
    }

    const message = await input.channel.send({
      content: input.pingRole ? `${input.pingRole}` : undefined,
      embeds: [eventRenderer.renderEventEmbed(event, this.getCounts(event.id))],
      components: eventRenderer.renderEventComponents(event),
    });

    sqlite.prepare("UPDATE events SET message_id = ? WHERE id = ?").run(message.id, event.id);
    await safeEdit(interaction, { content: `✅ Event created in ${input.channel}.` });
  }

  async edit(interaction: ChatInputCommandInteraction, input: EventEditInput) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild) {
      await safeEdit(interaction, { content: "❌ Events can only be edited in a server." });
      return;
    }

    const event = this.getByNumber(interaction.guild.id, input.eventNumber);

    if (!event) {
      await safeEdit(interaction, { content: "❌ Event not found." });
      return;
    }

    if (event.status === "ended") {
      await safeEdit(interaction, { content: "❌ Ended events can't be edited." });
      return;
    }

    const nextDate = input.date ?? new Date(event.startTimestamp).toString();
    const nextTime = input.time;
    const nextDuration = input.duration ?? `${Math.max(1, Math.round((event.endTimestamp - event.startTimestamp) / 60000))}m`;
    const parsedTime = this.parseEventTime(nextDate, nextTime, nextDuration);

    if (!parsedTime) {
      await safeEdit(interaction, {
        content: "Paste a Discord timestamp like <t:1735689600:F>.",
      });
      return;
    }

    sqlite.prepare(`
      UPDATE events
      SET title = ?, description = ?, location = ?, start_timestamp = ?, end_timestamp = ?,
          max_players = ?, ping_role = ?, going_role = ?
      WHERE id = ?
    `).run(
      input.title ?? event.title,
      input.description ?? event.description,
      input.location ?? event.location,
      parsedTime.startTimestamp,
      parsedTime.endTimestamp,
      input.maxPlayers ?? event.maxPlayers,
      input.pingRole?.id ?? event.pingRole,
      input.goingRole?.id ?? event.goingRole,
      event.id
    );

    const updated = this.getById(event.id);
    if (updated) await this.updateEventMessage(interaction.client, updated);
    await safeEdit(interaction, { content: "✅ Event updated." });
  }

  async delete(interaction: ChatInputCommandInteraction, eventNumber: number) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild) {
      await safeEdit(interaction, { content: "❌ Events can only be deleted in a server." });
      return;
    }

    const event = this.getByNumber(interaction.guild.id, eventNumber);

    if (!event) {
      await safeEdit(interaction, { content: "❌ Event not found." });
      return;
    }

    await this.deleteEventMessage(interaction.client, event);
    sqlite.prepare("DELETE FROM event_participants WHERE event_id = ?").run(event.id);
    sqlite.prepare("DELETE FROM event_reminders WHERE event_id = ?").run(event.id);
    sqlite.prepare("DELETE FROM events WHERE id = ?").run(event.id);
    await safeEdit(interaction, { content: "✅ Event deleted." });
  }

  async end(interaction: ChatInputCommandInteraction, eventNumber: number) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild) {
      await safeEdit(interaction, { content: "❌ Events can only be ended in a server." });
      return;
    }

    const event = this.getByNumber(interaction.guild.id, eventNumber);

    if (!event) {
      await safeEdit(interaction, { content: "❌ Event not found." });
      return;
    }

    sqlite.prepare("UPDATE events SET status = 'ended' WHERE id = ?").run(event.id);
    const updated = this.getById(event.id);
    if (updated) {
      await this.updateEventMessage(interaction.client, updated);
      await this.sendEndedLog(interaction.client, updated, interaction.user.id, new Date());
    }
    await safeEdit(interaction, { content: "✅ Event ended and locked." });
  }

  async list(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild) {
      await safeEdit(interaction, { content: "❌ Events can only be listed in a server." });
      return;
    }

    const events = sqlite
      .prepare("SELECT * FROM events WHERE guild_id = ? ORDER BY start_timestamp ASC LIMIT 25")
      .all(interaction.guild.id)
      .map(row => this.toEvent(row as EventRow));

    await safeEdit(interaction, { embeds: [eventRenderer.renderListEmbed(events)] });
  }

  async setRsvp(interaction: ButtonInteraction, eventId: number, status: RsvpStatus) {
    if (!interaction.inGuild()) {
      await safeReply(interaction, { content: "❌ Events can only be used in a server.", flags: 64 });
      return;
    }

    const event = this.getById(eventId);

    if (!event || event.guildId !== interaction.guildId) {
      await safeReply(interaction, { content: "❌ Event not found.", flags: 64 });
      return;
    }

    if (event.status === "ended") {
      await safeReply(interaction, { content: "❌ This event has ended.", flags: 64 });
      return;
    }

    const previous = this.getParticipantStatus(event.id, interaction.user.id);

    if (status === "going" && previous !== "going" && event.maxPlayers) {
      const counts = this.getCounts(event.id);
      if (counts.going >= event.maxPlayers) {
        await safeReply(interaction, { content: "❌ This event is full.", flags: 64 });
        return;
      }
    }

    sqlite.prepare(`
      INSERT INTO event_participants (event_id, user_id, status)
      VALUES (?, ?, ?)
      ON CONFLICT(event_id, user_id) DO UPDATE SET status = excluded.status
    `).run(event.id, interaction.user.id, status);

    await interaction.update({
      embeds: [eventRenderer.renderEventEmbed(event, this.getCounts(event.id))],
      components: eventRenderer.renderEventComponents(event),
    });
  }

  async showParticipants(interaction: ButtonInteraction, eventId: number) {
    const event = this.getById(eventId);

    if (!event || event.guildId !== interaction.guildId) {
      await safeReply(interaction, { content: "❌ Event not found.", flags: 64 });
      return;
    }

    await safeReply(interaction, {
      embeds: [eventRenderer.renderParticipantsEmbed(event, this.getParticipants(event.id))],
      flags: 64,
    });
  }

  async participants(interaction: ChatInputCommandInteraction, eventQuery: string | null, _shouldExport = false) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guildId) {
      await safeEdit(interaction, { content: "❌ Events can only be viewed in a server." });
      return;
    }

    const event = eventQuery
      ? this.findEvent(interaction.guildId, eventQuery)
      : this.getNewestActiveEvent(interaction.guildId);

    if (!event) {
      await safeEdit(interaction, { content: "There are no active events." });
      return;
    }

    await safeEdit(interaction, {
      embeds: [eventRenderer.renderParticipantsEmbed(event, this.getParticipants(event.id))],
    });
  }

  getEventById(eventId: number) {
    return this.getById(eventId);
  }

  async acceptApplicant(_guild: Guild, client: Client, event: EventRecord, userId: string) {
    sqlite.prepare(`
      INSERT INTO event_participants (event_id, user_id, status)
      VALUES (?, ?, 'going')
      ON CONFLICT(event_id, user_id) DO UPDATE SET status = 'going'
    `).run(event.id, userId);

    await this.updateEventMessage(client, event);
  }

  getDueReminders(now: number) {
    const reminderWindow = 60_000;
    const windows = [
      { key: "24h", label: "24 hours", offset: 86_400_000 },
      { key: "1h", label: "1 hour", offset: 3_600_000 },
      { key: "15m", label: "15 minutes", offset: 900_000 },
    ];
    const events = sqlite
      .prepare("SELECT * FROM events WHERE status = 'scheduled' AND start_timestamp > ?")
      .all(now)
      .map(row => this.toEvent(row as EventRow));

    return events.flatMap(event =>
      windows
        .filter(window => {
          const remaining = event.startTimestamp - now;
          return remaining <= window.offset && remaining > window.offset - reminderWindow;
        })
        .filter(window => !this.wasReminderSent(event.id, window.key))
        .map(window => ({ event, key: window.key, label: window.label }))
    );
  }

  async sendReminder(client: Client, event: EventRecord, key: string, label: string) {
    try {
      const channel = await client.channels.fetch(event.channelId);
      if (!channel?.isTextBased() || !("send" in channel)) return;

      await channel.send({
        content: event.pingRole ? `<@&${event.pingRole}>` : undefined,
        embeds: [eventRenderer.renderReminderEmbed(event, label)],
      });

      sqlite.prepare(`
        INSERT OR IGNORE INTO event_reminders (event_id, reminder_key, sent_at)
        VALUES (?, ?, ?)
      `).run(event.id, key, Date.now());
    } catch (error) {
      logger.warn(`Failed to send ${key} reminder for event ${event.id}.`, error);
    }
  }

  private async sendEndedLog(client: Client, event: EventRecord, endedById: string, endedAt: Date) {
    try {
      const channel = await client.channels.fetch(config.eventLogsChannelId).catch(() => null);

      if (!channel?.isTextBased() || !("send" in channel)) {
        logger.warn(`Event logs channel ${config.eventLogsChannelId} was not found or is not text based.`);
        return;
      }

      await channel.send({
        embeds: [
          eventRenderer.renderEndedLogEmbed(
            event,
            this.getParticipants(event.id),
            this.getCounts(event.id),
            endedById,
            endedAt,
            this.formatDuration(endedAt.getTime() - event.startTimestamp)
          ),
        ],
      });
    } catch (error) {
      logger.warn("Failed to send event end log.", error);
    }
  }

  private async updateEventMessage(client: Client, event: EventRecord) {
    const message = await this.fetchEventMessage(client, event);
    if (!message) return;

    await message.edit({
      embeds: [eventRenderer.renderEventEmbed(event, this.getCounts(event.id))],
      components: eventRenderer.renderEventComponents(event),
    });
  }

  private async deleteEventMessage(client: Client, event: EventRecord) {
    const message = await this.fetchEventMessage(client, event);
    await message?.delete().catch(() => {});
  }

  private async fetchEventMessage(client: Client, event: EventRecord) {
    const channel = await client.channels.fetch(event.channelId).catch(() => null);
    if (!channel?.isTextBased() || !("messages" in channel)) return null;
    return channel.messages.fetch(event.messageId).catch(() => null);
  }

  private getById(id: number) {
    const row = sqlite.prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow | undefined;
    return row ? this.toEvent(row) : null;
  }

  private getByNumber(guildId: string, eventNumber: number) {
    const row = sqlite
      .prepare("SELECT * FROM events WHERE guild_id = ? AND event_number = ?")
      .get(guildId, eventNumber) as EventRow | undefined;
    return row ? this.toEvent(row) : null;
  }

  private getNewestActiveEvent(guildId: string) {
    const row = sqlite
      .prepare("SELECT * FROM events WHERE guild_id = ? AND status = 'scheduled' ORDER BY created_at DESC LIMIT 1")
      .get(guildId) as EventRow | undefined;
    return row ? this.toEvent(row) : null;
  }

  private findEvent(guildId: string, query: string) {
    const eventNumber = Number(query);

    if (Number.isInteger(eventNumber) && eventNumber > 0) {
      const event = this.getByNumber(guildId, eventNumber);
      if (event) return event;
    }

    const row = sqlite
      .prepare("SELECT * FROM events WHERE guild_id = ? AND title = ? ORDER BY created_at DESC LIMIT 1")
      .get(guildId, query) as EventRow | undefined;
    return row ? this.toEvent(row) : null;
  }

  private nextEventNumber(guildId: string) {
    const row = sqlite
      .prepare("SELECT MAX(event_number) AS maxEventNumber FROM events WHERE guild_id = ?")
      .get(guildId) as { maxEventNumber: number | null } | undefined;
    return (row?.maxEventNumber ?? 0) + 1;
  }

  private getCounts(eventId: number): EventCounts {
    const rows = sqlite
      .prepare("SELECT status, COUNT(*) AS total FROM event_participants WHERE event_id = ? GROUP BY status")
      .all(eventId) as { status: RsvpStatus; total: number }[];
    const counts: EventCounts = { going: 0, cant: 0 };

    for (const row of rows) counts[row.status] = row.total;
    return counts;
  }

  private getParticipants(eventId: number): EventParticipantGroup {
    const rows = sqlite
      .prepare("SELECT user_id AS userId, status FROM event_participants WHERE event_id = ? ORDER BY status, user_id")
      .all(eventId) as { userId: string; status: RsvpStatus }[];
    const participants: EventParticipantGroup = { going: [], cant: [] };

    for (const row of rows) participants[row.status].push(row.userId);
    return participants;
  }

  private getParticipantStatus(eventId: number, userId: string) {
    const row = sqlite
      .prepare("SELECT status FROM event_participants WHERE event_id = ? AND user_id = ?")
      .get(eventId, userId) as { status: RsvpStatus } | undefined;
    return row?.status;
  }

  private wasReminderSent(eventId: number, key: string) {
    return Boolean(
      sqlite
        .prepare("SELECT 1 FROM event_reminders WHERE event_id = ? AND reminder_key = ?")
        .get(eventId, key)
    );
  }

  private parseEventTime(date: string, time: string | null, duration: string) {
    const unixTimestamp = this.extractDiscordTimestamp([date, time].filter(Boolean).join(" "));
    const durationMinutes = this.parseDurationMinutes(duration);

    if (!unixTimestamp || !durationMinutes) return null;

    return {
      startTimestamp: unixTimestamp * 1000,
      endTimestamp: unixTimestamp * 1000 + durationMinutes * 60_000,
    };
  }

  private extractDiscordTimestamp(input: string) {
    const match = input.match(/<t:(\d{1,15})(?::[tTdDfFR])?>/);
    if (!match) return null;

    const timestamp = Number(match[1]);
    return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : null;
  }

  private parseDurationMinutes(duration: string) {
    const matches = [...duration.toLowerCase().matchAll(/(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/g)];
    const total = matches.reduce((sum, match) => {
      const amount = Number(match[1]);
      const unit = match[2];
      return sum + (unit.startsWith("h") ? amount * 60 : amount);
    }, 0);

    if (total > 0) return total;

    const numeric = Number(duration);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
  }

  private formatDuration(milliseconds: number) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;

    return [
      days ? `${days}d` : "",
      hours ? `${hours}h` : "",
      minutes ? `${minutes}m` : "",
      seconds || (!days && !hours && !minutes) ? `${seconds}s` : "",
    ].filter(Boolean).join(" ");
  }

  private canSendEvent(guild: Guild, channel: TextChannel) {
    const botMember = guild.members.me;
    if (!botMember) return false;

    const permissions = channel.permissionsFor(botMember);
    return Boolean(
      permissions?.has(PermissionFlagsBits.ViewChannel) &&
      permissions.has(PermissionFlagsBits.SendMessages) &&
      permissions.has(PermissionFlagsBits.EmbedLinks)
    );
  }

  private toEvent(row: EventRow): EventRecord {
    return {
      id: row.id,
      eventNumber: row.event_number,
      guildId: row.guild_id,
      messageId: row.message_id,
      channelId: row.channel_id,
      hostId: row.host_id,
      title: row.title,
      description: row.description,
      location: row.location,
      startTimestamp: row.start_timestamp,
      endTimestamp: row.end_timestamp,
      maxPlayers: row.max_players,
      pingRole: row.ping_role,
      goingRole: row.going_role,
      status: row.status,
      createdAt: row.created_at,
    };
  }
}

export const eventService = new EventService();
