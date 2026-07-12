import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  GuildMember,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type ModalSubmitInteraction,
  type TextChannel,
  type User,
} from "discord.js";
import { config } from "../../config/config.js";
import { sqlite } from "../../database/database.js";
import { logger } from "../../utils/logger.js";
import { safeEdit, safeReply } from "./interactionResponses.js";
import { ticketRenderer, type TicketPriority, type TicketType } from "./TicketRenderer.js";
import { transcriptService } from "./TranscriptService.js";

type ActiveTicket = {
  ticketNumber: string;
  creatorId: string;
  creatorTag: string;
  type: TicketType;
  priority: TicketPriority;
  reason: string;
  openedAt: Date;
};

const noReasonProvided = "No reason provided.";

export class TicketService {
  private readonly activeTickets = new Map<string, ActiveTicket>();
  private readonly openingTickets = new Set<string>();

  async open(interaction: ChatInputCommandInteraction | ModalSubmitInteraction, type: TicketType, reason: string) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild) {
      await safeEdit(interaction, { content: "❌ Tickets can only be opened in a server." });
      return;
    }

    const guild = interaction.guild;
    const userId = interaction.user.id;

    if (this.hasOpenTicket(guild, userId)) {
      await safeEdit(interaction, { content: "You already have an open ticket." });
      return;
    }

    if (this.openingTickets.has(userId)) {
      await safeEdit(interaction, { content: "You already have a ticket opening." });
      return;
    }

    this.openingTickets.add(userId);

    try {
      const botMember = guild.members.me ?? (await guild.members.fetchMe());
      const member = interaction.member instanceof GuildMember
        ? interaction.member
        : await guild.members.fetch(userId);
      const priority = this.determineTicketPriority(member);
      const channelName = this.nextTicketChannelName(guild, interaction.user.username);
      const openedAt = new Date();
      const ticketNumber = this.claimNextTicketNumber();

      const permissionOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: botMember.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        {
          id: config.staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
      ];

      const ticketCategory = guild.channels.cache.get(config.ticketCategoryId);

      if (!ticketCategory || ticketCategory.type !== ChannelType.GuildCategory) {
        logger.warn(`Ticket category ${config.ticketCategoryId} was not found or is not a category. Creating ticket without a parent.`);
      }

      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: ticketCategory?.type === ChannelType.GuildCategory ? ticketCategory.id : undefined,
        topic: [
          `Ticket ${ticketNumber}`,
          `Creator ID: ${userId}`,
          `Ticket Type: ${type}`,
          `Priority: ${priority}`,
          `Opening Timestamp: ${openedAt.toISOString()}`,
        ].join(" | "),
        permissionOverwrites,
        reason: `Ticket opened by ${interaction.user.tag}`,
      });

      this.activeTickets.set(ticketChannel.id, {
        ticketNumber,
        creatorId: userId,
        creatorTag: interaction.user.tag,
        type,
        priority,
        reason,
        openedAt,
      });

      await ticketChannel.send({
        content: `${interaction.user} <@&${config.staffRoleId}>`,
        embeds: [
          ticketRenderer.renderWelcomeEmbed({
            ticketNumber,
            openedBy: interaction.user,
            type,
            priority,
            reason,
            openedAt,
          }),
        ],
        components: [this.closeTicketRow()],
      });

      await safeEdit(interaction, { content: `✅ Ticket created: ${ticketChannel}` });
    } finally {
      this.openingTickets.delete(userId);
    }
  }

  async closeFromCommand(interaction: ChatInputCommandInteraction, reason: string) {
    await interaction.deferReply({ flags: 64 });
    if (!this.isStaff(interaction.member)) {
      await safeEdit(interaction, { content: "❌ Only staff can use this command." });
      return;
    }
    await this.close(interaction, reason);
  }

  async addUser(interaction: ChatInputCommandInteraction, user: User) {
    await interaction.deferReply({ flags: 64 });
    if (!this.isStaff(interaction.member)) {
      await safeEdit(interaction, { content: "❌ Only staff can use this command." });
      return;
    }
    const channel = this.currentTicketChannel(interaction);

    if (!channel) {
      await safeEdit(interaction, { content: "❌ This command only works inside ticket channels." });
      return;
    }

    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    await safeEdit(interaction, { content: `✅ Added ${user} to this ticket.` });
  }

  async removeUser(interaction: ChatInputCommandInteraction, user: User) {
    await interaction.deferReply({ flags: 64 });
    if (!this.isStaff(interaction.member)) {
      await safeEdit(interaction, { content: "❌ Only staff can use this command." });
      return;
    }
    const channel = this.currentTicketChannel(interaction);

    if (!channel) {
      await safeEdit(interaction, { content: "❌ This command only works inside ticket channels." });
      return;
    }

    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: false,
      SendMessages: false,
      ReadMessageHistory: false,
    });
    await safeEdit(interaction, { content: `✅ Removed ${user} from this ticket.` });
  }

  async rename(interaction: ChatInputCommandInteraction, name: string) {
    await interaction.deferReply({ flags: 64 });
    if (!this.isStaff(interaction.member)) {
      await safeEdit(interaction, { content: "❌ Only staff can use this command." });
      return;
    }
    const channel = this.currentTicketChannel(interaction);

    if (!channel) {
      await safeEdit(interaction, { content: "❌ This command only works inside ticket channels." });
      return;
    }

    const newName = `ticket-${this.slug(name)}`.slice(0, 100);
    await channel.setName(newName, `Ticket renamed by ${interaction.user.tag}`);
    await safeEdit(interaction, { content: `✅ Renamed this ticket to ${channel}.` });
  }

  async requestClose(interaction: ButtonInteraction) {
    await this.closeFromButton(interaction, noReasonProvided);
  }

  async requestCloseReason(interaction: ButtonInteraction) {
    if (!this.activeTickets.has(interaction.channelId)) {
      await safeReply(interaction, { content: "❌ This is not an active ticket.", flags: 64 });
      return;
    }

    await interaction.showModal(this.closeReasonModal());
  }

  async closeFromButton(interaction: ButtonInteraction, reason: string) {
    await interaction.deferReply({ flags: 64 });
    await this.close(interaction, reason);
  }

  async submitCloseReason(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.channelId) {
      await safeEdit(interaction, { content: "❌ This is not an active ticket." });
      return;
    }

    await this.close(interaction, interaction.fields.getTextInputValue("closeReason"));
  }

  private async close(
    interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction,
    closingReasonInput: string
  ) {
    if (!interaction.inGuild() || !interaction.guild || !interaction.channel?.isTextBased()) {
      await safeEdit(interaction, { content: "❌ This command only works inside ticket channels." });
      return;
    }

    const channelId = interaction.channelId;

    if (!channelId) {
      await safeEdit(interaction, { content: "❌ This command only works inside ticket channels." });
      return;
    }

    const ticket = this.activeTickets.get(channelId);

    if (!ticket || !("name" in interaction.channel)) {
      await safeEdit(interaction, { content: "❌ This command only works inside ticket channels." });
      return;
    }

    const channel = interaction.channel as TextChannel;
    const closingReason = closingReasonInput.trim() || noReasonProvided;
    const closedAt = new Date();
    const duration = this.formatDuration(closedAt.getTime() - ticket.openedAt.getTime());
    const transcriptMetadata = {
      serverName: interaction.guild.name,
      ticketNumber: ticket.ticketNumber,
      ticketChannel: channel.name,
      ticketChannelId: channel.id,
      ticketCreator: ticket.creatorTag,
      ticketCreatorId: ticket.creatorId,
      type: ticket.type,
      priority: ticket.priority,
      openedAt: ticket.openedAt,
      closedAt,
      duration,
      closedBy: interaction.user.tag,
      closedById: interaction.user.id,
      openingReason: ticket.reason,
      closingReason,
    };
    const log = {
      ticketNumber: ticket.ticketNumber,
      ticketChannel: `${channel.name} (${channel.id})`,
      openedBy: `<@${ticket.creatorId}>`,
      creatorId: ticket.creatorId,
      closedBy: interaction.user,
      type: ticket.type,
      priority: ticket.priority,
      openingReason: ticket.reason,
      closingReason,
      openedAt: ticket.openedAt,
      closedAt,
      duration,
    };
    let transcript = transcriptService.createFallbackText(transcriptMetadata);

    try {
      transcript = await transcriptService.createText(channel, transcriptMetadata);
    } catch (error) {
      logger.warn("Failed to generate ticket transcript. Continuing close flow.", error);
    }

    let transcriptFile:
      | {
          directory: string;
          filePath: string;
          filename: string;
        }
      | undefined;

    try {
      transcriptFile = await transcriptService.createTempFile(transcript, ticket.ticketNumber);
    } catch (error) {
      logger.warn("Failed to save ticket transcript file. Continuing close flow.", error);
    }

    await this.sendTicketLog(interaction.guild, log, transcriptFile);
    await this.sendCreatorDm(interaction, ticket.creatorId, log, transcriptFile);

    if (transcriptFile) {
      await transcriptService.removeTempFile(transcriptFile);
    }

    this.activeTickets.delete(channel.id);

    await safeEdit(interaction, { content: "✅ Ticket closed." }).catch(error => {
      logger.warn("Failed to acknowledge ticket close. Continuing close flow.", error);
    });

    await this.countdownAndDelete(channel);
  }

  private closeTicketRow() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Close")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("ticket_close_reason")
        .setLabel("Close With Reason")
        .setEmoji("📝")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  private closeReasonModal() {
    return new ModalBuilder()
      .setCustomId("ticket_close_reason")
      .setTitle("Close Ticket")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("closeReason")
            .setLabel("Reason")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
        )
      );
  }

  private currentTicketChannel(interaction: ChatInputCommandInteraction) {
    if (!interaction.channel || !("name" in interaction.channel)) return undefined;
    if (!this.activeTickets.has(interaction.channel.id)) return undefined;
    return interaction.channel as TextChannel;
  }

  private async sendTicketLog(
    guild: Guild,
    log: Parameters<typeof ticketRenderer.renderLogEmbed>[0],
    transcriptFile: { filePath: string; filename: string } | undefined
  ) {
    try {
      const channel = await guild.channels.fetch(config.ticketLogsChannelId).catch(error => {
        logger.warn("Failed to fetch ticket logs channel. Skipping logs.", error);
        return null;
      });

      logger.warn(`Ticket logs channel found? ${Boolean(channel)}`);

      if (!channel) {
        logger.warn(`Ticket logs channel ${config.ticketLogsChannelId} was not found. Skipping logs.`);
        return;
      }

      logger.warn(`Ticket logs channel name: ${"name" in channel ? channel.name : "unknown"}`);
      logger.warn(`Ticket logs channel type: ${channel.type}`);

      if (!channel.isTextBased() || !("send" in channel)) {
        logger.warn(`Ticket logs channel ${config.ticketLogsChannelId} is not text based. Skipping logs.`);
        return;
      }

      const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));

      if (!botMember) {
        logger.warn("Could not resolve bot member. Skipping ticket logs.");
        return;
      }

      const permissions = channel.permissionsFor(botMember);
      const permissionChecks = [
        ["View Channel", PermissionFlagsBits.ViewChannel],
        ["Send Messages", PermissionFlagsBits.SendMessages],
        ["Attach Files", PermissionFlagsBits.AttachFiles],
        ["Embed Links", PermissionFlagsBits.EmbedLinks],
      ] as const;

      for (const [label, permission] of permissionChecks) {
        logger.warn(`Ticket logs bot permission ${label}: ${Boolean(permissions?.has(permission))}`);
      }

      const missingPermissions = permissionChecks
        .filter(([, permission]) => !permissions?.has(permission))
        .map(([label]) => label);

      if (missingPermissions.length > 0) {
        for (const permission of missingPermissions) {
          logger.warn(`Missing ticket logs permission: ${permission}`);
        }
        return;
      }

      if (!transcriptFile) {
        logger.warn("Transcript file was not available. Skipping ticket logs.");
        return;
      }

      await channel.send({
        embeds: [ticketRenderer.renderLogEmbed(log)],
        files: [transcriptService.createAttachment(transcriptFile.filePath, transcriptFile.filename)],
      });
    } catch (error) {
      logger.warn("Failed to send ticket logs. Continuing close flow.", error);
    }
  }

  private async sendCreatorDm(
    interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction,
    creatorId: string,
    log: Parameters<typeof ticketRenderer.renderClosedDmEmbed>[0],
    transcriptFile: { filePath: string; filename: string } | undefined
  ) {
    try {
      if (!transcriptFile) {
        logger.warn("Transcript file was not available. Skipping ticket creator DM.");
        return;
      }

      const creator = await interaction.client.users.fetch(creatorId);

      await creator.send({
        embeds: [ticketRenderer.renderClosedDmEmbed(log)],
        files: [transcriptService.createAttachment(transcriptFile.filePath, transcriptFile.filename)],
      });
    } catch (error) {
      logger.warn("Failed to DM ticket creator. Continuing close flow.", error);
    }
  }

  private hasOpenTicket(guild: Guild, userId: string) {
    return (
      [...this.activeTickets.values()].some(ticket => ticket.creatorId === userId) ||
      this.ticketChannels(guild).some(channel => Boolean(channel.topic?.includes(`Creator ID: ${userId}`)))
    );
  }

  private ticketChannels(guild: Guild) {
    const textChannels = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText);

    if (!config.ticketCategoryId) {
      return this.sortTicketChannels([...textChannels.values()]);
    }

    const categoryChannels = textChannels.filter(channel => channel.parentId === config.ticketCategoryId);
    return this.sortTicketChannels([...(categoryChannels.size > 0 ? categoryChannels : textChannels).values()]);
  }

  private determineTicketPriority(member: GuildMember): TicketPriority {
    if (config.diamondSupporterRoleId && member.roles.cache.has(config.diamondSupporterRoleId)) {
      return "Diamond";
    }

    if (config.ironSupporterRoleId && member.roles.cache.has(config.ironSupporterRoleId)) {
      return "Iron";
    }

    if (config.dirtSupporterRoleId && member.roles.cache.has(config.dirtSupporterRoleId)) {
      return "Dirt";
    }

    return "Normal";
  }

  private sortTicketChannels(channels: TextChannel[]) {
    return channels.sort((left, right) => {
      const priorityDifference = this.priorityRank(this.priorityFromTopic(left.topic)) -
        this.priorityRank(this.priorityFromTopic(right.topic));

      if (priorityDifference !== 0) return priorityDifference;

      return this.openedAtFromTopic(left.topic) - this.openedAtFromTopic(right.topic);
    });
  }

  private priorityFromTopic(topic: string | null): TicketPriority {
    const match = topic?.match(/(?:^|\|\s*)Priority:\s*(Diamond|Iron|Dirt|Normal)/i);
    const value = match?.[1]?.toLowerCase();

    if (value === "diamond") return "Diamond";
    if (value === "iron") return "Iron";
    if (value === "dirt") return "Dirt";
    return "Normal";
  }

  private priorityRank(priority: TicketPriority) {
    switch (priority) {
      case "Diamond":
        return 0;
      case "Iron":
        return 1;
      case "Dirt":
        return 2;
      case "Normal":
        return 3;
    }
  }

  private openedAtFromTopic(topic: string | null) {
    const match = topic?.match(/Opening Timestamp:\s*([^|]+)/);
    const timestamp = match?.[1] ? Date.parse(match[1].trim()) : Number.NaN;
    return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
  }

  private claimNextTicketNumber() {
    const claimNumber = sqlite.transaction(() => {
      const row = sqlite
        .prepare("SELECT next_ticket_number AS nextTicketNumber FROM ticket_counter WHERE id = 1")
        .get() as { nextTicketNumber: number } | undefined;
      const nextTicketNumber = row?.nextTicketNumber ?? 1;

      sqlite
        .prepare("INSERT OR REPLACE INTO ticket_counter (id, next_ticket_number) VALUES (1, ?)")
        .run(nextTicketNumber + 1);

      return nextTicketNumber;
    });

    return `#${String(claimNumber()).padStart(4, "0")}`;
  }

  private nextTicketChannelName(guild: Guild, username: string) {
    const baseName = `ticket-${this.slug(username)}`.slice(0, 80) || "ticket-user";
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
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "user";
  }

  private formatDuration(milliseconds: number) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;

    return [
      hours ? `${hours}h` : "",
      minutes ? `${minutes}m` : "",
      `${seconds}s`,
    ].filter(Boolean).join(" ");
  }

  private isStaff(member: unknown) {
    return member instanceof GuildMember && member.roles.cache.has(config.staffRoleId);
  }

  private async countdownAndDelete(channel: TextChannel) {
    try {
      const countdownMessage = await channel.send("🔒 Ticket closing in 5");

      for (let seconds = 4; seconds >= 1; seconds -= 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await countdownMessage.edit(`🔒 Ticket closing in ${seconds}`).catch(error => {
          logger.warn("Failed to edit ticket close countdown. Continuing close flow.", error);
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      await countdownMessage.edit("Deleting…").catch(error => {
        logger.warn("Failed to edit ticket close countdown. Continuing close flow.", error);
      });
    } catch (error) {
      logger.warn("Failed to send ticket close countdown. Continuing close flow.", error);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    await channel.delete("Ticket closed").catch(error => {
      logger.warn("Failed to delete ticket channel.", error);
    });
  }
}

export const ticketService = new TicketService();
