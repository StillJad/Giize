import {SlashCommandBuilder} from 'discord.js';
import type {Command} from '../../types/Command.js';
import {levelService} from '../../services/community/LevelService.js';
export const command:Command={data:new SlashCommandBuilder().setName('level').setDescription('View your level or another member level.').addUserOption(o=>o.setName('user').setDescription('Member (defaults to you).').setRequired(false)),async execute(i){await i.reply({embeds:[levelService.rank(i.guildId!,i.options.getUser('user')?.id??i.user.id)],flags:64,allowedMentions:{parse:[]}});}};
