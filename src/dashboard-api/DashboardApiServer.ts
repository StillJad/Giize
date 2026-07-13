import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hostname, uptime } from "node:os";
import {
  ActionRowBuilder,
  ChannelType,
  StringSelectMenuBuilder,
  type Client,
  type Guild,
  type TextChannel,
} from "discord.js";
import { config } from "../config/config.js";
import { sqlite } from "../database/database.js";
import { giizeEmbed } from "../utils/embeds.js";
import { logger } from "../utils/logger.js";
import { auditLogService } from "../services/audit/AuditLogService.js";
import { eventRenderer, type EventRecord } from "../services/events/EventRenderer.js";
import { eventService } from "../services/events/EventService.js";
import { ticketService } from "../services/tickets/TicketService.js";
import { welcomeDescription, welcomeTitle } from "../services/welcome/WelcomeRenderer.js";
import { safeEqual, signDashboardToken, verifyDashboardToken, type DashboardTokenPayload } from "./DashboardAuth.js";
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
        this.write(response, json({ error: "Unauthorized" }, 401));
        return;
      }

      if (!this.rateLimit(request)) {
        this.write(response, json({ error: "Too many requests" }, 429));
        return;
      }

      const url = new URL(request.url ?? "/", "http://giize-bot");
      const actor = verifyDashboardToken(request.headers["x-dashboard-token"]?.toString() ?? "");
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
    if (request.path === "/logging") return request.method === "GET" ? this.logging() : this.updateLogging(request);

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
    const tickets = channels.map(channel => ({ channelId: channel.id, channel: `<#${channel.id}>`, topic: channel.topic ?? "", ...this.ticketFromTopic(channel.topic) }));
    return json({
      config: {
        ticketCategoryId: config.ticketCategoryId,
        ticketLogsChannelId: config.ticketLogsChannelId,
        staffRoleId: config.staffRoleId,
        eventApplicationCategoryId: config.eventApplicationCategoryId || config.ticketCategoryId,
        diamondSupporterRoleId: config.diamondSupporterRoleId,
        ironSupporterRoleId: config.ironSupporterRoleId,
        dirtSupporterRoleId: config.dirtSupporterRoleId,
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
    const startTimestamp = this.parseDiscordTimestamp(this.stringField(body, "start"));
    const durationMinutes = this.parseDuration(this.stringField(body, "duration"));
    const channel = await guild.channels.fetch(this.stringField(body, "channelId")).catch(() => null);
    if (!startTimestamp || !durationMinutes || !channel?.isTextBased() || !("send" in channel)) return json({ error: "Invalid event input" }, 400);
    const eventNumber = this.nextEventNumber(guild.id);
    const now = Date.now();
    const insert = sqlite.prepare(`
      INSERT INTO events (event_number, guild_id, message_id, channel_id, host_id, title, description, location, start_timestamp, end_timestamp, max_players, ping_role, going_role, status, created_at)
      VALUES (?, ?, '', ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, 'scheduled', ?)
    `).run(eventNumber, guild.id, channel.id, request.actor!.discordUserId, this.stringField(body, "title"), this.stringField(body, "description"), startTimestamp, startTimestamp + durationMinutes * 60_000, this.nullableString(body, "pingRole"), this.nullableString(body, "goingRole"), now);
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
    const event = this.eventByNumber(guild.id, Number(request.path.split("/")[2]));
    if (!event) return json({ error: "No event was found with that ID." }, 404);
    sqlite.prepare("DELETE FROM event_applications WHERE event_id = ?").run(event.id);
    sqlite.prepare("DELETE FROM event_participants WHERE event_id = ?").run(event.id);
    sqlite.prepare("DELETE FROM event_role_assignments WHERE event_id = ?").run(event.id);
    sqlite.prepare("DELETE FROM event_reminders WHERE event_id = ?").run(event.id);
    sqlite.prepare("DELETE FROM events WHERE id = ?").run(event.id);
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
      INSERT INTO automod_configs (guild_id, enabled, spam_enabled, duplicate_enabled, mention_limit, emoji_limit, caps_percentage, invite_links_enabled, external_links_enabled, timeout_minutes, log_channel_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled = excluded.enabled, spam_enabled = excluded.spam_enabled, duplicate_enabled = excluded.duplicate_enabled,
        mention_limit = excluded.mention_limit, emoji_limit = excluded.emoji_limit, caps_percentage = excluded.caps_percentage,
        invite_links_enabled = excluded.invite_links_enabled, external_links_enabled = excluded.external_links_enabled,
        timeout_minutes = excluded.timeout_minutes, log_channel_id = excluded.log_channel_id, updated_at = excluded.updated_at
    `).run(guild.id, this.boolNum(body.enabled), this.boolNum(body.spamEnabled), this.boolNum(body.duplicateEnabled), Number(body.mentionLimit ?? 5), Number(body.emojiLimit ?? 12), Number(body.capsPercentage ?? 80), this.boolNum(body.inviteLinksEnabled), this.boolNum(body.externalLinksEnabled), Number(body.timeoutMinutes ?? 10), this.nullableString(body, "logChannelId"), now, now);
    await this.audit(request, "Dashboard AutoMod Updated", "AutoMod", null, { guildId: guild.id });
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
    return {
      ticketNumber: topic?.match(/Ticket #(\d+)/)?.[1] ?? null,
      creatorId: topic?.match(/Creator ID:\s*(\d+)/)?.[1] ?? null,
      type: topic?.match(/Ticket Type:\s*([^|]+)/)?.[1]?.trim() ?? null,
      priority: topic?.match(/Priority:\s*(Diamond|Iron|Dirt|Normal)/)?.[1] ?? "Normal",
      openedAt: Number(topic?.match(/Opening Timestamp:\s*(\d+)/)?.[1] ?? 0),
    };
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
