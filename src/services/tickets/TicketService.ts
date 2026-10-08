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
import {ticketArchiveService} from "./TicketArchiveService.js";
import {glurpsEmbed} from "../../utils/embeds.js";
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

type TicketChannelClassification =
  | { type: "standard"; channel: TextChannel }
  | { type: "application"; channel: TextChannel; applicantId: string }
  | { type: "none" };

const noReasonProvided = "No reason provided.";

sqlite.exec(`CREATE TABLE IF NOT EXISTS ticket_claims (channel_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, admin_id TEXT NOT NULL, claimed_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ticket_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, created_at INTEGER NOT NULL);`);

export class TicketService {
  private readonly closing = new Set<string>();
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
      const member = await guild.members.fetch({ user: userId, force: true });
      const priority = this.determineTicketPriority(member);
      this.logTicketPriority(member, priority);
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
          id: config.ticketStaffRoleId,
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
          `Opening Reason: ${reason.slice(0, 300)}`,
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
        content: `${interaction.user} <@&${config.ticketStaffRoleId}>`,
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
        allowedMentions: { users:[userId],roles:config.ticketStaffRoleId?[config.ticketStaffRoleId]:[],parse:[] },
      });

      this.audit(guild.id,ticketChannel.id,userId,"Opened");
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
    const classification = this.classifyTicketChannel(interaction);

    if (classification.type === "none") {
      await safeEdit(interaction, { content: "This command can only be used inside a ticket." });
      return;
    }

    await classification.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: classification.type === "application" ? true : undefined,
      EmbedLinks: classification.type === "application" ? true : undefined,
    });
    await safeEdit(interaction, { content: `✅ Added ${user} to this ticket.` });
  }

  async removeUser(interaction: ChatInputCommandInteraction, user: User) {
    await interaction.deferReply({ flags: 64 });
    if (!this.isStaff(interaction.member)) {
      await safeEdit(interaction, { content: "❌ Only staff can use this command." });
      return;
    }
    const classification = this.classifyTicketChannel(interaction);

    if (classification.type === "none") {
      await safeEdit(interaction, { content: "This command can only be used inside a ticket." });
      return;
    }

    if (classification.type === "application" && user.id === classification.applicantId) {
      await safeEdit(interaction, { content: "You cannot remove the applicant from their application ticket." });
      return;
    }

    if (
      user.id === interaction.client.user.id ||
      user.id === config.staffRoleId ||
      user.id === interaction.guild?.roles.everyone.id
    ) {
      await safeEdit(interaction, { content: "❌ That user cannot be removed from this ticket." });
      return;
    }

    await classification.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: false,
      SendMessages: false,
      ReadMessageHistory: false,
      AttachFiles: false,
      EmbedLinks: false,
    });
    await safeEdit(interaction, { content: `✅ Removed ${user} from this ticket.` });
  }

  async rename(interaction: ChatInputCommandInteraction, name: string) {
    await interaction.deferReply({ flags: 64 });
    if (!this.isStaff(interaction.member)) {
      await safeEdit(interaction, { content: "❌ Only staff can use this command." });
      return;
    }
    const classification = this.classifyTicketChannel(interaction);

    if (classification.type === "none") {
      await safeEdit(interaction, { content: "This command can only be used inside a ticket." });
      return;
    }

    const newName = `ticket-${this.slug(name)}`.slice(0, 100);
    await classification.channel.setName(newName, `Ticket renamed by ${interaction.user.tag}`);
    await safeEdit(interaction, { content: `✅ Renamed this ticket to ${classification.channel}.` });
  }

  async requestClose(interaction: ButtonInteraction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || !this.hasStandardTicketMetadata(interaction.channel)) {
      await safeReply(interaction, {content:"Only administrators can close support tickets.",flags:64}); return;
    }
    await safeReply(interaction,{content:"Close this ticket? A transcript will be saved before deletion.",flags:64,components:[new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ticket_confirm:${interaction.user.id}:${interaction.channelId}:${Date.now()}`).setLabel("Confirm Close").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ticket_cancel:${interaction.user.id}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary))]});
  }

  async handleManagementButton(interaction: ButtonInteraction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {await safeReply(interaction,{content:"Administrator permission required.",flags:64});return;}
    if (interaction.customId.startsWith("ticket_cancel:")) {
      if (interaction.customId.split(":")[1]!==interaction.user.id) return;
      await interaction.update({content:"Cancelled.",components:[]}); return;
    }
    if (interaction.customId.startsWith("ticket_confirm:")) {
      const [,user,channel,created]=interaction.customId.split(":");
      if(user!==interaction.user.id || channel!==interaction.channelId || Date.now()-Number(created)>60000) {await safeReply(interaction,{content:"Confirmation expired. Click Close again.",flags:64});return;}
      await interaction.update({content:"Saving transcript and closing…",components:[]});
      await this.close(interaction,noReasonProvided);return;
    }
    if(!this.hasStandardTicketMetadata(interaction.channel) || !interaction.guildId) {await safeReply(interaction,{content:"Use this inside a support ticket.",flags:64});return;}
    const claim=sqlite.prepare("SELECT admin_id FROM ticket_claims WHERE channel_id=?").get(interaction.channelId) as {admin_id:string}|undefined;
    const release=interaction.customId==='ticket_unclaim';
    if(release && claim?.admin_id!==interaction.user.id){await safeReply(interaction,{content:"Only the assigned administrator can release this ticket.",flags:64});return;}
    if(!release && claim){await safeReply(interaction,{content:`Already assigned to <@${claim.admin_id}>.`,flags:64});return;}
    if(release) sqlite.prepare("DELETE FROM ticket_claims WHERE channel_id=?").run(interaction.channelId);
    else sqlite.prepare("INSERT INTO ticket_claims VALUES (?,?,?,?)").run(interaction.channelId,interaction.guildId,interaction.user.id,Date.now());
    this.audit(interaction.guildId,interaction.channelId,interaction.user.id,release?'Unclaimed':'Claimed');
    await interaction.reply({content:release?'Ticket released.':`Ticket assigned to <@${interaction.user.id}>.`,allowedMentions:{parse:[]}});
  }

  private audit(guildId:string,channelId:string,actorId:string,action:string) {
    sqlite.prepare("INSERT INTO ticket_audit(guild_id,channel_id,actor_id,action,created_at) VALUES (?,?,?,?,?)").run(guildId,channelId,actorId,action,Date.now());
  }

  async requestCloseReason(interaction: ButtonInteraction) {
    if (!this.hasStandardTicketMetadata(interaction.channel)) {
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

    if (!this.isStaff(interaction.member)) {
      await safeEdit(interaction, { content: "❌ Only staff can use this command." });
      return;
    }

    if (!interaction.channelId) {
      await safeEdit(interaction, { content: "❌ This is not an active ticket." });
      return;
    }

    await this.close(interaction, interaction.fields.getTextInputValue("closeReason"));
  }

  private async close(interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction, reason: string) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {await safeEdit(interaction,{content:"Administrator permission required."});return;}
    if(this.closing.has(interaction.channelId!)) {await safeEdit(interaction,{content:"Ticket is already closing."});return;}
    this.closing.add(interaction.channelId!);
    try {await this.closeUnlocked(interaction,reason);} finally {this.closing.delete(interaction.channelId!);}
  }

  private async closeUnlocked(
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

    if (!("name" in interaction.channel)) {
      await safeEdit(interaction, { content: "❌ This command only works inside ticket channels." });
      return;
    }

    const channel = interaction.channel as TextChannel;
    const classification = this.classifyTicketChannel(interaction);

    if (classification.type === "none") {
      await safeEdit(interaction, { content: "This command can only be used inside a ticket." });
      return;
    }

    if (classification.type === "application") {
      await safeEdit(interaction, { content: "✅ Application ticket closed." }).catch(error => {
        logger.warn("Failed to acknowledge application ticket close. Continuing close flow.", error);
      });
      await this.countdownAndDelete(channel);
      return;
    }

    const ticket = await this.resolveTicket(channel, interaction.guild);

    if (!ticket) {
      await safeEdit(interaction, { content: "This command can only be used inside a ticket." });
      return;
    }

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
    let transcript = transcriptService.createFallbackText(transcriptMetadata);

    try {
      transcript = await transcriptService.createText(channel, transcriptMetadata);
    } catch (error) {
      logger.warn("Failed to generate ticket transcript; keeping ticket open.", error);
      await safeEdit(interaction,{content:"Could not create the transcript. The ticket is still open; please try closing it again."});return;
    }

    await ticketArchiveService.store(channel.id,interaction.guild,transcript);
    const embed=glurpsEmbed().setColor(0x57f287).setAuthor({name:interaction.guild.name,iconURL:interaction.guild.iconURL()??undefined}).setTitle('Ticket Closed').addFields(
      {name:'Ticket ID',value:ticket.ticketNumber,inline:true},{name:'Opened By',value:`<@${ticket.creatorId}>`,inline:true},{name:'Closed By',value:`<@${interaction.user.id}>`,inline:true},
      {name:'Open Time',value:`<t:${Math.floor(ticket.openedAt.getTime()/1000)}:F>`,inline:true},{name:'Duration',value:duration,inline:true},{name:'Reason',value:closingReason.slice(0,1024)}).setFooter({text:'Event Bot'}).setTimestamp(closedAt);
    sqlite.prepare('INSERT OR IGNORE INTO support_ticket_records(channel_id,number,closed_by,closed_at,reason) VALUES (?,?,?,?,?)').run(channel.id,Number(ticket.ticketNumber.replace(/\D/g,'')),interaction.user.id,closedAt.getTime(),closingReason);
    await ticketArchiveService.deliver(channel.id,interaction.client,embed,ticket.creatorId,config.ticketLogsChannelId);
    this.audit(interaction.guild.id,channel.id,interaction.user.id,`Closed: ${closingReason}; transcript stored in Discord`);
    sqlite.prepare("DELETE FROM ticket_claims WHERE channel_id=?").run(channel.id);

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
    if (!this.hasStandardTicketMetadata(interaction.channel)) return undefined;
    return interaction.channel as TextChannel;
  }

  classifyTicketChannel(
    interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction
  ): TicketChannelClassification {
    if (!interaction.channel || !("name" in interaction.channel)) {
      return { type: "none" };
    }

    const channel = interaction.channel as TextChannel;

    if (this.hasStandardTicketMetadata(channel)) {
      return { type: "standard", channel };
    }

    const application = sqlite
      .prepare(`
        SELECT discord_id AS applicantId
        FROM event_applications
        WHERE application_channel_id = ?
      `)
      .get(channel.id) as { applicantId: string } | undefined;

    if (application) {
      return {
        type: "application",
        channel,
        applicantId: application.applicantId,
      };
    }

    return { type: "none" };
  }

  hasStandardTicketMetadata(channel: unknown) {
    if (!channel || typeof channel !== "object" || !("id" in channel)) return false;

    const channelId = typeof channel.id === "string" ? channel.id : "";
    if (channelId && this.activeTickets.has(channelId)) return true;

    if (!("topic" in channel) || typeof channel.topic !== "string") return false;
    return Boolean(this.parseTicketTopic(channel.topic));
  }

  private async resolveTicket(channel: TextChannel, guild: Guild) {
    const activeTicket = this.activeTickets.get(channel.id);
    if (activeTicket) return activeTicket;

    const parsedTicket = this.parseTicketTopic(channel.topic);
    if (!parsedTicket) return null;

    const creator = await guild.members.fetch(parsedTicket.creatorId).catch(() => null);
    return {
      ...parsedTicket,
      creatorTag: creator?.user.tag ?? "Unknown",
    } satisfies ActiveTicket;
  }

  private parseTicketTopic(topic: string | null) {
    if (!topic) return null;

    const ticketNumber = topic.match(/(?:^|\|\s*)Ticket\s+(#[0-9]+)/)?.[1];
    const creatorId = topic.match(/(?:^|\|\s*)Creator ID:\s*(\d+)/)?.[1];
    const type = this.ticketTypeFromTopic(topic.match(/(?:^|\|\s*)Ticket Type:\s*([^|]+)/)?.[1]?.trim());
    const priority = this.priorityFromTopic(topic);
    const openedAtValue = topic.match(/(?:^|\|\s*)Opening Timestamp:\s*([^|]+)/)?.[1]?.trim();
    const openedAtTime = openedAtValue ? Date.parse(openedAtValue) : Number.NaN;

    if (!ticketNumber || !creatorId || !type || Number.isNaN(openedAtTime)) return null;

    return {
      ticketNumber,
      creatorId,
      type,
      priority,
      reason: topic.match(/(?:^|\|\s*)Opening Reason:\s*([^|]+)/)?.[1]?.trim() || "Unavailable after bot restart.",
      openedAt: new Date(openedAtTime),
    };
  }

  private ticketTypeFromTopic(value: string | undefined): TicketType | null {
    const ticketTypes: TicketType[] = ["Support", "Report", "Player Report", "Appeal", "Help", "Builder", "Media"];
    return ticketTypes.find(type => type === value) ?? null;
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

  private logTicketPriority(member: GuildMember, priority: TicketPriority) {
    logger.info(`Ticket priority: member=${member.id} priority=${priority}`);
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
    return member instanceof GuildMember &&
      (member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(config.staffRoleId));
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
