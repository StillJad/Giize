import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/Command.js';
import { verificationService } from '../../services/verification/VerificationService.js';
import { glurpsEmbed } from '../../utils/embeds.js';
export const command: Command = {
    data: new SlashCommandBuilder().setName('verification').setDescription('Check a member’s saved Minecraft verification.').addUserOption(o => o.setName('user').setDescription('Member to check').setRequired(true)),
    async execute(i) { const user = i.options.getUser('user', true); const accounts = verificationService.getStoredAccounts(i.guildId!, user.id); await i.reply({ flags: 64, embeds: [glurpsEmbed().setTitle('Minecraft Verification').addFields({ name: 'Member', value: `<@${user.id}>` }, { name: 'Java', value: accounts.javaUsername ?? 'Not verified', inline: true }, { name: 'Bedrock', value: accounts.bedrockUsername ?? 'Not verified', inline: true })], allowedMentions: { parse: [] } }); }
};
