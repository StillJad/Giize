import { PermissionFlagsBits, type Guild } from 'discord.js';
import {sqlite} from '../../database/database.js';
import {logger} from '../../utils/logger.js';
import {glurpsEmbed} from '../../utils/embeds.js';
sqlite.exec(`CREATE TABLE IF NOT EXISTS level_personal_roles(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,role_id TEXT NOT NULL,PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS level_reward_notifications(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,milestone INTEGER NOT NULL,delivered_at INTEGER NOT NULL,PRIMARY KEY(guild_id,user_id,milestone));
CREATE TABLE IF NOT EXISTS level_extra_rewards(guild_id TEXT PRIMARY KEY,external_role TEXT NOT NULL);`);
export class LevelRewardService {
 private tasks=new Map<string,Promise<void>>();
 async prepare(guild:Guild) {
  const stored=sqlite.prepare('SELECT external_role FROM level_extra_rewards WHERE guild_id=?').get(guild.id) as {external_role:string}|undefined;
  let role=stored?await guild.roles.fetch(stored.external_role):null;
  if(!role){await guild.roles.fetch();role=guild.roles.cache.find(r=>r.name==='External Emoji Perms' && !r.managed)??await guild.roles.create({name:'External Emoji Perms',permissions:[PermissionFlagsBits.UseExternalEmojis,PermissionFlagsBits.UseExternalStickers],reason:'Level 15 reward.'});sqlite.prepare('INSERT OR REPLACE INTO level_extra_rewards VALUES (?,?)').run(guild.id,role.id);}
  if(role.editable && !role.permissions.has([PermissionFlagsBits.UseExternalEmojis,PermissionFlagsBits.UseExternalStickers]))await role.setPermissions(role.permissions.bitfield|PermissionFlagsBits.UseExternalEmojis|PermissionFlagsBits.UseExternalStickers,'Level 15 emoji and sticker reward.');
 }
 async sync(guild:Guild,userId:string,level:number) {
  const key=`${guild.id}:${userId}`;const previous=this.tasks.get(key)??Promise.resolve();const task=previous.catch(()=>{}).then(()=>this.apply(guild,userId,level));this.tasks.set(key,task);
  try{await task;}finally{if(this.tasks.get(key)===task)this.tasks.delete(key);}
 }
 private async apply(guild:Guild,userId:string,level:number) {
  const member=await guild.members.fetch(userId);
  const external=sqlite.prepare('SELECT external_role FROM level_extra_rewards WHERE guild_id=?').get(guild.id) as {external_role:string}|undefined;
  if(external){if(level>=15 && !member.roles.cache.has(external.external_role))await member.roles.add(external.external_role);if(level<15 && member.roles.cache.has(external.external_role))await member.roles.remove(external.external_role);}
  const saved=sqlite.prepare('SELECT role_id FROM level_personal_roles WHERE guild_id=? AND user_id=?').get(guild.id,userId) as {role_id:string}|undefined;
  if(level<50){if(saved && member.roles.cache.has(saved.role_id))await member.roles.remove(saved.role_id);return;}
  const diamond=await guild.roles.fetch(process.env.DIAMOND_SUPPORTER_ROLE_ID??'1525940096048566302');
  if(!diamond)throw new Error('Diamond Supporter role is missing.');
  const me=await guild.members.fetchMe();if(me.roles.highest.position<=diamond.position+1)throw new Error('Move the bot above Diamond Supporter to create personal roles.');
  let personal=saved?await guild.roles.fetch(saved.role_id):null;
  if(!personal){personal=await guild.roles.create({name:`${member.displayName.slice(0,85)}'s Role`,color:0x5865f2,permissions:[],hoist:false,mentionable:false,reason:'Level 50 personal role reward.'});sqlite.prepare('INSERT OR REPLACE INTO level_personal_roles VALUES (?,?,?)').run(guild.id,userId,personal.id);}
  if(personal.managed || !personal.editable)throw new Error('The personal reward role is no longer editable.');
  if(personal.position<=diamond.position)await personal.setPosition(diamond.position+1,{reason:'Place level 50 personal role above Diamond Supporter.'});
  if(!member.roles.cache.has(personal.id))await member.roles.add(personal.id,'Level 50 personal role reward.');
  for(const milestone of [50,75,100]) {
   if(level<milestone || sqlite.prepare('SELECT 1 FROM level_reward_notifications WHERE guild_id=? AND user_id=? AND milestone=?').get(guild.id,userId,milestone))continue;
   const link=`https://discord.com/channels/${guild.id}/${process.env.TICKET_PANEL_CHANNEL_ID??'1517297214152638635'}`;
   const descriptions:Record<number,string>={50:`Your personal role **${personal.name}** is ready and has been given to you!\n\n[Open a support ticket](${link}) whenever you want to change its **name or colour**. You can request changes at any time.`,75:`You unlocked a **custom server emoji**!\n\n[Open a support ticket](${link}) and send the image you want to use. Staff will help add it, subject to approval and available emoji slots.`,100:`You unlocked a **custom server sticker**!\n\n[Open a support ticket](${link}) and send your sticker idea or image. Staff will help add it, subject to approval and available sticker slots.`};
   try {await member.send({embeds:[glurpsEmbed().setTitle(`🎁 Level ${milestone} Reward`).setDescription(descriptions[milestone])],allowedMentions:{parse:[]}});sqlite.prepare('INSERT OR IGNORE INTO level_reward_notifications VALUES (?,?,?,?)').run(guild.id,userId,milestone,Date.now());}
   catch(error){logger.warn(`Level ${milestone} reward DM could not be delivered.`,error);}
  }
 }
}
export const levelRewardService=new LevelRewardService();
