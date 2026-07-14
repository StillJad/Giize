import { ChannelType, SlashCommandBuilder, type Role, type TextChannel } from "discord.js";
import { eventService } from "../../services/events/EventService.js";
import type { Command } from "../../types/Command.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Create and manage Giize events.")
    .addSubcommand(subcommand =>
      subcommand
        .setName("create")
        .setDescription("Create a new event.")
        .addStringOption(option =>
          option.setName("title").setDescription("Event title.").setRequired(true).setMaxLength(120)
        )
        .addStringOption(option =>
          option.setName("description").setDescription("Event description.").setRequired(true).setMaxLength(2000)
        )
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel where the event panel will be posted.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName("date").setDescription("Discord timestamp, like <t:1735689600:F>.").setRequired(false)
        )
        .addStringOption(option =>
          option.setName("duration").setDescription("Duration, like 90m, 2h, or 1h 30m.").setRequired(false)
        )
        .addStringOption(option =>
          option.setName("time").setDescription("Optional Discord timestamp override, like <t:1735689600:F>.").setRequired(false)
        )
        .addStringOption(option =>
          option.setName("location").setDescription("Event location.").setRequired(false).setMaxLength(200)
        )
        .addIntegerOption(option =>
          option.setName("max_players").setDescription("Maximum Going spots.").setRequired(false).setMinValue(1)
        )
        .addRoleOption(option =>
          option.setName("ping_role").setDescription("Role to ping for the event.").setRequired(false)
        )
        .addRoleOption(option =>
          option.setName("going_role").setDescription("Role given to members who RSVP Going").setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("edit")
        .setDescription("Edit an existing event.")
        .addIntegerOption(option =>
          option
            .setName("event_id")
            .setDescription("The Event ID shown by /event create or /event list")
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(option =>
          option.setName("title").setDescription("New event title.").setRequired(false).setMaxLength(120)
        )
        .addStringOption(option =>
          option.setName("description").setDescription("New event description.").setRequired(false).setMaxLength(2000)
        )
        .addStringOption(option =>
          option.setName("date").setDescription("New Discord timestamp, like <t:1735689600:F>.").setRequired(false)
        )
        .addStringOption(option =>
          option.setName("time").setDescription("Optional Discord timestamp override, like <t:1735689600:F>.").setRequired(false)
        )
        .addStringOption(option =>
          option.setName("duration").setDescription("New duration, like 90m, 2h, or 1h 30m.").setRequired(false)
        )
        .addStringOption(option =>
          option.setName("location").setDescription("New event location.").setRequired(false).setMaxLength(200)
        )
        .addIntegerOption(option =>
          option.setName("max_players").setDescription("New maximum Going spots.").setRequired(false).setMinValue(1)
        )
        .addRoleOption(option =>
          option.setName("ping_role").setDescription("New role to ping for reminders.").setRequired(false)
        )
        .addRoleOption(option =>
          option.setName("going_role").setDescription("New role given to members who RSVP Going.").setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("delete")
        .setDescription("Delete an event.")
        .addIntegerOption(option =>
          option
            .setName("event_id")
            .setDescription("The Event ID shown by /event create or /event list")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("end")
        .setDescription("End and lock an event.")
        .addIntegerOption(option =>
          option
            .setName("event_id")
            .setDescription("The Event ID shown by /event create or /event list")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("List events.")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      await eventService.create(interaction, {
        title: interaction.options.getString("title", true),
        description: interaction.options.getString("description", true),
        date: interaction.options.getString("date"),
        time: interaction.options.getString("time"),
        duration: interaction.options.getString("duration"),
        location: interaction.options.getString("location"),
        maxPlayers: interaction.options.getInteger("max_players"),
          pingRole: interaction.options.getRole("ping_role") as Role | null,
          goingRole: interaction.options.getRole("going_role") as Role | null,
          channel: interaction.options.getChannel("channel", true) as TextChannel,
        });
      return;
    }

    if (subcommand === "edit") {
      await eventService.edit(interaction, {
        eventNumber: interaction.options.getInteger("event_id", true),
        title: interaction.options.getString("title"),
        description: interaction.options.getString("description"),
        date: interaction.options.getString("date"),
        time: interaction.options.getString("time"),
        duration: interaction.options.getString("duration"),
        location: interaction.options.getString("location"),
          maxPlayers: interaction.options.getInteger("max_players"),
          pingRole: interaction.options.getRole("ping_role") as Role | null,
          goingRole: interaction.options.getRole("going_role") as Role | null,
        });
      return;
    }

    if (subcommand === "delete") {
      await eventService.delete(interaction, interaction.options.getInteger("event_id", true));
      return;
    }

    if (subcommand === "end") {
      await eventService.end(interaction, interaction.options.getInteger("event_id", true));
      return;
    }

    if (subcommand === "list") {
      await eventService.list(interaction);
    }
  },
};
