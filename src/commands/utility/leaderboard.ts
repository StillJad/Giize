import {SlashCommandBuilder} from 'discord.js';
import type {Command} from '../../types/Command.js';
import {levelService} from '../../services/community/LevelService.js';
export const command:Command={data:new SlashCommandBuilder().setName('leaderboard').setDescription('View the server leaderboard.'),execute:i=>levelService.browse(i)};
