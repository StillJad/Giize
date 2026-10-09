import { PermissionFlagsBits, type GuildMember, type ModalSubmitInteraction, type ButtonInteraction, type Guild } from 'discord.js';
import { config } from '../../config/config.js';
import { logger } from '../../utils/logger.js';
export function canClaimTicket(member: Pick<GuildMember, 'permissions' | 'roles'>, roles = [config.staffRoleId, config.ticketStaffRoleId]) { return member.permissions.has(PermissionFlagsBits.Administrator) || roles.some(id => id && member.roles.cache.has(id)); }
export class OpenTicketBridge {
    private opening = new Set<string>();
    private claiming = new Set<string>();
    constructor(private getEngine = () => (globalThis as any).__eventEngine) { }
    async open(i: ModalSubmitInteraction, type: string, reason: string) {
        await i.deferReply({ flags: 64 });
        if (!i.guild)
            return void await i.editReply('Use this in the server.');
        const engine = this.getEngine();
        if (!engine)
            return void await i.editReply('The ticket system is starting. Try again in a moment.');
        const option = engine.options.get(type === 'help' ? 'support' : type);
        if (!option)
            return void await i.editReply('This ticket type is unavailable.');
        const key = `${i.guildId}:${i.user.id}`;
        if (this.opening.has(key))
            return void await i.editReply('Your ticket is already opening.');
        this.opening.add(key);
        try {
            const permissions = await engine.actions.get('opendiscord:create-ticket-permissions').run('panel-button', { guild: i.guild, user: i.user, option });
            if (!permissions.valid) {
                const message = permissions.reason === 'cooldown' ? `Please wait until <t:${Math.ceil(permissions.cooldownUntil / 1000)}:R> before opening another ticket.` : permissions.reason === 'blacklist' ? 'You cannot open tickets in this server.' : 'You already have an active ticket or the ticket limit has been reached.';
                await i.editReply(message);
                return;
            }
            const answers = [{ id: 'issue', name: 'How can we help?', type: 'paragraph', value: reason }];
            const result = await engine.actions.get('opendiscord:create-ticket').run('panel-button', { guild: i.guild, user: i.user, option, answers });
            if (!result?.channel || !result?.ticket)
                throw new Error('Open Ticket did not create a ticket.');
            await i.editReply({ content: `Your ticket is ready: <#${result.channel.id}>`, allowedMentions: { parse: [] } });
        }
        finally {
            this.opening.delete(key);
        }
    }
    async claim(i: ButtonInteraction) {
        await i.deferReply({ flags: 64 });
        if (!i.guild || !i.channel)
            return void await i.editReply('Use this inside a ticket.');
        const member = await i.guild.members.fetch(i.user.id);
        if (!canClaimTicket(member))
            return void await i.editReply('Only Staff and Ticket Staff can claim tickets.');
        const engine = this.getEngine();
        const ticket = engine?.tickets.get(i.channelId);
        if (!ticket)
            return void await i.editReply('This ticket is no longer active.');
        if (ticket.get('opendiscord:closed').value || ticket.get('opendiscord:busy').value)
            return void await i.editReply('This ticket is closed or another action is running.');
        if (this.claiming.has(i.channelId))
            return void await i.editReply('Another claim action is running.');
        this.claiming.add(i.channelId);
        try {
            const release = i.customId === 'event_ticket_unclaim';
            const assigned = ticket.get('opendiscord:claimed-by').value;
            if (!release && ticket.get('opendiscord:claimed').value)
                return void await i.editReply({ content: `Already claimed by <@${assigned}>.`, allowedMentions: { parse: [] } });
            if (release && !assigned)
                return void await i.editReply('This ticket is already unclaimed.');
            if (release && assigned !== i.user.id && !member.permissions.has(PermissionFlagsBits.Administrator))
                return void await i.editReply('Only the assigned staff member or an administrator can release this ticket.');
            await engine.actions.get(release ? 'opendiscord:unclaim-ticket' : 'opendiscord:claim-ticket').run('button', { guild: i.guild, channel: i.channel, user: i.user, ticket, reason: null, sendMessage: true, allowCategoryChange: false });
            await i.editReply(release ? 'Ticket released. Another staff member can claim it.' : 'Ticket claimed. You are now assigned to help here.');
        }
        finally {
            this.claiming.delete(i.channelId);
        }
    }
    async prepareAccess(guild: Guild) {
        const engine = this.getEngine();
        if (!engine)
            return;
        const ids = [...new Set([config.staffRoleId, config.ticketStaffRoleId].filter(Boolean))];
        const channels = await guild.channels.fetch();
        for (const channel of channels.values()) {
            if (!channel || !('topic' in channel) || !('permissionOverwrites' in channel))
                continue;
            const native = engine.tickets.get(channel.id);
            const legacy = Boolean(channel.topic?.includes('Creator ID:') && channel.topic?.includes('Ticket #'));
            if (!native && !legacy)
                continue;
            try {
                for (const id of ids)
                    await channel.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }, { reason: 'Allow Staff and Ticket Staff to see and help in tickets.' });
                if (native) {
                    const messageId = native.get('opendiscord:ticket-message').value;
                    if (messageId && channel.isTextBased())
                        await channel.messages.edit(messageId, (await engine.builders.messages.getSafe('opendiscord:ticket-message').build('other', { guild, channel, user: guild.client.user, ticket: native })).message);
                }
            }
            catch (error) {
                logger.warn('Ticket staff access refresh failed.', error);
            }
        }
    }
}
export const openTicketBridge = new OpenTicketBridge();
