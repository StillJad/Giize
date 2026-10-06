import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, type Guild, type Message, type ButtonInteraction } from "discord.js";
import { sqlite } from "../../database/database.js";
import { glurpsEmbed } from "../../utils/embeds.js";
import { logger } from "../../utils/logger.js";

sqlite.exec(`
CREATE TABLE IF NOT EXISTS level_settings (guild_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, reward_level INTEGER NOT NULL DEFAULT 25, reward_role TEXT NOT NULL DEFAULT '1515691359862915162');
CREATE TABLE IF NOT EXISTS member_xp (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, last_award INTEGER NOT NULL DEFAULT 0, last_content TEXT NOT NULL DEFAULT '', PRIMARY KEY(guild_id,user_id));
`);
type Settings={enabled:number;reward_level:number;reward_role:string};
type XP={xp:number;last_award:number;last_content:string};
export function xpForLevel(level:number) { return 50*level*level+100*level; }
export function levelForXp(xp:number) { return Math.max(0,Math.floor((-100+Math.sqrt(10000+200*Math.max(0,xp)))/100)); }
export class LevelService {
  settings(guildId:string) {
    sqlite.prepare('INSERT OR IGNORE INTO level_settings(guild_id) VALUES (?)').run(guildId);
    return sqlite.prepare('SELECT * FROM level_settings WHERE guild_id=?').get(guildId) as Settings;
  }
  get(guildId:string,userId:string) {
    return (sqlite.prepare('SELECT * FROM member_xp WHERE guild_id=? AND user_id=?').get(guildId,userId) as XP|undefined) ?? {xp:0,last_award:0,last_content:''};
  }
  award(guildId:string,userId:string,content:string,now=Date.now()) {
    if (!this.settings(guildId).enabled) return false;
    const normalized=content.toLowerCase().replace(/\s+/g,' ').trim();
    if(normalized.length<5) return false;
    return sqlite.transaction(()=>{
      const current=this.get(guildId,userId);
      if(now-current.last_award<60000 || normalized===current.last_content) return false;
      sqlite.prepare(`INSERT INTO member_xp(guild_id,user_id,xp,last_award,last_content) VALUES (?,?,20,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=xp+20,last_award=excluded.last_award,last_content=excluded.last_content`).run(guildId,userId,now,normalized);
      return true;
    })();
  }
  async prepareReward(guild:Guild) {
    const settings=this.settings(guild.id);
    const role=await guild.roles.fetch(settings.reward_role);
    if(!role) throw new Error('Level reward role was not found. Configure it with /levels configure.');
    if(role.managed || role.permissions.has(PermissionFlagsBits.Administrator)) throw new Error('Use a normal non-administrator reward role.');
    if(!role.editable) throw new Error('Move the bot role above the level reward role and give it Manage Roles.');
    if(!role.permissions.has(PermissionFlagsBits.EmbedLinks)) await role.setPermissions(role.permissions.bitfield|PermissionFlagsBits.EmbedLinks,'Level reward grants Embed Links.');
  }
  async syncReward(guild:Guild,userId:string) {
    const settings=this.settings(guild.id);
    const member=await guild.members.fetch(userId);
    const eligible=levelForXp(this.get(guild.id,userId).xp)>=settings.reward_level;
    if(eligible && !member.roles.cache.has(settings.reward_role)) await member.roles.add(settings.reward_role,'Level reward earned.');
    if(!eligible && member.roles.cache.has(settings.reward_role)) await member.roles.remove(settings.reward_role,'Level reward threshold no longer met.');
  }
  async handleMessage(message:Message) {
    if(!message.guild || !message.member || message.author.bot || message.webhookId || message.system) return;
    if(message.channel.isThread()) return;
    if('name' in message.channel && /^(ticket-|event-app-)/.test(message.channel.name ?? "")) return;
    if(!this.award(message.guild.id,message.author.id,message.content)) return;
    const settings=this.settings(message.guild.id);
    if(levelForXp(this.get(message.guild.id,message.author.id).xp)>=settings.reward_level) {
      await this.syncReward(message.guild,message.author.id).catch(error=>logger.warn('Level reward assignment failed.',error));
    }
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
