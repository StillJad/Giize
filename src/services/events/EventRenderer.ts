import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbedField,
} from "discord.js";
import { giizeEmbed } from "../../utils/embeds.js";

export type EventStatus = "scheduled" | "ended";
export type RsvpStatus = "going" | "cant";

export type EventRecord = {
  id: number;
  eventNumber: number;
  guildId: string;
  messageId: string;
  channelId: string;
  hostId: string;
  title: string;
  description: string;
  location: string | null;
  startTimestamp: number;
  endTimestamp: number;
  maxPlayers: number | null;
  pingRole: string | null;
  goingRole: string | null;
  status: EventStatus;
  createdAt: number;
};

export type EventCounts = Record<RsvpStatus, number>;

export type EventParticipantGroup = {
  going: string[];
  cant: string[];
  goingNames?: string[];
  applicationCounts?: {
    accepted: number;
    pending: number;
    rejected: number;
  };
};

export class EventRenderer {
  renderEventEmbed(event: EventRecord, counts: EventCounts) {
    const goingValue = event.maxPlayers
      ? `${counts.going}/${event.maxPlayers}`
      : `${counts.going}`;
    const fields: APIEmbedField[] = [];

    if (this.hasDate(event)) {
      const startSeconds = Math.floor(event.startTimestamp / 1000);
      fields.push(
        { name: "📅 Date & Time", value: `<t:${startSeconds}:F>`, inline: true },
        { name: "🕒 Relative", value: `<t:${startSeconds}:R>`, inline: true }
      );
    } else {
      fields.push({ name: "📅 Date & Time", value: "TBA", inline: true });
    }

    if (this.hasDuration(event)) {
      fields.push({ name: "⏳ Duration", value: this.formatDuration(event), inline: true });
    }

    if (event.location) {
      fields.push({ name: "📍 Location", value: event.location, inline: true });
    }

    fields.push(
      { name: `👥 Going (${counts.going})`, value: goingValue, inline: true },
      { name: `❌ Can't Go (${counts.cant})`, value: `${counts.cant}`, inline: true }
    );

    return giizeEmbed()
      .setTitle(event.title)
      .setDescription(event.description)
      .addFields(fields)
      .setFooter({ text: event.status === "ended" ? "Event ended" : "Giize Bot" })
      .setTimestamp(new Date(event.createdAt));
  }

  renderEventComponents(event: EventRecord) {
    const disabled = event.status === "ended";

    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`event_apply:${event.id}`)
          .setEmoji("📝")
          .setLabel("Apply")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`event_rsvp:cant:${event.id}`)
          .setEmoji("❌")
          .setLabel("Can't Go")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled)
      ),
    ];
  }

  renderParticipantsEmbed(event: EventRecord, participants: EventParticipantGroup) {
    const fields = [
      this.participantField("✅ Going", participants.goingNames ?? participants.going, Boolean(participants.goingNames)),
      this.participantField("❌ Can't Go", participants.cant),
    ];

    if (participants.applicationCounts) {
      fields.push({
        name: "Applications",
        value: [
          `Accepted: ${participants.applicationCounts.accepted}`,
          `Pending: ${participants.applicationCounts.pending}`,
          `Rejected: ${participants.applicationCounts.rejected}`,
        ].join("\n"),
        inline: false,
      });
    }

    return giizeEmbed()
      .setTitle("Participants")
      .setDescription([
        `Event ID: ${event.eventNumber}`,
        `Event: ${event.title}`,
      ].join("\n"))
      .addFields(fields);
  }

  renderEndedLogEmbed(
    event: EventRecord,
    participants: EventParticipantGroup,
    counts: EventCounts,
    endedById: string,
    endedAt: Date,
    duration: string
  ) {
    const fields = [
      { name: "Event ID", value: `${event.eventNumber}`, inline: true },
      { name: "Event Name", value: event.title, inline: true },
      { name: "Ended By", value: `<@${endedById}>`, inline: true },
      { name: "Created By / Host", value: `<@${event.hostId}>`, inline: true },
      { name: "Started At", value: this.hasDate(event) ? `<t:${Math.floor(event.startTimestamp / 1000)}:F>` : "TBA", inline: true },
      { name: "Ended At", value: `<t:${Math.floor(endedAt.getTime() / 1000)}:F>`, inline: true },
      { name: "Duration", value: this.hasDuration(event) ? duration : "Unknown", inline: true },
      { name: "Going count", value: `${counts.going}`, inline: true },
      { name: "Can't Go count", value: `${counts.cant}`, inline: true },
      this.logParticipantField("Going", participants.goingNames ?? participants.going),
      this.logParticipantField("Can't Go", participants.cant),
    ];

    if (participants.applicationCounts) {
      fields.push(
        { name: "Accepted Applications", value: `${participants.applicationCounts.accepted}`, inline: true },
        { name: "Pending Applications", value: `${participants.applicationCounts.pending}`, inline: true },
        { name: "Rejected Applications", value: `${participants.applicationCounts.rejected}`, inline: true }
      );
    }

    return giizeEmbed()
      .setTitle("Event Ended")
      .addFields(fields);
  }

  renderListEmbed(events: EventRecord[]) {
    const fields: APIEmbedField[] = events.map(event => ({
      name: `ID: ${event.eventNumber}`,
      value: [
        `Title: ${event.title}`,
        `Status: ${event.status === "scheduled" ? "Active" : "Ended"}`,
        `Starts: ${this.hasDate(event) ? `<t:${Math.floor(event.startTimestamp / 1000)}:F>` : "TBA"}`,
        `Channel: <#${event.channelId}>`,
      ].join("\n"),
      inline: false,
    }));

    return giizeEmbed()
      .setTitle("✨ Giize Events")
      .setDescription(events.length > 0 ? "Upcoming and recent events." : "No events found.")
      .addFields(fields.slice(0, 25));
  }

  renderReminderEmbed(event: EventRecord, label: string) {
    return giizeEmbed()
      .setTitle(`⏰ Event Reminder: ${event.title}`)
      .setDescription(`${label} until this event starts.`)
      .addFields(
        { name: "Event", value: event.title, inline: true },
        { name: "Starts", value: this.hasDate(event) ? `<t:${Math.floor(event.startTimestamp / 1000)}:F>` : "TBA", inline: true },
        { name: "Location", value: event.location ?? "TBA", inline: true }
      );
  }

  private hasDate(event: EventRecord) {
    return event.startTimestamp > 0;
  }

  private hasDuration(event: EventRecord) {
    return event.endTimestamp > 0 && event.endTimestamp > event.startTimestamp;
  }

  private formatDuration(event: EventRecord) {
    const milliseconds = event.endTimestamp - event.startTimestamp;
    const totalMinutes = Math.max(1, Math.round(milliseconds / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return [
      hours ? `${hours}h` : "",
      minutes ? `${minutes}m` : "",
    ].filter(Boolean).join(" ") || "Unknown";
  }

  private participantField(name: string, users: string[], plainText = false) {
    return {
      name: `${name} (${users.length})`,
      value: users.length > 0
        ? (plainText ? users.join(", ") : users.map(user => `<@${user}>`).join(", ")).slice(0, 1024)
        : "No accepted participants yet.",
      inline: false,
    };
  }

  private logParticipantField(name: string, users: string[]) {
    return {
      name,
      value: users.length > 0 ? users.join(", ").slice(0, 1024) : "No accepted participants yet.",
      inline: false,
    };
  }
}

export const eventRenderer = new EventRenderer();
