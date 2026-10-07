import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, type Guild, type Message, type MessageReaction, type User, type ButtonInteraction } from "discord.js";
import { sqlite } from "../../database/database.js";
import { glurpsEmbed } from "../../utils/embeds.js";
import { logger } from "../../utils/logger.js";

sqlite.exec(`
CREATE TABLE IF NOT EXISTS level_roles(guild_id TEXT NOT NULL,level INTEGER NOT NULL,role_id TEXT NOT NULL,PRIMARY KEY(guild_id,level));
CREATE TABLE IF NOT EXISTS level_settings (guild_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, reward_level INTEGER NOT NULL DEFAULT 25, reward_role TEXT NOT NULL DEFAULT '1515691359862915162');
CREATE TABLE IF NOT EXISTS member_xp (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, last_award INTEGER NOT NULL DEFAULT 0, last_content TEXT NOT NULL DEFAULT '', PRIMARY KEY(guild_id,user_id));
`);
type Settings={enabled:number;reward_level:number;reward_role:string};
type XP={xp:number;last_award:number;last_content:string};
export function xpForLevel(level:number) { return 50*level*level+100*level; }
export function levelForXp(xp:number) { return Math.max(0,Math.floor((-100+Math.sqrt(10000+200*Math.max(0,xp)))/100)); }
export class LevelService {
  private activity=new Map<string,{last:number;blocked:number;content:string}>();
  private reactions=new Set<string>();

  settings(guildId:string) {
    sqlite.prepare('INSERT OR IGNORE INTO level_settings(guild_id) VALUES (?)').run(guildId);
    return sqlite.prepare('SELECT * FROM level_settings WHERE guild_id=?').get(guildId) as Settings;
  }
  get(guildId:string,userId:string) {
    return (sqlite.prepare('SELECT * FROM member_xp WHERE guild_id=? AND user_id=?').get(guildId,userId) as XP|undefined) ?? {xp:0,last_award:0,last_content:''};
  }
  award(guildId:string,userId:string,content:string,now=Date.now(),bonus=0) {
    if (!this.settings(guildId).enabled) return false;
    const normalized=content.toLowerCase().replace(/\s+/g,' ').trim();
    const key=`${guildId}:${userId}`;
    const prior=this.activity.get(key);
    if(prior && now<prior.blocked) return false;
    if(prior && (now-prior.last<3000 || normalized===prior.content)) {
      this.activity.set(key,{last:now,blocked:now+30000,content:normalized});return false;
    }
    this.activity.set(key,{last:now,blocked:0,content:normalized});
    if(!normalized || normalized.split(/\s+/).length>40) return false;
    sqlite.prepare(`INSERT INTO member_xp(guild_id,user_id,xp,last_award,last_content) VALUES (?,?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=xp+excluded.xp,last_award=excluded.last_award,last_content=excluded.last_content`).run(guildId,userId,20+bonus,now,normalized);
    return true;
  }
  async prepareReward(guild:Guild) {
    const settings=this.settings(guild.id);
    const role=await guild.roles.fetch(settings.reward_role);
    if(!role) throw new Error('Level reward role was not found. Configure it with /levels configure.');
    if(role.managed || role.permissions.has(PermissionFlagsBits.Administrator)) throw new Error('Use a normal non-administrator reward role.');
    if(!role.editable) throw new Error('Move the bot role above the level reward role and give it Manage Roles.');
    await guild.roles.fetch();
    for(const level of [1,...Array.from({length:20},(_,i)=>(i+1)*5)]) {
      const stored=sqlite.prepare('SELECT role_id FROM level_roles WHERE guild_id=? AND level=?').get(guild.id,level) as {role_id:string}|undefined;
      if(stored && guild.roles.cache.has(stored.role_id)) continue;
      const milestone=guild.roles.cache.find(r=>r.name===`Level ${level}` && !r.managed) ?? await guild.roles.create({name:`Level ${level}`,permissions:[],reason:'Level milestone reward.'});
      sqlite.prepare('INSERT OR REPLACE INTO level_roles(guild_id,level,role_id) VALUES (?,?,?)').run(guild.id,level,milestone.id);
    }
    if(!role.permissions.has(PermissionFlagsBits.EmbedLinks)) await role.setPermissions(role.permissions.bitfield|PermissionFlagsBits.EmbedLinks,'Level reward grants Embed Links.');
  }
  async syncReward(guild:Guild,userId:string) {
    const settings=this.settings(guild.id);
    const member=await guild.members.fetch(userId);
    const level=levelForXp(this.get(guild.id,userId).xp);
    const rewards=sqlite.prepare('SELECT level,role_id FROM level_roles WHERE guild_id=? ORDER BY level DESC').all(guild.id) as {level:number;role_id:string}[];
    const highest=rewards.find(r=>r.level<=level);
    for(const reward of rewards) {
      if(reward===highest && !member.roles.cache.has(reward.role_id)) await member.roles.add(reward.role_id);
      if(reward!==highest && member.roles.cache.has(reward.role_id)) await member.roles.remove(reward.role_id);
    }
    const eligible=level>=settings.reward_level;
    if(eligible && !member.roles.cache.has(settings.reward_role)) await member.roles.add(settings.reward_role,'Level reward earned.');
    if(!eligible && member.roles.cache.has(settings.reward_role)) await member.roles.remove(settings.reward_role,'Level reward threshold no longer met.');
  }
  async handleMessage(message:Message) {
    if(!message.guild || !message.member || message.author.bot || message.webhookId || message.system) return;
    if(message.channel.isThread()) return;
    if('name' in message.channel && /^(ticket-|event-app-)/.test(message.channel.name ?? "")) return;
    const before=levelForXp(this.get(message.guild.id,message.author.id).xp);
    const image=message.attachments.some(a=>a.contentType?.startsWith('image/'));
    if(!this.award(message.guild.id,message.author.id,message.content || (image?`image ${message.id}`:''),Date.now(),(image?10:0)+(message.reference?.messageId?5:0))) return;
    await this.afterAward(message,before);
  }
  private async afterAward(message:Message,before:number) {
    const level=levelForXp(this.get(message.guild!.id,message.author.id).xp);
    if(level<=before) return;
    await this.syncReward(message.guild!,message.author.id).catch(error=>logger.warn('Level role assignment failed.',error));
    if('send' in message.channel) await message.channel.send({content:`<@${message.author.id}> has reached level **${level}**. GG!`,allowedMentions:{users:[message.author.id]}});
  }
  async handleReaction(reaction:MessageReaction,user:User) {
    if(user.bot) return;
    if(reaction.partial) await reaction.fetch();
    const message=reaction.message.partial?await reaction.message.fetch():reaction.message;
    if(!message.guild || message.author.bot || message.author.id===user.id || !this.settings(message.guild.id).enabled) return;
    if('name' in message.channel && /^(ticket-|event-app-)/.test(message.channel.name??'')) return;
    const key=`${message.id}:${user.id}`;
    if(this.reactions.has(key)) return;
    this.reactions.add(key);
    if(this.reactions.size>10000) this.reactions.delete(this.reactions.values().next().value!);
    const recent=this.get(message.guild.id,message.author.id);
    if(Date.now()-recent.last_award<30000) return;
    const before=levelForXp(recent.xp);
    sqlite.prepare(`INSERT INTO member_xp(guild_id,user_id,xp,last_award) VALUES (?,?,5,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=xp+5,last_award=excluded.last_award`).run(message.guild.id,message.author.id,Date.now());
    await this.afterAward(message,before);
  }
  rank(guildId:string,userId:string) {
    const {xp}=this.get(guildId,userId); const level=levelForXp(xp);
    return glurpsEmbed().setTitle('Your Rank').setDescription(`<@${userId}>`).addFields({name:'Level',value:String(level),inline:true},{name:'XP',value:String(xp),inline:true},{name:'Next level',value:`${xpForLevel(level+1)-xp} XP to go`,inline:true},{name:'Embed role',value:`Unlocks at level ${this.settings(guildId).reward_level}`});
  }
  leaderboard(guildId:string) {
    const rows=sqlite.prepare('SELECT user_id,xp FROM member_xp WHERE guild_id=? ORDER BY xp DESC,user_id LIMIT 10').all(guildId) as {user_id:string;xp:number}[];
    return glurpsEmbed().setTitle('Server Leaderboard').setDescription(rows.map((r,i)=>`${i+1}. <@${r.user_id}> — level **${levelForXp(r.xp)}** (${r.xp} XP)`).join('\n')||'No XP earned yet.');
  }
  panel() { return new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('levels_rank').setLabel('My Rank').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('levels_leaderboard').setLabel('Leaderboard').setStyle(ButtonStyle.Secondary)); }
  async button(interaction:ButtonInteraction) {
    if(!interaction.guildId) return;
    await interaction.reply({embeds:[interaction.customId==='levels_rank'?this.rank(interaction.guildId,interaction.user.id):this.leaderboard(interaction.guildId)],flags:64,allowedMentions:{parse:[]}});
  }
}
export const levelService=new LevelService();
