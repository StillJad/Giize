import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,PermissionFlagsBits,ModalBuilder,TextInputBuilder,TextInputStyle,EmbedBuilder,type Guild,type Client,type ButtonInteraction,type ModalSubmitInteraction} from 'discord.js';
import {sqlite} from '../../database/database.js';
import {logger} from '../../utils/logger.js';
sqlite.exec(`CREATE TABLE IF NOT EXISTS ticket_storage_settings(guild_id TEXT PRIMARY KEY,channel_id TEXT NOT NULL);CREATE TABLE IF NOT EXISTS ticket_archives(ticket_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,creator_id TEXT,storage_channel TEXT NOT NULL,storage_message TEXT NOT NULL,summary TEXT,log_channel TEXT,log_message TEXT,dm_channel TEXT,dm_message TEXT);`);
export class TicketArchiveService {
 row(id:string){return sqlite.prepare('SELECT * FROM ticket_archives WHERE ticket_id=?').get(id) as any;}
 async store(id:string,guild:Guild,contents:string){
  let stored=sqlite.prepare('SELECT channel_id FROM ticket_storage_settings WHERE guild_id=?').get(guild.id) as {channel_id:string}|undefined;
  let channel=stored?await guild.channels.fetch(stored.channel_id).catch(()=>null):null;
  if(!channel){channel=await guild.channels.create({name:'ticket-transcript-storage',type:ChannelType.GuildText,permissionOverwrites:[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:guild.client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.ReadMessageHistory]}]});sqlite.prepare('INSERT OR REPLACE INTO ticket_storage_settings(guild_id,channel_id) VALUES (?,?)').run(guild.id,channel.id);}
  if(channel.type!==ChannelType.GuildText)throw new Error('Transcript storage must be a text channel.');
  const old=this.row(id);const file={attachment:Buffer.from(contents,'utf8'),name:`ticket-${id}.txt`};
  const existing=old?await channel.messages.fetch(old.storage_message).catch(()=>null):null;
  const message=existing?await existing.edit({attachments:[],files:[file]}):await channel.send({content:`Transcript archive • ${id}`,files:[file],allowedMentions:{parse:[]}});
  sqlite.prepare('INSERT INTO ticket_archives(ticket_id,guild_id,storage_channel,storage_message) VALUES (?,?,?,?) ON CONFLICT(ticket_id) DO UPDATE SET storage_channel=excluded.storage_channel,storage_message=excluded.storage_message').run(id,guild.id,channel.id,message.id);
  return message.attachments.first()!.url;
 }
 components(id:string,admin=false){const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`archive_view:${id}`).setLabel('View Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary));if(admin)row.addComponents(new ButtonBuilder().setCustomId(`archive_reason:${id}`).setLabel('Edit Reason').setEmoji('✏️').setStyle(ButtonStyle.Secondary));return [row];}
 async deliver(id:string,client:Client,embed:EmbedBuilder,creator:string,logChannel:string){
  sqlite.prepare('UPDATE ticket_archives SET creator_id=?,summary=? WHERE ticket_id=?').run(creator,JSON.stringify(embed.toJSON()),id);
  const log=await client.channels.fetch(logChannel).catch(()=>null);
  if(log?.isTextBased() && 'send' in log){const message=await log.send({embeds:[embed],components:this.components(id,true),allowedMentions:{parse:[]}});sqlite.prepare('UPDATE ticket_archives SET log_channel=?,log_message=? WHERE ticket_id=?').run(message.channelId,message.id,id);}
  try {const user=await client.users.fetch(creator);const message=await user.send({embeds:[embed],components:this.components(id),allowedMentions:{parse:[]}});sqlite.prepare('UPDATE ticket_archives SET dm_channel=?,dm_message=? WHERE ticket_id=?').run(message.channelId,message.id,id);}catch(error){logger.warn('Could not DM ticket closure summary.',error);}
 }
 async authorized(i:ButtonInteraction|ModalSubmitInteraction,row:any,adminOnly=false){const guild=await i.client.guilds.fetch(row.guild_id);const member=await guild.members.fetch(i.user.id).catch(()=>null);return Boolean(member?.permissions.has(PermissionFlagsBits.Administrator)||(!adminOnly&&i.user.id===row.creator_id));}
 async button(i:ButtonInteraction){
  const [action,id]=i.customId.split(':');const row=this.row(id);if(!row||!await this.authorized(i,row,action==='archive_reason')){await i.reply({content:'This transcript is available to its opener and administrators.',flags:64});return;}
  if(action==='archive_reason'){const reason=JSON.parse(row.summary).fields.find((f:any)=>f.name==='Reason')?.value??'';await i.showModal(new ModalBuilder().setCustomId(`archive_reason_submit:${id}`).setTitle('Edit Closing Reason').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Closing reason').setStyle(TextInputStyle.Paragraph).setMaxLength(1024).setRequired(false).setValue(reason==='No reason provided.'?'':reason))));return;}
  await i.deferReply({flags:64});const channel=await i.client.channels.fetch(row.storage_channel);if(!channel?.isTextBased())throw new Error('Storage channel unavailable.');const stored=await channel.messages.fetch(row.storage_message);const attachment=stored.attachments.first();if(!attachment)throw new Error('Stored transcript unavailable.');
  try {await i.user.send({content:'Your ticket transcript.',files:[{attachment:attachment.url,name:'transcript.txt'}]});await i.editReply('Transcript sent to your DMs.');}catch{await i.editReply({content:'Your DMs are closed. Here is the transcript:',files:[{attachment:attachment.url,name:'transcript.txt'}]});}
 }
 async modal(i:ModalSubmitInteraction){const id=i.customId.split(':')[1];const row=this.row(id);if(!row||!await this.authorized(i,row,true)){await i.reply({content:'Administrator permission is required.',flags:64});return;}
  await i.deferReply({flags:64});const reason=i.fields.getTextInputValue('reason').trim()||'No reason provided.';const data=JSON.parse(row.summary);data.fields=data.fields.map((f:any)=>f.name==='Reason'?{...f,value:reason}:f);
  sqlite.prepare('UPDATE ticket_archives SET summary=? WHERE ticket_id=?').run(JSON.stringify(data),id);sqlite.prepare('UPDATE support_ticket_records SET reason=? WHERE channel_id=?').run(reason,id);
  let missed=false;for(const target of [['log_channel','log_message'],['dm_channel','dm_message']]){if(!row[target[0]]||!row[target[1]])continue;try {const channel=await i.client.channels.fetch(row[target[0]]);if(!channel?.isTextBased())continue;await (await channel.messages.fetch(row[target[1]])).edit({embeds:[new EmbedBuilder(data)]});}catch{missed=true;}}
  await i.editReply(missed?'Reason saved. A deleted or inaccessible summary could not be updated.':'Reason updated in the log and opener’s DM.');
 }
}
export const ticketArchiveService=new TicketArchiveService();
