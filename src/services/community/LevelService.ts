import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, type Client, type Guild, type Message, type MessageReaction, type User, type ButtonInteraction } from "discord.js";
import {levelRewardService} from "./LevelRewardService.js";
import { sqlite } from "../../database/database.js";
import { glurpsEmbed } from "../../utils/embeds.js";
import { logger } from "../../utils/logger.js";

sqlite.exec(`
CREATE TABLE IF NOT EXISTS level_panels(guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS level_notices(channel_id TEXT NOT NULL,message_id TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS level_announcements(guild_id TEXT PRIMARY KEY,channel_id TEXT NOT NULL);
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
  private client?:Client;
  private timer?:ReturnType<typeof setInterval>;
  private dirty=new Set<string>();
  private refreshing=false;
  start(client:Client) {
    this.client=client;
    for(const row of sqlite.prepare('SELECT DISTINCT guild_id FROM level_panels').all() as {guild_id:string}[])this.dirty.add(row.guild_id);
    if(!this.timer){this.timer=setInterval(()=>void this.refreshPanels(),5000);this.timer.unref();}
    void this.refreshPanels();
  }
  stop(){if(this.timer)clearInterval(this.timer);this.timer=undefined;}
  changed(guildId:string){this.dirty.add(guildId);}
  async refreshPanels() {
    if(!this.client || this.refreshing)return;
    this.refreshing=true;
    try {
      for(const guildId of [...this.dirty]) {
        this.dirty.delete(guildId);
        for(const row of sqlite.prepare('SELECT * FROM level_panels WHERE guild_id=?').all(guildId) as {channel_id:string;message_id:string}[]) {
          try {
            const channel=await this.client.channels.fetch(row.channel_id);
            if(channel?.isTextBased())await channel.messages.edit(row.message_id,this.panelPayload(guildId));
          } catch(error) {
            if([10003,10008].includes(Number((error as {code?:number}).code)))sqlite.prepare('DELETE FROM level_panels WHERE message_id=?').run(row.message_id);
            else {this.dirty.add(guildId);logger.warn('Live leaderboard update failed.',error);}
          }
        }
      }
      for(const row of sqlite.prepare('SELECT * FROM level_notices WHERE expires_at<=?').all(Date.now()) as {channel_id:string;message_id:string}[]) {
        try {const channel=await this.client.channels.fetch(row.channel_id);if(channel?.isTextBased())await channel.messages.delete(row.message_id);sqlite.prepare('DELETE FROM level_notices WHERE message_id=?').run(row.message_id);}
        catch(error){if([10003,10008].includes(Number((error as {code?:number}).code)))sqlite.prepare('DELETE FROM level_notices WHERE message_id=?').run(row.message_id);else logger.warn('Temporary level-up notice cleanup failed.',error);}
      }
    } finally {this.refreshing=false;}
  }
  registerPanel(guildId:string,channelId:string,messageId:string){sqlite.prepare('INSERT OR REPLACE INTO level_panels(guild_id,channel_id,message_id) VALUES (?,?,?)').run(guildId,channelId,messageId);this.changed(guildId);}


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
    this.changed(guildId);
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
    if(!role.permissions.has(PermissionFlagsBits.EmbedLinks)) await role.setPermissions(role.permissions.bitfield|PermissionFlagsBits.EmbedLinks,'Level reward grants image permissions.');
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
    await levelRewardService.sync(guild,userId,level);
  }
  async handleMessage(message:Message) {
    if(!message.guild || !message.member || message.author.bot || message.webhookId || message.system) return;
    if(message.channel.isThread()) return;
    if('name' in message.channel && /^(ticket-|event-app-)/.test(message.channel.name ?? "")) return;
    const before=levelForXp(this.get(message.guild.id,message.author.id).xp);
    const image=message.attachments.some(a=>a.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|bmp)(?:$|\?)/i.test(a.name??a.url));
    if(!this.award(message.guild.id,message.author.id,message.content || (image?`image ${message.id}`:''),Date.now(),(image?10:0)+(message.reference?.messageId?5:0))) return;
    await this.afterAward(message,before);
  }
  private async afterAward(message:Message,before:number,userId=message.author.id) {
    const level=levelForXp(this.get(message.guild!.id,userId).xp);
    this.changed(message.guild!.id);
    if(level<=before) return;
    await this.syncReward(message.guild!,userId).catch(error=>logger.warn('Level role assignment failed.',error));
    if('send' in message.channel) await message.channel.send({content:`<@${userId}> has reached level **${level}**. GG!`,allowedMentions:{users:[userId]}});
    const announcement=sqlite.prepare('SELECT channel_id FROM level_announcements WHERE guild_id=?').get(message.guild!.id) as {channel_id:string}|undefined;
    if(announcement) {
      try {
        const channel=await message.guild!.channels.fetch(announcement.channel_id);
        if(channel?.isTextBased() && 'send' in channel) {
          const rewardLevel=this.settings(message.guild!.id).reward_level;
          const unlocked=before<rewardLevel && level>=rewardLevel?'\n🖼️ **Image Perms unlocked!**':'';
          const notice=await channel.send({embeds:[glurpsEmbed().setTitle('⬆️ Level Up!').setDescription(`<@${userId}> reached **level ${level}**. GG!${unlocked}`).setFooter({text:'This announcement disappears after 30 seconds.'})],allowedMentions:{users:[userId]}});
          sqlite.prepare('INSERT OR REPLACE INTO level_notices(channel_id,message_id,expires_at) VALUES (?,?,?)').run(channel.id,notice.id,Date.now()+30000);
        }
      }catch(error){logger.warn('Level-up channel announcement failed.',error);}
    }
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
    for(const userId of [message.author.id,user.id]) {
      const recent=this.get(message.guild.id,userId);
      if(Date.now()-recent.last_award<30000) continue;
      const before=levelForXp(recent.xp);
      sqlite.prepare(`INSERT INTO member_xp(guild_id,user_id,xp,last_award) VALUES (?,?,5,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=xp+5,last_award=excluded.last_award`).run(message.guild.id,userId,Date.now());
      await this.afterAward(message,before,userId);
    }
  }

  rank(guildId:string,userId:string) {
    const {xp}=this.get(guildId,userId);const level=levelForXp(xp);
    const floor=xpForLevel(level),ceiling=xpForLevel(level+1);const progress=Math.min(10,Math.floor((xp-floor)/(ceiling-floor)*10));
    const rank=(sqlite.prepare('SELECT COUNT(*) AS count FROM member_xp WHERE guild_id=? AND (xp>? OR (xp=? AND user_id<?))').get(guildId,xp,xp,userId) as {count:number}).count+1;
    const rewardLevel=this.settings(guildId).reward_level;const next=level<1?1:Math.floor(level/5)*5+5;
    return glurpsEmbed().setTitle('Your Rank').setDescription(`<@${userId}>\n${'▰'.repeat(progress)}${'▱'.repeat(10-progress)} **${Math.floor((xp-floor)/(ceiling-floor)*100)}%** to level ${level+1}`).addFields(
      {name:'Level',value:String(level),inline:true},{name:'Server rank',value:xp>0?`#${rank}`:'Unranked',inline:true},{name:'Total XP',value:xp.toLocaleString(),inline:true},
      {name:'Next level',value:`${(ceiling-xp).toLocaleString()} XP to go`,inline:true},{name:'Image Perms',value:level>=rewardLevel?'✅ Unlocked':`🖼️ Unlocks at level ${rewardLevel}`,inline:true},
      {name:'Next role',value:next<=100?`Level ${next}`:'All milestone roles unlocked',inline:true});
  }
  pages(guildId:string){const count=(sqlite.prepare('SELECT COUNT(*) AS count FROM member_xp WHERE guild_id=? AND xp>0').get(guildId) as {count:number}).count;return Math.max(1,Math.ceil(count/10));}
  leaderboard(guildId:string,page=0,live=false) {
    page=Math.max(0,Math.min(page,this.pages(guildId)-1));
    const rows=sqlite.prepare('SELECT user_id,xp FROM member_xp WHERE guild_id=? AND xp>0 ORDER BY xp DESC,user_id LIMIT 10 OFFSET ?').all(guildId,page*10) as {user_id:string;xp:number}[];
    return glurpsEmbed().setTitle(live?'🏆 Live Leaderboard':'🏆 Server Leaderboard').setDescription(rows.map((r,i)=>`${page===0 && i<3?['🥇','🥈','🥉'][i]:`**${page*10+i+1}.**`} <@${r.user_id}>\n　Level **${levelForXp(r.xp)}** · **${r.xp.toLocaleString()} XP**`).join('\n\n')||'No XP earned yet. Chat to claim the first spot!').setFooter({text:live?'Updates automatically • Image Perms unlock at level '+this.settings(guildId).reward_level:`Page ${page+1} of ${this.pages(guildId)}`}).setTimestamp();
  }
  panel() {return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('levels_rank').setLabel('My Level').setEmoji('📊').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('levels_rewards').setLabel('Rewards').setEmoji('🎁').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('levels_info').setLabel('How XP Works').setEmoji('💬').setStyle(ButtonStyle.Secondary));}
  panelPayload(guildId:string) {
    const components=[this.panel()];
    if(this.pages(guildId)>1)components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('levels_browse').setLabel('More Rankings').setStyle(ButtonStyle.Secondary)));
    return {embeds:[this.leaderboard(guildId,0,true)],components,allowedMentions:{parse:[] as []}};
  }
  private pageControls(guildId:string,userId:string,page:number) {
    const pages=this.pages(guildId);if(pages<=1)return [];
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`levels_page:${userId}:${Math.max(0,page-1)}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page===0),
      new ButtonBuilder().setCustomId(`levels_page:${userId}:${Math.min(pages-1,page+1)}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page>=pages-1))];
  }
  privateRewards(guildId:string) {return glurpsEmbed().setTitle('🎁 Level Rewards').setDescription(`Earn **Level 1**, then milestone roles every **5 levels** up to level 100. Your highest milestone role replaces the previous one.\n\n🖼️ **Image Perms** unlocks at **level ${this.settings(guildId).reward_level}** and stays alongside your milestone role.\n\n**Level 15:** External emojis and stickers\n**Level 50:** Your own role above Diamond Supporter; request name or colour changes in a ticket anytime\n**Level 75:** Your own server emoji — open a ticket\n**Level 100:** Your own server sticker — open a ticket\n\nReward instructions arrive in your DMs. Emoji and sticker additions require staff approval and available slots.`);}
  xpInfo(guildId:string){return glurpsEmbed().setTitle('💬 How XP Works').setDescription('💬 **Message:** 20 XP\n🖼️ **Image:** +10 XP, including images sent alone\n↩️ **Reply:** +5 XP\n❤️ **Reaction:** 5 XP each for the reactor and message author\n\n⏱️ Rapid messages (under 3 seconds apart) or repeated messages trigger a **30-second spam cooldown**. Reactions have a **30-second XP cooldown** per person. Reacting to yourself or repeating a reaction does not earn XP.\n\nMessages over **40 words**, bots, threads, and ticket channels do not earn message XP.\n\n🖼️ **Image Perms** unlocks at **level '+this.settings(guildId).reward_level+'**.');}
  async button(interaction:ButtonInteraction) {
    if(!interaction.guildId)return;
    const id=interaction.customId;
    if(id.startsWith('levels_page:')) {
      const [,owner,value]=id.split(':');if(owner!==interaction.user.id){await interaction.reply({content:'Open your own leaderboard to browse.',flags:64});return;}
      const page=Math.max(0,Math.min(Number(value)||0,this.pages(interaction.guildId)-1));
      await interaction.update({embeds:[this.leaderboard(interaction.guildId,page)],components:this.pageControls(interaction.guildId,owner,page),allowedMentions:{parse:[]}});return;
    }
    if(id==='levels_rank' || id==='levels_rewards' || id==='levels_info') {await interaction.reply({embeds:[id==='levels_rank'?this.rank(interaction.guildId,interaction.user.id):id==='levels_rewards'?this.privateRewards(interaction.guildId):this.xpInfo(interaction.guildId)],flags:64,allowedMentions:{parse:[]}});return;}
    const page=id==='levels_browse'?Math.min(1,this.pages(interaction.guildId)-1):0;
    await interaction.reply({embeds:[this.leaderboard(interaction.guildId,page)],components:this.pageControls(interaction.guildId,interaction.user.id,page),flags:64,allowedMentions:{parse:[]}});
  }
  async browse(interaction:import('discord.js').ChatInputCommandInteraction){await interaction.reply({embeds:[this.leaderboard(interaction.guildId!)],components:this.pageControls(interaction.guildId!,interaction.user.id,0),flags:64,allowedMentions:{parse:[]}});}
}
export const levelService=new LevelService();
