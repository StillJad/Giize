import { SlashCommandBuilder, ChannelType, type TextChannel } from 'discord.js';
import type {Command} from '../../types/Command.js';
import {levelService,xpForLevel} from '../../services/community/LevelService.js';
import {sqlite} from '../../database/database.js';
import {glurpsEmbed} from '../../utils/embeds.js';
export const command:Command={
 data:new SlashCommandBuilder().setName('levels').setDescription('Manage community leveling.')
 .addSubcommand(s=>s.setName('panel').setDescription('Post member rank and leaderboard buttons.').addChannelOption(o=>o.setName('channel').setDescription('Where to post.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
 .addSubcommand(s=>s.setName('rank').setDescription('View a member rank.').addUserOption(o=>o.setName('user').setDescription('Member.').setRequired(true)))
 .addSubcommand(s=>s.setName('leaderboard').setDescription('View the top ten.'))
 .addSubcommand(s=>s.setName('set').setDescription('Set a member level.').addUserOption(o=>o.setName('user').setDescription('Member.').setRequired(true)).addIntegerOption(o=>o.setName('level').setDescription('Level.').setMinValue(0).setMaxValue(1000).setRequired(true)))
 .addSubcommand(s=>s.setName('configure').setDescription('Configure leveling and role reward.').addBooleanOption(o=>o.setName('enabled').setDescription('Enable XP.')).addIntegerOption(o=>o.setName('reward_level').setDescription('Required level for the role.').setMinValue(1).setMaxValue(1000)).addRoleOption(o=>o.setName('reward_role').setDescription('Role granting Embed Links.'))),
 async execute(i){
  await i.deferReply({flags:64}); if(!i.guild) return void await i.editReply('Use this in a server.');
  const sub=i.options.getSubcommand();
  if(sub==='panel') {await (i.options.getChannel('channel',true) as TextChannel).send({embeds:[glurpsEmbed().setTitle('Community Levels').setDescription(`Chat to earn XP. Unlock the Embed Links role at level ${levelService.settings(i.guildId!).reward_level}.`) ],components:[levelService.panel()]});await i.editReply('Level panel posted.');}
  if(sub==='rank') await i.editReply({embeds:[levelService.rank(i.guild.id,i.options.getUser('user',true).id)],allowedMentions:{parse:[]}});
  if(sub==='leaderboard') await i.editReply({embeds:[levelService.leaderboard(i.guild.id)],allowedMentions:{parse:[]}});
  if(sub==='set'){const user=i.options.getUser('user',true);sqlite.prepare('INSERT INTO member_xp(guild_id,user_id,xp) VALUES (?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=excluded.xp').run(i.guild.id,user.id,xpForLevel(i.options.getInteger('level',true)));await levelService.syncReward(i.guild,user.id);await i.editReply('Member level updated.');}
  if(sub==='configure'){const current=levelService.settings(i.guild.id);sqlite.prepare('UPDATE level_settings SET enabled=?,reward_level=?,reward_role=? WHERE guild_id=?').run(i.options.getBoolean('enabled')===null?current.enabled:Number(i.options.getBoolean('enabled')),i.options.getInteger('reward_level')??current.reward_level,i.options.getRole('reward_role')?.id??current.reward_role,i.guild.id);await levelService.prepareReward(i.guild);await i.editReply('Level settings saved. Role Embed Links permission checked. Existing members are synced as they earn XP or with /levels set.');}
 }
};
