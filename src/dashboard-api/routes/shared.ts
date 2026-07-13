import { ChannelType, PermissionFlagsBits, type Guild, type GuildMember } from "discord.js";
import { config } from "../../config/config.js";
import { sqlite } from "../../database/database.js";
import type { DashboardAccessLevel, DashboardTokenPayload } from "../DashboardAuth.js";

export type ApiContext = {
  guild: Guild;
  actor: DashboardTokenPayload | null;
};

export function json(data: unknown, status = 200) {
  return {
    status,
    body: JSON.stringify(data),
    headers: { "content-type": "application/json" },
  };
}

export function requireEdit(actor: DashboardTokenPayload | null) {
  return actor?.accessLevel === "administrator" || actor?.accessLevel === "developer";
}

export function accessLevelFor(member: GuildMember): DashboardAccessLevel | null {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return "administrator";
  if (member.roles.cache.has(config.dashboardDeveloperRoleId)) return "developer";
  if (member.roles.cache.has(config.staffRoleId)) return "staff";
  return null;
}

export async function guildChannels(guild: Guild) {
  const channels = await guild.channels.fetch();
  return [...channels.values()]
    .filter(channel => channel?.type === ChannelType.GuildText)
    .map(channel => ({ id: channel.id, name: channel.name }));
}

export async function guildRoles(guild: Guild) {
  const roles = await guild.roles.fetch();
  return [...roles.values()]
    .filter(role => role && role.id !== guild.id)
    .map(role => ({ id: role!.id, name: role!.name }));
}

export async function channelPermissionStatus(guild: Guild, channelId: string | null) {
  if (!channelId) return { channelId, exists: false, missing: ["Channel not configured"] };
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return { channelId, exists: false, missing: ["Channel missing or not text based"] };
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  const checks = [
    ["View Channel", PermissionFlagsBits.ViewChannel],
    ["Send Messages", PermissionFlagsBits.SendMessages],
    ["Embed Links", PermissionFlagsBits.EmbedLinks],
    ["Attach Files", PermissionFlagsBits.AttachFiles],
  ] as const;
  const missing = checks.filter(([, permission]) => !permissions?.has(permission)).map(([name]) => name);
  const name = (channel as { name?: string }).name ?? channelId;
  return {
    channelId,
    exists: true,
    name,
    permissions: Object.fromEntries(checks.map(([name, permission]) => [name, Boolean(permissions?.has(permission))])),
    missing,
  };
}

export function countsByStatus(eventId: number) {
  const rows = sqlite.prepare("SELECT status, COUNT(*) AS total FROM event_applications WHERE event_id = ? GROUP BY status")
    .all(eventId) as { status: string; total: number }[];
  return {
    accepted: rows.find(row => row.status === "accepted")?.total ?? 0,
    pending: rows.find(row => row.status === "pending")?.total ?? 0,
    rejected: rows.find(row => row.status === "rejected")?.total ?? 0,
  };
}
