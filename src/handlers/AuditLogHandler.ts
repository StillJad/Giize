import {
  AuditLogEvent,
  Events,
  type Guild,
  type GuildAuditLogsEntry,
  type GuildBasedChannel,
  type InviteGuild,
  type GuildMember,
  type GuildTextBasedChannel,
  type Invite,
  type Message,
  type PartialGuildMember,
  type PartialMessage,
  type Role,
  type ThreadChannel,
  type VoiceState,
} from "discord.js";
import { client } from "../client.js";
import { auditLogService } from "../services/audit/AuditLogService.js";
import { logger } from "../utils/logger.js";

type AuditAction = AuditLogEvent;

function isGuild(value: Guild | InviteGuild | null): value is Guild {
  return Boolean(value && "channels" in value && "members" in value);
}

async function moderator(guild: Guild, action: AuditAction, targetId?: string) {
  try {
    const logs = await guild.fetchAuditLogs({ type: action, limit: 5 });
    const entry = logs.entries.find((log: GuildAuditLogsEntry) => {
      const isRecent = Date.now() - log.createdTimestamp < 15_000;
      const matchesTarget = !targetId || log.targetId === targetId;
      return isRecent && matchesTarget;
    });
    return entry?.executorId ?? null;
  } catch (error) {
    logger.warn("Audit log lookup failed.", error);
    return null;
  }
}

function channelName(channel: GuildBasedChannel | GuildTextBasedChannel | ThreadChannel | null | undefined) {
  if (!channel) return "Unknown";
  return "name" in channel ? `#${channel.name}` : `${channel}`;
}

function memberName(member: GuildMember | PartialGuildMember) {
  return `${member.user} (${member.id})`;
}

client.on(Events.MessageDelete, async (message: Message | PartialMessage) => {
  if (!message.guild || message.author?.bot) return;

  const modId = await moderator(message.guild, AuditLogEvent.MessageDelete, message.author?.id);
  await auditLogService.send(message.guild, "Message Deleted", [
    { name: "Author", value: message.author ? `${message.author} (${message.author.id})` : "Unknown", inline: true },
    { name: "Channel", value: channelName(message.channel as GuildTextBasedChannel), inline: true },
    { name: "Deleted By", value: auditLogService.formatModerator(modId), inline: true },
    { name: "Content", value: auditLogService.formatContent(message.content), inline: false },
    { name: "Attachments", value: auditLogService.formatAttachments(message.attachments.values()), inline: false },
    { name: "Deleted At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
  ]);
});

client.on(Events.MessageUpdate, async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
  if (!newMessage.guild || newMessage.author?.bot || oldMessage.content === newMessage.content) return;

  await auditLogService.send(newMessage.guild, "Message Edited", [
    { name: "Author", value: newMessage.author ? `${newMessage.author} (${newMessage.author.id})` : "Unknown", inline: true },
    { name: "Channel", value: channelName(newMessage.channel as GuildTextBasedChannel), inline: true },
    { name: "Before", value: auditLogService.formatContent(oldMessage.content), inline: false },
    { name: "After", value: auditLogService.formatContent(newMessage.content), inline: false },
  ]);
});

client.on(Events.GuildMemberAdd, async member => {
  await auditLogService.send(member.guild, "Member Joined", [
    { name: "Member", value: memberName(member), inline: true },
    { name: "Joined At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
  ]);
});

client.on(Events.GuildMemberRemove, async member => {
  const modId = member.guild ? await moderator(member.guild, AuditLogEvent.MemberKick, member.id) : null;
  await auditLogService.send(member.guild, modId ? "Member Kicked" : "Member Left", [
    { name: "Member", value: memberName(member), inline: true },
    { name: "Moderator", value: auditLogService.formatModerator(modId), inline: true },
  ]);
});

client.on(Events.GuildBanAdd, async ban => {
  const modId = await moderator(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
  await auditLogService.send(ban.guild, "Member Banned", [
    { name: "Member", value: `${ban.user} (${ban.user.id})`, inline: true },
    { name: "Moderator", value: auditLogService.formatModerator(modId), inline: true },
  ]);
});

client.on(Events.GuildBanRemove, async ban => {
  const modId = await moderator(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
  await auditLogService.send(ban.guild, "Member Unbanned", [
    { name: "Member", value: `${ban.user} (${ban.user.id})`, inline: true },
    { name: "Moderator", value: auditLogService.formatModerator(modId), inline: true },
  ]);
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (oldMember.nickname !== newMember.nickname) {
    const modId = await moderator(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
    await auditLogService.send(newMember.guild, "Nickname Changed", [
      { name: "Member", value: memberName(newMember), inline: true },
      { name: "Moderator", value: auditLogService.formatModerator(modId), inline: true },
      { name: "Before", value: oldMember.nickname ?? oldMember.user.username, inline: true },
      { name: "After", value: newMember.nickname ?? newMember.user.username, inline: true },
    ]);
  }

  if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
    const modId = await moderator(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
    await auditLogService.send(newMember.guild, "Timeout Updated", [
      { name: "Member", value: memberName(newMember), inline: true },
      { name: "Moderator", value: auditLogService.formatModerator(modId), inline: true },
      { name: "Before", value: oldMember.communicationDisabledUntilTimestamp ? `<t:${Math.floor(oldMember.communicationDisabledUntilTimestamp / 1000)}:F>` : "None", inline: true },
      { name: "After", value: newMember.communicationDisabledUntilTimestamp ? `<t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>` : "None", inline: true },
    ]);
  }

  const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
  const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

  if (addedRoles.size || removedRoles.size) {
    const modId = await moderator(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
    await auditLogService.send(newMember.guild, "Member Roles Updated", [
      { name: "Member", value: memberName(newMember), inline: true },
      { name: "Moderator", value: auditLogService.formatModerator(modId), inline: true },
      { name: "Added", value: addedRoles.map(role => `${role}`).join(" ") || "None", inline: false },
      { name: "Removed", value: removedRoles.map(role => `${role}`).join(" ") || "None", inline: false },
    ]);
  }
});

client.on(Events.GuildRoleCreate, role => void logRole("Role Created", role, AuditLogEvent.RoleCreate));
client.on(Events.GuildRoleDelete, role => void logRole("Role Deleted", role, AuditLogEvent.RoleDelete));
client.on(Events.GuildRoleUpdate, (oldRole, newRole) => void logRole("Role Edited", newRole, AuditLogEvent.RoleUpdate, oldRole.name));

async function logRole(title: string, role: Role, action: AuditAction, beforeName?: string) {
  const modId = await moderator(role.guild, action, role.id);
  await auditLogService.send(role.guild, title, [
    { name: "Role", value: `${role} (${role.id})`, inline: true },
    { name: "Moderator", value: auditLogService.formatModerator(modId), inline: true },
    { name: "Before", value: beforeName ?? "None", inline: true },
    { name: "After", value: role.name, inline: true },
  ]);
}

client.on(Events.ChannelCreate, channel => {
  if (!("guild" in channel)) return;
  void logChannel("Channel Created", channel, AuditLogEvent.ChannelCreate);
});
client.on(Events.ChannelDelete, channel => {
  if (!("guild" in channel)) return;
  void logChannel("Channel Deleted", channel, AuditLogEvent.ChannelDelete);
});
client.on(Events.ChannelUpdate, (_oldChannel, newChannel) => {
  if (!("guild" in newChannel)) return;
  void logChannel("Channel Edited", newChannel, AuditLogEvent.ChannelUpdate);
});

async function logChannel(title: string, channel: GuildBasedChannel, action: AuditAction) {
  const modId = await moderator(channel.guild, action, channel.id);
  await auditLogService.send(channel.guild, title, [
    { name: "Channel", value: `${channelName(channel)} (${channel.id})`, inline: true },
    { name: "Moderator", value: auditLogService.formatModerator(modId), inline: true },
    { name: "Type", value: String(channel.type), inline: true },
  ]);
}

client.on(Events.ThreadCreate, thread => void logThread("Thread Created", thread, AuditLogEvent.ThreadCreate));
client.on(Events.ThreadDelete, thread => void logThread("Thread Deleted", thread, AuditLogEvent.ThreadDelete));
client.on(Events.ThreadUpdate, (_oldThread, newThread) => void logThread("Thread Updated", newThread, AuditLogEvent.ThreadUpdate));

async function logThread(title: string, thread: ThreadChannel, action: AuditAction) {
  const modId = await moderator(thread.guild, action, thread.id);
  await auditLogService.send(thread.guild, title, [
    { name: "Thread", value: `${thread.name} (${thread.id})`, inline: true },
    { name: "Moderator", value: auditLogService.formatModerator(modId), inline: true },
    { name: "Parent", value: thread.parent ? channelName(thread.parent) : "None", inline: true },
  ]);
}

client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
  if (!oldState.channelId && newState.channelId) {
    await logVoice("Voice Joined", newState);
  } else if (oldState.channelId && !newState.channelId) {
    await logVoice("Voice Left", oldState);
  } else if (oldState.channelId !== newState.channelId) {
    await auditLogService.send(newState.guild, "Voice Moved", [
      { name: "Member", value: newState.member ? memberName(newState.member) : "Unknown", inline: true },
      { name: "From", value: oldState.channel ? channelName(oldState.channel) : "Unknown", inline: true },
      { name: "To", value: newState.channel ? channelName(newState.channel) : "Unknown", inline: true },
    ]);
  }
});

async function logVoice(title: string, state: VoiceState) {
  await auditLogService.send(state.guild, title, [
    { name: "Member", value: state.member ? memberName(state.member) : "Unknown", inline: true },
    { name: "Channel", value: state.channel ? channelName(state.channel) : "Unknown", inline: true },
  ]);
}

client.on(Events.InviteCreate, async (invite: Invite) => {
  if (!isGuild(invite.guild)) return;
  await auditLogService.send(invite.guild, "Invite Created", [
    { name: "Code", value: invite.code, inline: true },
    { name: "Channel", value: channelName(invite.channel as GuildBasedChannel | null), inline: true },
    { name: "Created By", value: invite.inviter ? `${invite.inviter}` : "Unknown", inline: true },
  ]);
});

client.on(Events.InviteDelete, async (invite: Invite) => {
  if (!isGuild(invite.guild)) return;
  await auditLogService.send(invite.guild, "Invite Deleted", [
    { name: "Code", value: invite.code, inline: true },
    { name: "Channel", value: channelName(invite.channel as GuildBasedChannel | null), inline: true },
  ]);
});

client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
  const modId = await moderator(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
  await auditLogService.send(newGuild, "Server Updated", [
    { name: "Moderator", value: auditLogService.formatModerator(modId), inline: true },
    { name: "Name Before", value: oldGuild.name, inline: true },
    { name: "Name After", value: newGuild.name, inline: true },
  ]);
});
