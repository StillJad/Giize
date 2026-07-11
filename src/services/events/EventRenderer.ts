import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbedField,
} from "discord.js";
import { giizeEmbed } from "../../utils/embeds.js";

export type EventStatus = "scheduled" | "ended";
export type RsvpStatus = "going" | "maybe" | "cant";

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
  status: EventStatus;
  createdAt: number;
};

export type EventCounts = Record<RsvpStatus, number>;

export type EventParticipantGroup = {
  going: string[];
  maybe: string[];
  cant: string[];
};

export class EventRenderer {
  renderEventEmbed(event: EventRecord, counts: EventCounts) {
    const startSeconds = Math.floor(event.startTimestamp / 1000);
    const endSeconds = Math.floor(event.endTimestamp / 1000);
    const goingValue = event.maxPlayers
      ? `${counts.going}/${event.maxPlayers}`
      : `${counts.going}`;
    const fields: APIEmbedField[] = [
      { name: "📅 Date & Time", value: `<t:${startSeconds}:F>`, inline: true },
      { name: "🕒 Relative", value: `<t:${startSeconds}:R>\nEnds <t:${endSeconds}:R>`, inline: true },
    ];

    if (event.location) {
      fields.push({ name: "📍 Location", value: event.location, inline: true });
    }

    fields.push(
      { name: `👥 Going (${counts.going})`, value: goingValue, inline: true },
      { name: `❔ Maybe (${counts.maybe})`, value: `${counts.maybe}`, inline: true },
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
          .setCustomId(`event_rsvp:going:${event.id}`)
          .setEmoji("✅")
          .setLabel("Going")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`event_rsvp:maybe:${event.id}`)
          .setEmoji("❔")
          .setLabel("Maybe")
          .setStyle(ButtonStyle.Secondary)
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
    return giizeEmbed()
      .setTitle("Participants")
      .setDescription(event.title)
      .addFields(
        this.participantField("✅ Going", participants.going),
        this.participantField("❔ Maybe", participants.maybe),
        this.participantField("❌ Can't Go", participants.cant)
      );
  }

  renderEndedLogEmbed(
    event: EventRecord,
    participants: EventParticipantGroup,
    counts: EventCounts,
    endedAt: Date,
    duration: string
  ) {
    const totalResponses = counts.going + counts.maybe + counts.cant;

    return giizeEmbed()
      .setTitle("Event Ended")
      .addFields(
        { name: "Event Name", value: event.title, inline: true },
        { name: "Host", value: `<@${event.hostId}>`, inline: true },
        { name: "Started", value: `<t:${Math.floor(event.startTimestamp / 1000)}:F>`, inline: true },
        { name: "Ended", value: `<t:${Math.floor(endedAt.getTime() / 1000)}:F>`, inline: true },
        { name: "Duration", value: duration, inline: true },
        { name: "Total Responses", value: `${totalResponses}`, inline: true },
        { name: "Going", value: `${counts.going}`, inline: true },
        { name: "Maybe", value: `${counts.maybe}`, inline: true },
        { name: "Can't Go", value: `${counts.cant}`, inline: true },
        this.logParticipantField("✅ Going", participants.going),
        this.logParticipantField("❔ Maybe", participants.maybe),
        this.logParticipantField("❌ Can't Go", participants.cant)
      );
  }

  renderListEmbed(events: EventRecord[]) {
    const fields: APIEmbedField[] = events.map(event => ({
      name: event.title,
      value: [
        `Starts <t:${Math.floor(event.startTimestamp / 1000)}:R>`,
        `Host <@${event.hostId}>`,
        `Status ${event.status}`,
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
        { name: "Starts", value: `<t:${Math.floor(event.startTimestamp / 1000)}:F>`, inline: true },
        { name: "Location", value: event.location ?? "TBA", inline: true }
      );
  }

  private participantField(name: string, users: string[]) {
    return {
      name: `${name} (${users.length})`,
      value: users.length > 0 ? users.map(userId => `• <@${userId}>`).join("\n").slice(0, 1024) : "No participants.",
      inline: false,
    };
  }

  private logParticipantField(name: string, users: string[]) {
    return {
      name,
      value: users.length > 0 ? users.map(userId => `<@${userId}>`).join("\n").slice(0, 1024) : "None",
      inline: false,
    };
  }
}

export const eventRenderer = new EventRenderer();
