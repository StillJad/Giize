import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hostname, uptime } from "node:os";
import {
  ActionRowBuilder,
  ChannelType,
  GuildMember,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type Client,
  type Guild,
  type Role,
  type TextChannel,
} from "discord.js";
import { config } from "../config/config.js";
import { sqlite } from "../database/database.js";
import { giizeEmbed } from "../utils/embeds.js";
import { logger } from "../utils/logger.js";
import { auditLogService } from "../services/audit/AuditLogService.js";
import { autoModService } from "../services/automod/AutoModService.js";
import { eventRenderer, type EventRecord } from "../services/events/EventRenderer.js";
import { eventService } from "../services/events/EventService.js";
import { ticketService } from "../services/tickets/TicketService.js";
import { welcomeDescription, welcomeTitle } from "../services/welcome/WelcomeRenderer.js";
import { safeEqual, signDashboardToken, verifyDashboardTokenDetailed, type DashboardTokenPayload } from "./DashboardAuth.js";
import { accessLevelFor, channelPermissionStatus, countsByStatus, guildChannels, guildRoles, json, requireEdit } from "./routes/shared.js";

type ApiResult = ReturnType<typeof json>;

type DashboardRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  actor: DashboardTokenPayload | null;
  body: unknown;
};

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
  status: "scheduled" | "ended";
  created_at: number;
};

export class DashboardApiServer {
  private server = createServer((request, response) => void this.handle(request, response));
  private readonly startedAt = Date.now();
  private readonly rateLimits = new Map<string, { count: number; resetsAt: number }>();

  constructor(private readonly client: Client) {}

  start() {
    logger.info(`Dashboard config: internal secret configured=${Boolean(config.dashboardInternalSecret)} session secret configured=${Boolean(process.env.DASHBOARD_SESSION_SECRET)} guild ID configured=${Boolean(config.dashboardGuildId)}`);

    if (!config.dashboardInternalSecret) {
      logger.warn("Dashboard API disabled: DASHBOARD_INTERNAL_SECRET is not configured.");
      return;
    }

    this.server.listen(config.dashboardApiPort, "0.0.0.0", () => {
      logger.info(`✓ Dashboard API listening on ${config.dashboardApiPort}`);
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    try {
      if (!this.authorized(request)) {
        logger.warn("Dashboard internal authentication failed.");
        this.write(response, json({ error: "Unauthorized" }, 401));
        return;
      }

      if (!this.rateLimit(request)) {
        this.write(response, json({ error: "Too many requests" }, 429));
        return;
      }

      const url = new URL(request.url ?? "/", "http://giize-bot");
      const tokenResult = verifyDashboardTokenDetailed(request.headers["x-dashboard-token"]?.toString() ?? "");
      if (!tokenResult.ok && url.pathname !== "/health" && url.pathname !== "/auth/member") {
        logger.warn(`Dashboard token rejected: ${tokenResult.reason}`);
      }
      const actor = tokenResult.ok ? tokenResult.payload : null;
      const body = request.method === "GET" ? null : await this.readBody(request);
      const result = await this.route({ method: request.method ?? "GET", path: url.pathname, query: url.searchParams, actor, body });
      this.write(response, result);
    } catch (error) {
      logger.error("Dashboard API request failed.", error, { type: "dashboard-api", name: request.url ?? "unknown" });
      this.write(response, json({ error: "Something went wrong." }, 500));
    }
  }

  private async route(request: DashboardRequest): Promise<ApiResult> {
    if (request.path === "/health") return json(await this.health());
    if (request.path === "/auth/member" && request.method === "POST") return this.authMember(request.body);

    if (!request.actor) return json({ error: "Dashboard token required" }, 401);

    if (request.path === "/guild") return this.guild();
    if (request.path === "/overview") return this.overview();
    if (request.path === "/welcome") return request.method === "GET" ? this.welcome() : this.updateWelcome(request);
    if (request.path === "/tickets") return this.tickets();
    if (request.path === "/tickets/panel" && request.method === "POST") return this.sendTicketPanel(request);
    if (request.path === "/events") return request.method === "GET" ? this.events() : this.createEvent(request);
    if (request.path.startsWith("/events/") && request.method === "PATCH") return this.updateEvent(request);
    if (request.path.startsWith("/events/") && request.method === "DELETE") return this.deleteEvent(request);
    if (request.path.startsWith("/events/") && request.path.endsWith("/end") && request.method === "POST") return this.endEvent(request);
    if (request.path.startsWith("/applications/") && request.method === "POST") return this.reviewApplication(request);
    if (request.path === "/automod") return request.method === "GET" ? this.automod() : this.updateAutoMod(request);
    if (request.path.startsWith("/automod/") && request.method === "POST") return this.mutateAutoModList(request);
    if (request.path === "/logging") return request.method === "GET" ? this.logging() : this.updateLogging(request);
    if (request.path === "/verification") return this.verification(request);
    if (request.path === "/settings") return this.settings(request);
    if (request.path === "/tools/member") return this.lookupMember(request);
    if (request.path === "/tools/role" && request.method === "POST") return this.roleTool(request);
    if (request.path === "/tools/nickname" && request.method === "POST") return this.nicknameTool(request);
    if (request.path === "/tools/warnings") return request.method === "GET" ? this.memberWarnings(request) : this.warningTool(request);
    if (request.path === "/tools/timeout" && request.method === "POST") return this.timeoutTool(request);
    if (request.path === "/tools/channel" && request.method === "POST") return this.channelTool(request);
    if (request.path === "/tools/announcement" && request.method === "POST") return this.announcementTool(request);

    return json({ error: "Not found" }, 404);
  }

  private async authMember(body: unknown) {
    const discordUserId = this.stringField(body, "discordUserId");
    const guild = await this.dashboardGuild();
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return json({ allowed: false }, 403);
    const accessLevel = accessLevelFor(member);
    if (!accessLevel) return json({ allowed: false }, 403);
    return json({
      allowed: true,
      accessLevel,
      token: signDashboardToken({ discordUserId, guildId: guild.id, accessLevel }),
      guild: this.guildSummary(guild),
      user: {
        id: member.id,
        username: member.user.username,
        avatar: member.user.displayAvatarURL(),
      },
    });
  }

  private async health() {
    const guild = await this.dashboardGuild().catch(() => null);
    return {
      online: this.client.isReady(),
      loginUser: this.client.user?.tag ?? null,
      version: process.env.npm_package_version ?? "1.0.0",
      gitCommit: process.env.GIT_COMMIT ?? null,
      uptime: Math.floor(process.uptime()),
      processUptime: Math.floor(uptime()),
      memory: process.memoryUsage(),
      ping: this.client.ws.ping,
      sqlite: sqlite.open,
      hostname: hostname(),
      startedAt: this.startedAt,
      commandCount: this.client.application?.commands.cache.size ?? null,
      guild: guild ? this.guildSummary(guild) : null,
    };
  }

  private async guild() {
    const guild = await this.dashboardGuild();
    return json({ guild: this.guildSummary(guild), channels: await guildChannels(guild), roles: await guildRoles(guild) });
  }

  private async overview() {
    const guild = await this.dashboardGuild();
    const health = await this.health();
    const openTickets = [...guild.channels.cache.values()].filter((channel): channel is TextChannel =>
      channel.type === ChannelType.GuildText && ticketService.hasStandardTicketMetadata(channel)
    );
    const applicationTickets = sqlite.prepare("SELECT COUNT(*) AS total FROM event_applications WHERE application_channel_id IS NOT NULL AND status = 'pending'")
      .get() as { total: number };
    const activeEvents = sqlite.prepare("SELECT COUNT(*) AS total FROM events WHERE guild_id = ? AND status = 'scheduled'")
      .get(guild.id) as { total: number };
    const verified = sqlite.prepare(`
      SELECT
        SUM(CASE WHEN java_username IS NOT NULL THEN 1 ELSE 0 END) AS java,
        SUM(CASE WHEN bedrock_username IS NOT NULL THEN 1 ELSE 0 END) AS bedrock
      FROM verified_players
      WHERE guild_id = ?
    `).get(guild.id) as { java: number | null; bedrock: number | null };
    const automod = sqlite.prepare("SELECT enabled FROM automod_configs WHERE guild_id = ?").get(guild.id) as { enabled: number } | undefined;
    return json({
      health,
      memberCount: guild.memberCount,
      verifiedJava: verified.java ?? 0,
      verifiedBedrock: verified.bedrock ?? 0,
      openTickets: openTickets.length,
      openEventApplications: applicationTickets.total,
      activeEvents: activeEvents.total,
      automodEnabled: Boolean(automod?.enabled),
      recentActivity: {
        latestTicketOpened: this.latestTicket(openTickets),
        latestEventApplication: sqlite.prepare("SELECT id, minecraft_username, status, created_at FROM event_applications ORDER BY created_at DESC LIMIT 1").get() ?? null,
        latestModerationAction: sqlite.prepare("SELECT id, user_id, moderator_id, reason, created_at FROM moderation_warnings ORDER BY created_at DESC LIMIT 1").get() ?? null,
        latestAutoModAction: sqlite.prepare("SELECT id, user_id, rule, reason, created_at FROM automod_warnings ORDER BY created_at DESC LIMIT 1").get() ?? null,
      },
    });
  }

  private async welcome() {
    const guild = await this.dashboardGuild();
    const row = sqlite.prepare("SELECT * FROM welcome_configs WHERE guild_id = ?").get(guild.id);
    return json({ config: row ?? this.defaultWelcome(guild.id), channels: await guildChannels(guild), roles: await guildRoles(guild) });
  }

  private async updateWelcome(request: DashboardRequest) {
    if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    const guild = await this.dashboardGuild();
    const current = sqlite.prepare("SELECT * FROM welcome_configs WHERE guild_id = ?").get(guild.id) ?? this.defaultWelcome(guild.id);
    const body = request.body as Record<string, unknown>;
    const action = this.stringField(body, "action", false);
    const next = {
      enabled: action === "enable" ? 1 : action === "disable" ? 0 : this.optionalBool(body.enabled, Boolean((current as { enabled: number }).enabled)) ? 1 : 0,
      channel_id: this.stringField(body, "channelId", false) || (current as { channel_id: string }).channel_id,
      role_id: this.nullableString(body, "roleId"),
      image_url: this.stringField(body, "imageUrl", false) || config.welcomeBannerUrl,
      title: action === "reset" ? welcomeTitle : this.stringField(body, "title", false) || (current as { title: string }).title,
      description: action === "reset" ? welcomeDescription : this.stringField(body, "description", false) || (current as { description: string }).description,
    };
    sqlite.prepare(`
      INSERT INTO welcome_configs (guild_id, enabled, channel_id, title, description, role_id, image_url, thumbnail_url, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled = excluded.enabled, channel_id = excluded.channel_id, title = excluded.title,
        description = excluded.description, role_id = excluded.role_id, image_url = excluded.image_url,
        updated_at = excluded.updated_at
    `).run(guild.id, next.enabled, next.channel_id, next.title, next.description, next.role_id, next.image_url, Date.now(), Date.now());
    await this.audit(request, "Dashboard Welcome Updated", "Welcome", current, next);
    return json({ ok: true });
  }

  private async tickets() {
    const guild = await this.dashboardGuild();
    const channels = [...guild.channels.cache.values()].filter((channel): channel is TextChannel =>
      channel.type === ChannelType.GuildText && ticketService.hasStandardTicketMetadata(channel)
    );
    const tickets = await Promise.all(channels.map(async channel => {
      const parsed = this.ticketFromTopic(channel.topic);
      const creator = parsed.creatorId ? await guild.members.fetch(parsed.creatorId).catch(() => null) : null;
      return {
        channelId: channel.id,
        channelName: channel.name,
        topic: channel.topic ?? "",
        creatorName: creator?.displayName ?? "Unknown member",
        creatorAvatar: creator?.displayAvatarURL() ?? null,
        ...parsed,
      };
    }));
    return json({
      guildId: guild.id,
      config: {
        ticketCategory: await this.channelLabel(guild, config.ticketCategoryId),
        ticketLogsChannel: await this.channelLabel(guild, config.ticketLogsChannelId),
        staffRole: await this.roleLabel(guild, config.staffRoleId),
        eventApplicationCategory: await this.channelLabel(guild, config.eventApplicationCategoryId || config.ticketCategoryId),
        diamondSupporterRole: await this.roleLabel(guild, config.diamondSupporterRoleId),
        ironSupporterRole: await this.roleLabel(guild, config.ironSupporterRoleId),
        dirtSupporterRole: await this.roleLabel(guild, config.dirtSupporterRoleId),
      },
      counts: {
        Diamond: tickets.filter(ticket => ticket.priority === "Diamond").length,
        Iron: tickets.filter(ticket => ticket.priority === "Iron").length,
        Dirt: tickets.filter(ticket => ticket.priority === "Dirt").length,
        Normal: tickets.filter(ticket => ticket.priority === "Normal").length,
      },
      tickets,
      channels: await guildChannels(guild),
    });
  }

  private async sendTicketPanel(request: DashboardRequest) {
    if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    const guild = await this.dashboardGuild();
    const channelId = this.stringField(request.body, "channelId");
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || !("send" in channel)) return json({ error: "Invalid channel" }, 400);
    await channel.send({
      embeds: [giizeEmbed().setTitle("Ticket 🎟️").setDescription("Select a ticket type below!")],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ticket_panel_select")
            .setPlaceholder("Make a selection")
            .addOptions(
              { label: "Support", description: "Get help from the staff team.", emoji: "🎫", value: "support" },
              { label: "Player Report", description: "Report a player or rule violation.", emoji: "🚨", value: "report" },
              { label: "Help", description: "General questions or other assistance.", emoji: "❓", value: "help" }
            )
        ),
      ],
    });
    await this.audit(request, "Dashboard Ticket Panel Sent", "Tickets", null, { channelId });
    return json({ ok: true });
  }

  private async events() {
    const guild = await this.dashboardGuild();
    const rows = sqlite.prepare("SELECT * FROM events WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50").all(guild.id).map(row => this.toEvent(row as EventRow));
    const applications = sqlite.prepare("SELECT * FROM event_applications WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100").all(guild.id);
    return json({
      events: rows.map(event => ({
        ...event,
        applications: countsByStatus(event.id),
        acceptedParticipants: (sqlite.prepare("SELECT COUNT(*) AS total FROM event_participants WHERE event_id = ? AND status = 'going'").get(event.id) as { total: number }).total,
      })),
      applications,
      channels: await guildChannels(guild),
      roles: await guildRoles(guild),
    });
  }

  private async createEvent(request: DashboardRequest) {
    if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    const guild = await this.dashboardGuild();
    const body = request.body as Record<string, unknown>;
    const startInput = this.stringField(body, "start", false);
    const durationInput = this.stringField(body, "duration", false);
    const startTimestamp = startInput ? this.parseDiscordTimestamp(startInput) : 0;
    const durationMinutes = durationInput ? this.parseDuration(durationInput) : null;
    const channel = await guild.channels.fetch(this.stringField(body, "channelId")).catch(() => null);
    if ((startInput && !startTimestamp) || (durationInput && !durationMinutes) || !channel?.isTextBased() || !("send" in channel)) return json({ error: "Invalid event input" }, 400);
    const eventNumber = this.nextEventNumber(guild.id);
    const now = Date.now();
    const resolvedStartTimestamp = startTimestamp ?? 0;
    const endTimestamp = durationMinutes ? resolvedStartTimestamp + durationMinutes * 60_000 : 0;
    const insert = sqlite.prepare(`
      INSERT INTO events (event_number, guild_id, message_id, channel_id, host_id, title, description, location, start_timestamp, end_timestamp, max_players, ping_role, going_role, status, created_at)
      VALUES (?, ?, '', ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, 'scheduled', ?)
    `).run(eventNumber, guild.id, channel.id, request.actor!.discordUserId, this.stringField(body, "title"), this.stringField(body, "description"), resolvedStartTimestamp, endTimestamp, this.nullableString(body, "pingRole"), this.nullableString(body, "goingRole"), now);
    const event = this.toEvent(sqlite.prepare("SELECT * FROM events WHERE id = ?").get(Number(insert.lastInsertRowid)) as EventRow);
    const message = await channel.send({ embeds: [eventRenderer.renderEventEmbed(event, { going: 0, cant: 0 })], components: eventRenderer.renderEventComponents(event) });
    sqlite.prepare("UPDATE events SET message_id = ? WHERE id = ?").run(message.id, event.id);
    await this.audit(request, "Dashboard Event Created", "Events", null, { eventNumber, title: event.title });
    return json({ ok: true, eventNumber });
  }

  private async updateEvent(request: DashboardRequest) {
    if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    const guild = await this.dashboardGuild();
    const eventNumber = Number(request.path.split("/")[2]);
    const event = this.eventByNumber(guild.id, eventNumber);
    if (!event) return json({ error: "No event was found with that ID." }, 404);
    if (event.status === "ended") return json({ error: "That event has already ended." }, 400);
    const body = request.body as Record<string, unknown>;
    sqlite.prepare(`
      UPDATE events SET title = ?, description = ?, ping_role = ?, going_role = ? WHERE id = ?
    `).run(
      this.stringField(body, "title", false) || event.title,
      this.stringField(body, "description", false) || event.description,
      this.nullableString(body, "pingRole") ?? event.pingRole,
      this.nullableString(body, "goingRole") ?? event.goingRole,
      event.id
    );
    await this.refreshEventMessage(event.id);
    await this.audit(request, "Dashboard Event Updated", "Events", event, this.eventByNumber(guild.id, eventNumber));
    return json({ ok: true });
  }

  private async endEvent(request: DashboardRequest) {
    if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    const guild = await this.dashboardGuild();
    const event = this.eventByNumber(guild.id, Number(request.path.split("/")[2]));
    if (!event) return json({ error: "No event was found with that ID." }, 404);
    sqlite.prepare("UPDATE events SET status = 'ended' WHERE id = ?").run(event.id);
    await this.refreshEventMessage(event.id);
    await this.audit(request, "Dashboard Event Ended", "Events", null, { eventNumber: event.eventNumber, title: event.title });
    return json({ ok: true });
  }

  private async deleteEvent(request: DashboardRequest) {
    if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    const guild = await this.dashboardGuild();
    const eventNumber = Number(request.path.split("/")[2]);
    const event = this.eventByNumber(guild.id, eventNumber);
    if (!event) return json({ error: "No event was found with that ID." }, 404);
    await eventService.deleteByNumber(guild, this.client, eventNumber);
    await this.audit(request, "Dashboard Event Deleted", "Events", event, null);
    return json({ ok: true });
  }

  private async reviewApplication(request: DashboardRequest) {
    if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    const id = Number(request.path.split("/")[2]);
    const status = this.stringField(request.body, "status") as "accepted" | "rejected";
    if (status !== "accepted" && status !== "rejected") return json({ error: "Invalid status" }, 400);
    const guild = await this.dashboardGuild();
    const row = sqlite.prepare("SELECT * FROM event_applications WHERE id = ?").get(id) as { event_id: number; discord_id: string } | undefined;
    if (!row) return json({ error: "Application not found" }, 404);
    sqlite.prepare("UPDATE event_applications SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?").run(status, request.actor!.discordUserId, Date.now(), id);
    const event = eventService.getEventById(row.event_id);
    if (status === "accepted" && event) await eventService.acceptApplicant(guild, this.client, event, row.discord_id);
    await this.audit(request, `Dashboard Application ${status === "accepted" ? "Accepted" : "Rejected"}`, "Events", null, { applicationId: id });
    return json({ ok: true });
  }

  private async automod() {
    const guild = await this.dashboardGuild();
    return json({
      config: sqlite.prepare("SELECT * FROM automod_configs WHERE guild_id = ?").get(guild.id) ?? null,
      bannedWords: sqlite.prepare("SELECT word, match_type FROM automod_banned_words WHERE guild_id = ?").all(guild.id),
      allowedDomains: sqlite.prepare("SELECT domain FROM automod_allowed_domains WHERE guild_id = ?").all(guild.id),
      exemptRoles: sqlite.prepare("SELECT role_id FROM automod_exempt_roles WHERE guild_id = ?").all(guild.id),
      exemptChannels: sqlite.prepare("SELECT channel_id FROM automod_exempt_channels WHERE guild_id = ?").all(guild.id),
      channels: await guildChannels(guild),
      roles: await guildRoles(guild),
    });
  }

  private async updateAutoMod(request: DashboardRequest) {
    if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    const guild = await this.dashboardGuild();
    const body = request.body as Record<string, unknown>;
    const now = Date.now();
    sqlite.prepare(`
      INSERT INTO automod_configs (guild_id, enabled, spam_enabled, duplicate_enabled, mention_limit, emoji_limit, invite_links_enabled, external_links_enabled, timeout_minutes, log_channel_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled = excluded.enabled, spam_enabled = excluded.spam_enabled, duplicate_enabled = excluded.duplicate_enabled,
        mention_limit = excluded.mention_limit, emoji_limit = excluded.emoji_limit,
        invite_links_enabled = excluded.invite_links_enabled, external_links_enabled = excluded.external_links_enabled,
        timeout_minutes = excluded.timeout_minutes, log_channel_id = excluded.log_channel_id, updated_at = excluded.updated_at
    `).run(guild.id, this.boolNum(body.enabled), this.boolNum(body.spamEnabled), this.boolNum(body.duplicateEnabled), Number(body.mentionLimit ?? 5), Number(body.emojiLimit ?? 12), this.boolNum(body.inviteLinksEnabled), this.boolNum(body.externalLinksEnabled), Number(body.timeoutMinutes ?? 10), this.nullableString(body, "logChannelId"), now, now);
    autoModService.invalidateGuild(guild.id);
    await this.audit(request, "Dashboard AutoMod Updated", "AutoMod", null, { guildId: guild.id });
    return json({ ok: true });
  }

  private async mutateAutoModList(request: DashboardRequest) {
    if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    const guild = await this.dashboardGuild();
    const action = request.path.split("/")[2];
    const body = request.body as Record<string, unknown>;

    if (action === "word-add") {
      const word = this.stringField(body, "word").toLowerCase();
      const matchType = this.stringField(body, "matchType") === "exact" ? "exact" : "contains";
      sqlite.prepare(`
        INSERT INTO automod_banned_words (guild_id, word, match_type)
        VALUES (?, ?, ?)
        ON CONFLICT(guild_id, word) DO UPDATE SET match_type = excluded.match_type
      `).run(guild.id, word, matchType);
      await this.audit(request, "Dashboard AutoMod Word Added", "AutoMod", null, { word, matchType });
    }

    if (action === "word-remove") {
      const word = this.stringField(body, "word").toLowerCase();
      sqlite.prepare("DELETE FROM automod_banned_words WHERE guild_id = ? AND word = ?").run(guild.id, word);
      await this.audit(request, "Dashboard AutoMod Word Removed", "AutoMod", { word }, null);
    }

    if (action === "domain-add") {
      const domain = this.stringField(body, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
      sqlite.prepare("INSERT OR IGNORE INTO automod_allowed_domains (guild_id, domain) VALUES (?, ?)").run(guild.id, domain);
      await this.audit(request, "Dashboard AutoMod Domain Added", "AutoMod", null, { domain });
    }

    if (action === "domain-remove") {
      const domain = this.stringField(body, "domain");
      sqlite.prepare("DELETE FROM automod_allowed_domains WHERE guild_id = ? AND domain = ?").run(guild.id, domain);
      await this.audit(request, "Dashboard AutoMod Domain Removed", "AutoMod", { domain }, null);
    }

    if (action === "exempt-role-add") sqlite.prepare("INSERT OR IGNORE INTO automod_exempt_roles (guild_id, role_id) VALUES (?, ?)").run(guild.id, this.stringField(body, "roleId"));
    if (action === "exempt-role-remove") sqlite.prepare("DELETE FROM automod_exempt_roles WHERE guild_id = ? AND role_id = ?").run(guild.id, this.stringField(body, "roleId"));
    if (action === "exempt-channel-add") sqlite.prepare("INSERT OR IGNORE INTO automod_exempt_channels (guild_id, channel_id) VALUES (?, ?)").run(guild.id, this.stringField(body, "channelId"));
    if (action === "exempt-channel-remove") sqlite.prepare("DELETE FROM automod_exempt_channels WHERE guild_id = ? AND channel_id = ?").run(guild.id, this.stringField(body, "channelId"));

    autoModService.invalidateGuild(guild.id);
    return json({ ok: true });
  }

  private async logging() {
    const guild = await this.dashboardGuild();
    const channels = {
      auditLogsChannelId: config.auditLogsChannelId,
      ticketLogsChannelId: config.ticketLogsChannelId,
      eventLogsChannelId: config.eventLogsChannelId,
      verificationLogsChannelId: config.verificationLogsChannelId,
      automodLogChannelId: (sqlite.prepare("SELECT log_channel_id FROM automod_configs WHERE guild_id = ?").get(guild.id) as { log_channel_id: string | null } | undefined)?.log_channel_id ?? null,
    };
    return json({ channels, permissions: await Promise.all(Object.entries(channels).map(async ([key, id]) => ({ key, ...(await channelPermissionStatus(guild, id)) }))), allChannels: await guildChannels(guild) });
  }

  private async updateLogging(request: DashboardRequest) {
    if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    const guild = await this.dashboardGuild();
    const automodLogChannelId = this.nullableString(request.body, "automodLogChannelId");
    sqlite.prepare("UPDATE automod_configs SET log_channel_id = ?, updated_at = ? WHERE guild_id = ?").run(automodLogChannelId, Date.now(), guild.id);
    await this.audit(request, "Dashboard Logging Updated", "Logging", null, { automodLogChannelId, note: "Env-backed channels require environment updates." });
    return json({ ok: true });
  }

  private async verification(request: DashboardRequest) {
    if (request.method !== "GET") {
      if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
      await this.audit(request, "Dashboard Verification Viewed", "Verification", null, null);
    }

    const guild = await this.dashboardGuild();
    return json({
      configured: Boolean(config.javaVerifiedRoleId || config.bedrockVerifiedRoleId || config.verificationLogsChannelId),
      javaRole: await this.roleLabel(guild, config.javaVerifiedRoleId),
      bedrockRole: await this.roleLabel(guild, config.bedrockVerifiedRoleId),
      verificationLogChannel: await this.channelLabel(guild, config.verificationLogsChannelId),
      nicknamePreference: ["Java username", "Bedrock username", "Existing Discord nickname"],
      roles: await guildRoles(guild),
      channels: await guildChannels(guild),
    });
  }

  private async settings(request: DashboardRequest) {
    const guild = await this.dashboardGuild();
    if (request.method !== "GET" && !requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    return json({
      guild: this.guildSummary(guild),
      configured: {
        staffRole: await this.roleLabel(guild, config.staffRoleId),
        developerRole: await this.roleLabel(guild, config.dashboardDeveloperRoleId),
        ticketCategory: await this.channelLabel(guild, config.ticketCategoryId),
        auditLogsChannel: await this.channelLabel(guild, config.auditLogsChannelId),
        server: `${config.mcHost}:${config.mcPort}`,
      },
      note: "Environment-backed settings are displayed here. Secrets are never exposed.",
    });
  }

  private async lookupMember(request: DashboardRequest) {
    const guild = await this.dashboardGuild();
    const query = request.query.get("q")?.trim();
    if (!query) return json({ member: null, roles: await guildRoles(guild), channels: await guildChannels(guild) });
    const id = query.match(/\d{17,20}/)?.[0];
    const members = id
      ? [await guild.members.fetch(id).catch(() => null)]
      : [...(await guild.members.search({ query, limit: 1 })).values()];
    const member = members.find(Boolean);
    if (!member) return json({ member: null, roles: await guildRoles(guild), channels: await guildChannels(guild) });
    const verified = sqlite.prepare("SELECT java_username, bedrock_username FROM verified_players WHERE guild_id = ? AND discord_id = ?").get(guild.id, member.id) as { java_username: string | null; bedrock_username: string | null } | undefined;
    const warningCount = (sqlite.prepare("SELECT COUNT(*) AS total FROM moderation_warnings WHERE guild_id = ? AND user_id = ?").get(guild.id, member.id) as { total: number }).total;
    const openTicketCount = [...guild.channels.cache.values()].filter(channel => channel.type === ChannelType.GuildText && channel.topic?.includes(`Creator ID: ${member.id}`)).length;
    const applicationCount = (sqlite.prepare("SELECT COUNT(*) AS total FROM event_applications WHERE guild_id = ? AND discord_id = ?").get(guild.id, member.id) as { total: number }).total;
    return json({
      member: {
        id: member.id,
        username: member.user.username,
        avatar: member.displayAvatarURL(),
        displayName: member.displayName,
        joinedAt: member.joinedTimestamp,
        createdAt: member.user.createdTimestamp,
        roles: member.roles.cache.filter(role => role.id !== guild.id).map(role => ({ id: role.id, name: role.name })),
        timeoutUntil: member.communicationDisabledUntilTimestamp,
        javaUsername: verified?.java_username ?? null,
        bedrockUsername: verified?.bedrock_username ?? null,
        warningCount,
        openTicketCount,
        applicationCount,
      },
      roles: await guildRoles(guild),
      channels: await guildChannels(guild),
    });
  }

  private async roleTool(request: DashboardRequest) {
    const guild = await this.dashboardGuild();
    const actor = await this.actorMember(request, guild);
    if (!actor) return json({ error: "Forbidden" }, 403);
    const member = await guild.members.fetch(this.stringField(request.body, "memberId"));
    const role = await guild.roles.fetch(this.stringField(request.body, "roleId"));
    const action = this.stringField(request.body, "action");
    if (!role || !this.canManageRole(actor, role)) return json({ error: "Role cannot be managed" }, 403);
    const before = member.roles.cache.map(existing => existing.id);
    if (action === "add") await member.roles.add(role, `Dashboard role add by ${actor.user.tag}`);
    if (action === "remove") await member.roles.remove(role, `Dashboard role remove by ${actor.user.tag}`);
    await this.audit(request, "Dashboard Role Updated", "Tools", { memberId: member.id, roles: before }, { memberId: member.id, action, roleId: role.id });
    return json({ ok: true });
  }

  private async nicknameTool(request: DashboardRequest) {
    const guild = await this.dashboardGuild();
    const actor = await this.actorMember(request, guild);
    if (!actor) return json({ error: "Forbidden" }, 403);
    const member = await guild.members.fetch(this.stringField(request.body, "memberId"));
    if (!this.canManageMember(actor, member)) return json({ error: "Member cannot be managed" }, 403);
    const before = member.nickname;
    const nickname = this.nullableString(request.body, "nickname");
    await member.setNickname(nickname, `Dashboard nickname by ${actor.user.tag}`);
    await this.audit(request, "Dashboard Nickname Updated", "Tools", { memberId: member.id, nickname: before }, { memberId: member.id, nickname });
    return json({ ok: true });
  }

  private async memberWarnings(request: DashboardRequest) {
    const guild = await this.dashboardGuild();
    const userId = request.query.get("memberId") ?? "";
    const rows = sqlite.prepare("SELECT id, moderator_id, reason, created_at FROM moderation_warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC").all(guild.id, userId);
    return json({ warnings: rows });
  }

  private async warningTool(request: DashboardRequest) {
    const guild = await this.dashboardGuild();
    if (!request.actor) return json({ error: "Forbidden" }, 403);
    const action = this.stringField(request.body, "action");
    const memberId = this.stringField(request.body, "memberId", false);
    const before = memberId ? sqlite.prepare("SELECT COUNT(*) AS total FROM moderation_warnings WHERE guild_id = ? AND user_id = ?").get(guild.id, memberId) : null;
    if (action === "warn") {
      sqlite.prepare("INSERT INTO moderation_warnings (guild_id, user_id, moderator_id, reason, source, created_at) VALUES (?, ?, ?, ?, 'manual', ?)").run(guild.id, memberId, request.actor.discordUserId, this.stringField(request.body, "reason"), Date.now());
    }
    if (action === "clear-one") sqlite.prepare("DELETE FROM moderation_warnings WHERE guild_id = ? AND id = ?").run(guild.id, Number(this.stringField(request.body, "warningId")));
    if (action === "clear-all") sqlite.prepare("DELETE FROM moderation_warnings WHERE guild_id = ? AND user_id = ?").run(guild.id, memberId);
    await this.audit(request, "Dashboard Warnings Updated", "Tools", before, { action, memberId });
    return json({ ok: true });
  }

  private async timeoutTool(request: DashboardRequest) {
    const guild = await this.dashboardGuild();
    const actor = await this.actorMember(request, guild);
    if (!actor) return json({ error: "Forbidden" }, 403);
    const member = await guild.members.fetch(this.stringField(request.body, "memberId"));
    if (!this.canManageMember(actor, member)) return json({ error: "Member cannot be managed" }, 403);
    const action = this.stringField(request.body, "action");
    const before = member.communicationDisabledUntilTimestamp;
    const duration = Number(this.stringField(request.body, "durationMinutes", false) || 0);
    const reason = this.stringField(request.body, "reason", false) || "Dashboard timeout update";
    await member.timeout(action === "remove" ? null : duration * 60_000, reason);
    await this.audit(request, "Dashboard Timeout Updated", "Tools", { memberId: member.id, timeoutUntil: before }, { memberId: member.id, action, duration });
    return json({ ok: true });
  }

  private async channelTool(request: DashboardRequest) {
    const guild = await this.dashboardGuild();
    if (!request.actor) return json({ error: "Forbidden" }, 403);
    const channel = await guild.channels.fetch(this.stringField(request.body, "channelId"));
    if (!channel || channel.type !== ChannelType.GuildText) return json({ error: "Invalid channel" }, 400);
    const action = this.stringField(request.body, "action");
    const before = channel.permissionOverwrites.cache.get(guild.id)?.deny.bitfield.toString() ?? "inherited";
    if (action === "lock") await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    if (action === "unlock") await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
    if (action === "hide") await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
    if (action === "show") await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null });
    if (action === "slowmode") await channel.setRateLimitPerUser(Number(this.stringField(request.body, "seconds", false) || 0));
    await this.audit(request, "Dashboard Channel Updated", "Tools", { channelId: channel.id, overwrite: before }, { channelId: channel.id, action });
    return json({ ok: true });
  }

  private async announcementTool(request: DashboardRequest) {
    if (!requireEdit(request.actor)) return json({ error: "Forbidden" }, 403);
    const guild = await this.dashboardGuild();
    const channel = await guild.channels.fetch(this.stringField(request.body, "channelId"));
    if (!channel?.isTextBased() || !("send" in channel)) return json({ error: "Invalid channel" }, 400);
    const roleId = this.nullableString(request.body, "roleId");
    await channel.send({
      content: roleId ? `<@&${roleId}>` : undefined,
      allowedMentions: { roles: roleId ? [roleId] : [], users: [], parse: [] },
      embeds: [giizeEmbed().setTitle(this.stringField(request.body, "title")).setDescription(this.stringField(request.body, "description")).setImage(this.nullableString(request.body, "imageUrl"))],
    });
    await this.audit(request, "Dashboard Announcement Sent", "Tools", null, { channelId: channel.id, roleId });
    return json({ ok: true });
  }

  private async actorMember(request: DashboardRequest, guild: Guild) {
    if (!request.actor) return null;
    return guild.members.fetch(request.actor.discordUserId).catch(() => null);
  }

  private canManageMember(actor: GuildMember, target: GuildMember) {
    if (target.id === actor.guild.ownerId || target.id === actor.client.user.id) return false;
    if (actor.id !== actor.guild.ownerId && target.roles.highest.position >= actor.roles.highest.position) return false;
    const botMember = actor.guild.members.me;
    if (botMember && target.roles.highest.position >= botMember.roles.highest.position) return false;
    return true;
  }

  private canManageRole(actor: GuildMember, role: Role) {
    if (role.id === actor.guild.id || role.managed) return false;
    if (actor.id !== actor.guild.ownerId && role.position >= actor.roles.highest.position) return false;
    const botMember = actor.guild.members.me;
    if (botMember && role.position >= botMember.roles.highest.position) return false;
    return true;
  }

  private async dashboardGuild() {
    const guild = await this.client.guilds.fetch(config.dashboardGuildId);
    return guild.fetch();
  }

  private guildSummary(guild: Guild) {
    return { id: guild.id, name: guild.name, icon: guild.iconURL(), memberCount: guild.memberCount };
  }

  private authorized(request: IncomingMessage) {
    const secret = request.headers["x-dashboard-secret"]?.toString() ?? "";
    return Boolean(config.dashboardInternalSecret && secret && safeEqual(secret, config.dashboardInternalSecret));
  }

  private rateLimit(request: IncomingMessage) {
    const key = request.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const current = this.rateLimits.get(key);
    if (!current || current.resetsAt < now) {
      this.rateLimits.set(key, { count: 1, resetsAt: now + 60_000 });
      return true;
    }
    current.count += 1;
    return current.count <= 240;
  }

  private readBody(request: IncomingMessage) {
    return new Promise<unknown>((resolve, reject) => {
      let body = "";
      request.on("data", chunk => {
        body += chunk;
        if (body.length > 1_000_000) request.destroy();
      });
      request.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : null);
        } catch (error) {
          reject(error);
        }
      });
      request.on("error", reject);
    });
  }

  private write(response: ServerResponse, result: ApiResult) {
    response.writeHead(result.status, result.headers);
    response.end(result.body);
  }

  private defaultWelcome(guildId: string) {
    return { guild_id: guildId, enabled: 1, channel_id: config.welcomeChannelId, title: welcomeTitle, description: welcomeDescription, role_id: config.welcomeRoleId || null, image_url: config.welcomeBannerUrl, thumbnail_url: null, color: null };
  }

  private latestTicket(channels: { topic: string | null; id: string }[]) {
    return channels.map(channel => ({ channelId: channel.id, ...this.ticketFromTopic(channel.topic) })).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))[0] ?? null;
  }

  private ticketFromTopic(topic: string | null) {
    const openedAtValue = topic?.match(/Opening Timestamp:\s*([^|]+)/)?.[1]?.trim();
    return {
      ticketNumber: topic?.match(/Ticket\s+(#[0-9]+)/)?.[1] ?? null,
      creatorId: topic?.match(/Creator ID:\s*(\d+)/)?.[1] ?? null,
      type: topic?.match(/Ticket Type:\s*([^|]+)/)?.[1]?.trim() ?? null,
      priority: topic?.match(/Priority:\s*(Diamond|Iron|Dirt|Normal)/)?.[1] ?? "Normal",
      openedAt: this.parseStoredTimestamp(openedAtValue),
    };
  }

  private parseStoredTimestamp(value: string | undefined) {
    if (!value) return null;
    if (/^\d+$/.test(value)) {
      const numeric = Number(value);
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private async channelLabel(guild: Guild, channelId: string | null) {
    if (!channelId) return { id: "", name: "Not configured" };
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    return { id: channelId, name: channel && "name" in channel ? channel.name : "Missing channel" };
  }

  private async roleLabel(guild: Guild, roleId: string | null) {
    if (!roleId) return { id: "", name: "Not configured" };
    const role = await guild.roles.fetch(roleId).catch(() => null);
    return { id: roleId, name: role?.name ?? "Missing role" };
  }

  private toEvent(row: EventRow): EventRecord {
    return { id: row.id, eventNumber: row.event_number, guildId: row.guild_id, messageId: row.message_id, channelId: row.channel_id, hostId: row.host_id, title: row.title, description: row.description, location: row.location, startTimestamp: row.start_timestamp, endTimestamp: row.end_timestamp, maxPlayers: row.max_players, pingRole: row.ping_role, goingRole: row.going_role, status: row.status, createdAt: row.created_at };
  }

  private eventByNumber(guildId: string, eventNumber: number) {
    const row = sqlite.prepare("SELECT * FROM events WHERE guild_id = ? AND event_number = ?").get(guildId, eventNumber) as EventRow | undefined;
    return row ? this.toEvent(row) : null;
  }

  private async refreshEventMessage(eventId: number) {
    const row = sqlite.prepare("SELECT * FROM events WHERE id = ?").get(eventId) as EventRow | undefined;
    if (!row) return;
    const event = this.toEvent(row);
    const channel = await this.client.channels.fetch(event.channelId).catch(() => null);
    if (!channel?.isTextBased() || !("messages" in channel)) return;
    const message = await channel.messages.fetch(event.messageId).catch(() => null);
    const counts = {
      going: (sqlite.prepare("SELECT COUNT(*) AS total FROM event_participants WHERE event_id = ? AND status = 'going'").get(event.id) as { total: number }).total,
      cant: (sqlite.prepare("SELECT COUNT(*) AS total FROM event_participants WHERE event_id = ? AND status = 'cant'").get(event.id) as { total: number }).total,
    };
    await message?.edit({ embeds: [eventRenderer.renderEventEmbed(event, counts)], components: eventRenderer.renderEventComponents(event) });
  }

  private nextEventNumber(guildId: string) {
    const row = sqlite.prepare("SELECT COALESCE(MAX(event_number), 0) + 1 AS next FROM events WHERE guild_id = ?").get(guildId) as { next: number };
    return row.next;
  }

  private parseDiscordTimestamp(value: string) {
    const match = value.match(/<t:(\d+)(?::[tTdDfFR])?>/);
    return match ? Number(match[1]) * 1000 : null;
  }

  private parseDuration(value: string) {
    const matches = value.toLowerCase().matchAll(/(\d+)\s*([dhm])/g);
    let total = 0;
    for (const match of matches) {
      const amount = Number(match[1]);
      if (match[2] === "d") total += amount * 1440;
      if (match[2] === "h") total += amount * 60;
      if (match[2] === "m") total += amount;
    }
    return total > 0 ? total : null;
  }

  private async audit(request: DashboardRequest, action: string, section: string, before: unknown, after: unknown) {
    const guild = await this.dashboardGuild();
    await auditLogService.send(guild, "Dashboard Change", [
      { name: "Discord User", value: `<@${request.actor?.discordUserId}> (${request.actor?.discordUserId})`, inline: false },
      { name: "Action", value: action, inline: true },
      { name: "Section", value: section, inline: true },
      { name: "Before", value: this.redact(before).slice(0, 1024), inline: false },
      { name: "After", value: this.redact(after).slice(0, 1024), inline: false },
      { name: "Timestamp", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
    ]);
  }

  private redact(value: unknown) {
    return JSON.stringify(value, (key, item) => /secret|token|password/i.test(key) ? "[redacted]" : item) ?? "None";
  }

  private stringField(body: unknown, key: string, required = true) {
    const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (!required) return "";
    throw new Error(`Missing ${key}`);
  }

  private nullableString(body: unknown, key: string) {
    const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private optionalBool(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
  }

  private boolNum(value: unknown) {
    return value === true ? 1 : 0;
  }
}
