import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/Command.js';
import { verificationService, VerificationService } from '../../services/verification/VerificationService.js';
import { minecraftProfileService } from '../../services/verification/MinecraftProfileService.js';
import { caseService } from '../../services/moderation/CaseService.js';
import { glurpsEmbed } from '../../utils/embeds.js';
import { config } from '../../config/config.js';
export const command: Command = {
    data: new SlashCommandBuilder().setName('forceverify').setDescription('Verify or update a member’s Minecraft account as an administrator.')
        .addUserOption(o => o.setName('user').setDescription('Member to verify').setRequired(true))
        .addStringOption(o => o.setName('minecraft_username').setDescription('Their Minecraft username').setRequired(true))
        .addStringOption(o => o.setName('platform').setDescription('Account platform').setRequired(true).addChoices({ name: 'Java', value: 'java' }, { name: 'Bedrock', value: 'bedrock' }))
        .addStringOption(o => o.setName('reason').setDescription('Why you are verifying or updating this account').setMaxLength(500)),
    async execute(i) {
        await i.deferReply({ flags: 64 });
        const user = i.options.getUser('user', true);
        const member = await i.guild!.members.fetch(user.id).catch(() => null);
        if (!member || user.bot) {
            await i.editReply('Choose a real member of this server.');
            return;
        }
        const platform = i.options.getString('platform', true) as 'java' | 'bedrock';
        let username = i.options.getString('minecraft_username', true).trim();
        let uuid: string | null = null;
        if (platform === 'java') {
            const result = await minecraftProfileService.checkJavaUsername(username);
            if (!result.exists) {
                await i.editReply(result.reason === 'network' ? 'Minecraft lookup is unavailable. Try again shortly.' : 'That Java account could not be found. Check the username.');
                return;
            }
            username = result.canonicalUsername;
            uuid = result.uuid;
        }
        else {
            const result = VerificationService.validateBedrockUsername(username);
            if (!result.valid) {
                await i.editReply('That Bedrock gamertag is invalid. Use up to 15 letters, numbers, spaces, underscores or hyphens.');
                return;
            }
            username = result.cleanUsername;
        }
        const reason = i.options.getString('reason') ?? 'Administrator assisted verification';
        const previous = verificationService.getStoredAccounts(i.guildId!, user.id);
        await verificationService.verifyMember(i.guild!, member, platform, username, uuid);
        caseService.record(i.guildId!, user.id, i.user.id, 'forceverify', `${platform}: ${username}. Previous: ${JSON.stringify(previous)}. ${reason}`);
        const embed = glurpsEmbed().setTitle('Member Verified by Administrator').addFields({ name: 'Member', value: `<@${user.id}>`, inline: true }, { name: 'Verified by', value: `<@${i.user.id}>`, inline: true }, { name: 'Account', value: `${username} (${platform})` }, { name: 'Reason', value: reason });
        if (config.verificationLogsChannelId) {
            const channel = await i.guild!.channels.fetch(config.verificationLogsChannelId).catch(() => null);
            if (channel?.isTextBased() && 'send' in channel)
                await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        }
        await i.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
};
