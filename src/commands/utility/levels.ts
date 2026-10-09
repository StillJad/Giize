import { SlashCommandBuilder, ChannelType, type TextChannel } from 'discord.js';
import type {Command} from '../../types/Command.js';
import {levelService,xpForLevel} from '../../services/community/LevelService.js';
import {sqlite} from '../../database/database.js';
import {glurpsEmbed} from '../../utils/embeds.js';
export const command:Command={
 data:new SlashCommandBuilder().setName('levels').setDescription('Manage community leveling.')
 .addSubcommand(s=>s.setName('panel').setDescription('Post or update the live leaderboard.').addChannelOption(o=>o.setName('channel').setDescription('Where to post.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
 .addSubcommand(s=>s.setName('set').setDescription('Set a member level.').addUserOption(o=>o.setName('user').setDescription('Member.').setRequired(true)).addIntegerOption(o=>o.setName('level').setDescription('Level.').setMinValue(0).setMaxValue(1000).setRequired(true)))
 .addSubcommand(s=>s.setName('configure').setDescription('Configure leveling and role reward.').addBooleanOption(o=>o.setName('enabled').setDescription('Enable XP.')).addIntegerOption(o=>o.setName('reward_level').setDescription('Required level for the role.').setMinValue(1).setMaxValue(1000)).addRoleOption(o=>o.setName('reward_role').setDescription('Image Perms reward role.'))),
 async execute(i){
  await i.deferReply({flags:64}); if(!i.guild) return void await i.editReply('Use this in a server.');
  const sub=i.options.getSubcommand();
  if(sub==='panel') {
    const channel=i.options.getChannel('channel',true) as TextChannel;
    const existing=sqlite.prepare('SELECT message_id FROM level_panels WHERE guild_id=? AND channel_id=? LIMIT 1').get(i.guild.id,channel.id) as {message_id:string}|undefined;
    let message;
    if(existing)message=await channel.messages.edit(existing.message_id,levelService.panelPayload(i.guild.id)).catch(()=>null);
    if(!message)message=await channel.send(levelService.panelPayload(i.guild.id));
    levelService.registerPanel(i.guild.id,channel.id,message.id);await i.editReply('Live leaderboard updated.');
  }
  if(sub==='rank') await i.editReply({embeds:[levelService.rank(i.guild.id,i.options.getUser('user',true).id)],allowedMentions:{parse:[]}});
  if(sub==='leaderboard') await i.editReply({embeds:[levelService.leaderboard(i.guild.id)],allowedMentions:{parse:[]}});
  if(sub==='set'){const user=i.options.getUser('user',true);sqlite.prepare('INSERT INTO member_xp(guild_id,user_id,xp) VALUES (?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=excluded.xp').run(i.guild.id,user.id,xpForLevel(i.options.getInteger('level',true)));await levelService.syncReward(i.guild,user.id);levelService.changed(i.guild.id);await i.editReply('Member level updated.');}
  if(sub==='configure'){const current=levelService.settings(i.guild.id);sqlite.prepare('UPDATE level_settings SET enabled=?,reward_level=?,reward_role=? WHERE guild_id=?').run(i.options.getBoolean('enabled')===null?current.enabled:Number(i.options.getBoolean('enabled')),i.options.getInteger('reward_level')??current.reward_level,i.options.getRole('reward_role')?.id??current.reward_role,i.guild.id);await levelService.prepareReward(i.guild);levelService.changed(i.guild.id);await i.editReply('Level settings saved. Image Perms reward checked. Existing members are synced as they earn XP or with /levels set.');}
 }
};
