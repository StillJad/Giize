import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildMember,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import { config } from "../../config/config.js";
import { sqlite } from "../../database/database.js";
import { logger } from "../../utils/logger.js";
import { safeEdit, safeReply } from "../tickets/interactionResponses.js";
import { VerificationService } from "../verification/VerificationService.js";
import { eventService } from "./EventService.js";
import {
  eventApplicationRenderer,
  type EventApplicationPlatform,
  type EventApplicationPriority,
  type EventApplicationRecord,
  type EventApplicationStatus,
} from "./EventApplicationRenderer.js";
import type { EventRecord } from "./EventRenderer.js";



type ApplicationRow = {
  id: number;
  event_id: number;
  guild_id: string;
  discord_id: string;
  minecraft_username: string;
  platform: EventApplicationPlatform;
  answer_one: string;
  answer_two: string;
  status: EventApplicationStatus;
  priority: EventApplicationPriority;
  reviewed_by: string | null;
  reviewed_at: number | null;
  application_channel_id: string | null;
  created_at: number;
};

type VerifiedRow = {
  java_username: string | null;
  bedrock_username: string | null;
};

export class EventApplicationService {
  private readonly reviewing = new Set<number>();
  async openModal(interaction: ButtonInteraction, eventId: number) {
    if (!interaction.inGuild()) {
      await safeReply(interaction, { content: "Events can only be used in a server.", flags: 64 });
      return;
    }

    const event = eventService.getEventById(eventId);

    if (!event || event.guildId !== interaction.guildId || event.status === "ended") {
      await safeReply(interaction, { content: "❌ This event is not accepting applications.", flags: 64 });
      return;
    }

    if (event.googleFormsEnabled) {
      await this.openGoogleForm(interaction, eventId);
      return;
    }

    const verified = this.getVerifiedAccount(interaction.guildId!, interaction.user.id);


    if (this.hasExistingApplication(event.id, interaction.user.id)) {
      await safeReply(interaction, { content: "You have already applied for this event.", flags: 64 });
      return;
    }

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`event_application:${event.id}`)
        .setTitle("Event Application")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("answer_one")
              .setLabel("Why should you play the event?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(1000)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("answer_two")
              .setLabel("What will you do in the event?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(1000)
          )
        )
    );
  }

  async openGoogleForm(interaction: ButtonInteraction, eventId: number) {
    if (!interaction.inGuild()) {
      await safeReply(interaction, { content: "Events can only be used in a server.", flags: 64 });
      return;
    }

    const event = eventService.getEventById(eventId);
    if (
      !event
      || event.guildId !== interaction.guildId
      || event.status === "ended"
      || !event.googleFormsEnabled
      || !event.googleFormUrl
    ) {
      await safeReply(interaction, { content: "❌ This event is not accepting applications.", flags: 64 });
      return;
    }


    await safeReply(interaction, {
      content: "Continue to the event application form:",
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel("Open Google Form")
            .setEmoji("📝")
            .setStyle(ButtonStyle.Link)
            .setURL(event.googleFormUrl)
        ),
      ],
      flags: 64,
    });
  }

  async submit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild) {
      await safeEdit(interaction, { content: "Events can only be used in a server." });
      return;
    }

    const eventId = Number(interaction.customId.substring("event_application:".length));
    const event = eventService.getEventById(eventId);

    if (!event || event.guildId !== interaction.guildId || event.status === "ended") {
      await safeEdit(interaction, { content: "❌ This event is not accepting applications." });
      return;
    }

    if (this.hasExistingApplication(event.id, interaction.user.id)) {
      await safeEdit(interaction, { content: "You have already applied for this event." });
      return;
    }

    const answerOne = interaction.fields.getTextInputValue("answer_one").trim();
    const answerTwo = interaction.fields.getTextInputValue("answer_two").trim();

    const verified = this.getVerifiedAccount(interaction.guildId, interaction.user.id);


    const member = interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);
    const priority = this.priorityFor(member);
    const autoAccepted = priority !== "Normal";
    const application = this.createApplication({
      event,
      discordId: interaction.user.id,
      minecraftUsername: verified?.minecraftUsername ?? member.displayName,
      platform: verified?.platform ?? "Unverified",
      answerOne,
      answerTwo,
      priority,
      status: autoAccepted ? "accepted" : "pending",
      reviewedBy: autoAccepted ? interaction.client.user.id : null,
    });

    if (autoAccepted) {
      await eventService.acceptApplicant(interaction.guild, interaction.client, event, interaction.user.id);
    }

    await this.createApplicationTicket(interaction.guild, event, application, autoAccepted);
    await this.logApplication(interaction.guild, event, application, "Application submitted", null, false);

    if (autoAccepted) {
      await this.logApplication(interaction.guild, event, application, "Automatically accepted", application.reviewedBy, true);
    }

    await safeEdit(interaction, {
      content: autoAccepted
        ? "✅ Application submitted and automatically accepted."
        : "✅ Application submitted for staff review.",
    });
  }

  async review(interaction: ButtonInteraction, applicationId: number, status: EventApplicationStatus) {
    if (this.reviewing.has(applicationId)) {
      await safeReply(interaction, { content: "This application is being updated. Try again in a moment.", flags: 64 });
      return;
    }
    this.reviewing.add(applicationId);
    try {
      await this.reviewUnlocked(interaction, applicationId, status);
    } finally {
      this.reviewing.delete(applicationId);
    }
  }

  private async reviewUnlocked(interaction: ButtonInteraction, applicationId: number, status: EventApplicationStatus) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild || !this.canReview(interaction.member)) {
      await safeEdit(interaction, { content: "You don't have permission to review event applications." });
      return;
    }

    const application = this.getApplication(applicationId);
    if (!application) {
      await safeEdit(interaction, { content: "Application not found." });
      return;
    }

    const event = eventService.getEventById(application.eventId);
    if (!event || event.guildId !== interaction.guildId || event.status === "ended") {
      await safeEdit(interaction, { content: "Event not found." });
      return;
    }

    if (application.status === status) {
      await safeEdit(interaction, { content: "This application already has that status." });
      return;
    }

    const previousStatus = application.status;
    const reviewedAt = Date.now();
    sqlite.prepare(`
      UPDATE event_applications
      SET status = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ?
    `).run(status, interaction.user.id, reviewedAt, application.id);

    const updated = this.getApplication(application.id);
    if (!updated) {
      await safeEdit(interaction, { content: "Application could not be updated." });
      return;
    }

    if (status === "accepted") {
      await eventService.acceptApplicant(interaction.guild, interaction.client, event, application.discordId);
    } else {
      await eventService.removeApplicant(interaction.guild, interaction.client, event, application.discordId);
    }

    await interaction.message.edit({
      embeds: [eventApplicationRenderer.renderTicketEmbed(event, updated)],
      components: eventApplicationRenderer.renderReviewComponents(application.id, false),
    }).catch(error => logger.warn("Failed to update application ticket message.", error));

    if (interaction.channel?.isTextBased() && "send" in interaction.channel) {
      await interaction.channel.send({
        content: status === "accepted"
          ? `<@${application.discordId}> your application has been accepted.`
          : `<@${application.discordId}> your application is now ${status === "pending" ? "pending review" : "denied"}.`,
        allowedMentions: { users: [application.discordId] },
      }).catch(() => {});
    }

    await this.logApplication(
      interaction.guild,
      event,
      updated,
      `Decision changed: ${previousStatus} → ${status}`,
      interaction.user.id,
      false
    );

    await safeEdit(interaction, { content: `Application status: ${status}.` });
  }

  async editUsername(interaction: ButtonInteraction, applicationId: number) {
    const application = this.getApplication(applicationId);
    const event = application && eventService.getEventById(application.eventId);
    if (!interaction.inGuild() || !this.canReview(interaction.member) || !application || !event || event.guildId !== interaction.guildId || event.status === "ended") {
      await safeReply(interaction, { content: "Only administrators can edit an active event application.", flags: 64 });
      return;
    }
    await interaction.showModal(new ModalBuilder()
      .setCustomId(`event_app_username:${applicationId}:${interaction.message.id}`)
      .setTitle("Edit Minecraft Username")
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
        .setCustomId("username").setLabel("Minecraft username (for this event)")
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setValue(application.minecraftUsername.slice(0, 32)))));
  }

  async saveUsername(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ flags: 64 });
    const [, id, messageId] = interaction.customId.split(":");
    const application = this.getApplication(Number(id));
    const event = application && eventService.getEventById(application.eventId);
    if (!interaction.guild || !this.canReview(interaction.member) || !application || !event || event.guildId !== interaction.guildId || event.status === "ended") {
      await safeEdit(interaction, { content: "Only administrators can edit an active event application." });
      return;
    }
    const username = interaction.fields.getTextInputValue("username").trim();
    if (!username || !/^[.a-zA-Z0-9_ -]{1,32}$/.test(username)) {
      await safeEdit(interaction, { content: "Enter a valid Minecraft username or Bedrock gamertag (up to 32 characters)." });
      return;
    }
    sqlite.prepare("UPDATE event_applications SET minecraft_username = ? WHERE id = ?").run(username, application.id);
    const updated = this.getApplication(application.id)!;
    if (interaction.channel?.isTextBased() && "messages" in interaction.channel) {
      const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
      await message?.edit({ embeds: [eventApplicationRenderer.renderTicketEmbed(event, updated)], components: eventApplicationRenderer.renderReviewComponents(application.id, false) });
    }
    if (updated.status === "accepted") await eventService.acceptApplicant(interaction.guild, interaction.client, event, updated.discordId);
    await this.logApplication(interaction.guild, event, updated, `Username changed: ${application.minecraftUsername} → ${username}`, interaction.user.id, false);
    await safeEdit(interaction, { content: `Event username updated to ${username}.` });
  }

  private createApplication(input: {
    event: EventRecord;
    discordId: string;
    minecraftUsername: string;
    platform: EventApplicationPlatform;
    answerOne: string;
    answerTwo: string;
    priority: EventApplicationPriority;
    status: EventApplicationStatus;
    reviewedBy: string | null;
  }) {
    const now = Date.now();
    const insert = sqlite.prepare(`
      INSERT INTO event_applications (
        event_id, guild_id, discord_id, minecraft_username, platform, answer_one,
        answer_two, status, priority, reviewed_by, reviewed_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.event.id,
      input.event.guildId,
      input.discordId,
      input.minecraftUsername,
      input.platform,
      input.answerOne,
      input.answerTwo,
      input.status,
      input.priority,
      input.reviewedBy,
      input.reviewedBy ? now : null,
      now
    );

    const application = this.getApplication(Number(insert.lastInsertRowid));
    if (!application) throw new Error("Application insert failed.");
    return application;
  }

  private async createApplicationTicket(guild: Guild, event: EventRecord, application: EventApplicationRecord, autoAccepted: boolean) {
    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    const categoryId = config.eventApplicationCategoryId || config.ticketCategoryId;
    const category = categoryId ? await guild.channels.fetch(categoryId).catch(() => null) : null;
    const channel = await guild.channels.create({
      name: this.nextApplicationChannelName(guild, application.minecraftUsername),
      type: ChannelType.GuildText,
      parent: category?.type === ChannelType.GuildCategory ? category.id : undefined,
      permissionOverwrites: [
        ...(config.staffRoleId && config.staffRoleId!==config.ticketStaffRoleId?[{id:config.staffRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]}]:[]),
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: application.discordId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: config.ticketStaffRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
        },
        {
          id: botMember.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
        },
      ],
      reason: `Event application ${application.id}`,
    });

    sqlite.prepare("UPDATE event_applications SET application_channel_id = ? WHERE id = ?")
      .run(channel.id, application.id);

    await channel.send({
      content: `<@&${config.ticketStaffRoleId}>`,
      allowedMentions: {roles:[config.ticketStaffRoleId],parse:[]},
      embeds: [eventApplicationRenderer.renderTicketEmbed(event, application, autoAccepted ? "automatic" : "manual")],
      components: eventApplicationRenderer.renderReviewComponents(application.id, false),
    });


  }

  private async logApplication(guild: Guild, event: EventRecord, application: EventApplicationRecord, action: string, reviewerId: string | null, automatic: boolean) {
    sqlite.prepare(`INSERT INTO event_application_audit (application_id, event_id, guild_id, actor_id, action, status, minecraft_username, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(application.id, event.id, guild.id, reviewerId, action, application.status, application.minecraftUsername, Date.now());
    const channel = await guild.channels.fetch(config.eventLogsChannelId).catch(() => null);
    if (!channel?.isTextBased() || !("send" in channel)) return;

    await channel.send({
      embeds: [eventApplicationRenderer.renderLogEmbed(event, application, action, reviewerId, automatic)],
      allowedMentions: { parse: [] },
    }).catch(error => logger.warn("Failed to send event application log.", error));
  }

  private getVerifiedAccount(guildId: string, discordId: string) {
    const row = sqlite.prepare(`
      SELECT java_username, bedrock_username
      FROM verified_players
      WHERE guild_id = ? AND discord_id = ?
    `).get(guildId, discordId) as VerifiedRow | undefined;

    if (row?.java_username) {
      return {
        minecraftUsername: row.java_username,
        platform: "Java" as const,
      };
    }

    if (row?.bedrock_username) {
      return {
        minecraftUsername: VerificationService.normalizeBedrockNickname(row.bedrock_username),
        platform: "Bedrock" as const,
      };
    }

    return null;
  }

  private hasExistingApplication(eventId: number, discordId: string) {
    return Boolean(sqlite.prepare(`
      SELECT 1 FROM event_applications
      WHERE event_id = ? AND discord_id = ? AND status IN ('pending', 'accepted', 'rejected')
    `).get(eventId, discordId));
  }

  private getApplication(applicationId: number) {
    const row = sqlite.prepare("SELECT * FROM event_applications WHERE id = ?").get(applicationId) as ApplicationRow | undefined;
    return row ? this.toApplication(row) : null;
  }

  private toApplication(row: ApplicationRow): EventApplicationRecord {
    return {
      id: row.id,
      eventId: row.event_id,
      guildId: row.guild_id,
      discordId: row.discord_id,
      minecraftUsername: row.minecraft_username,
      platform: row.platform,
      answerOne: row.answer_one,
      answerTwo: row.answer_two,
      status: row.status,
      priority: row.priority,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    };
  }

  private priorityFor(member: GuildMember): EventApplicationPriority {
    if (config.diamondSupporterRoleId && member.roles.cache.has(config.diamondSupporterRoleId)) return "Diamond";
    if (config.ironSupporterRoleId && member.roles.cache.has(config.ironSupporterRoleId)) return "Iron";
    if (config.dirtSupporterRoleId && member.roles.cache.has(config.dirtSupporterRoleId)) return "Dirt";
    return "Normal";
  }

  private canReview(member: unknown) {
    return member instanceof GuildMember && member.permissions.has(PermissionFlagsBits.Administrator);
  }

  private nextApplicationChannelName(guild: Guild, username: string) {
    const baseName = `event-app-${this.slug(username)}`.slice(0, 80) || "event-app-user";
    let candidate = baseName;
    let suffix = 2;

    while (guild.channels.cache.some(channel => channel.name === candidate)) {
      candidate = `${baseName}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private slug(value: string) {
    return value
      .toLowerCase()
      .replace(/^\./, "")
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "user";
  }
}

export const eventApplicationService = new EventApplicationService();
