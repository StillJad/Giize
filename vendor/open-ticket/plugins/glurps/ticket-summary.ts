import {EmbedBuilder} from 'discord.js';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
async function database(){
 const {sqlite}=await import(pathToFileURL(resolve(process.env.GLURPS_ROOT!, 'dist/database/database.js')).href);
 sqlite.exec('CREATE TABLE IF NOT EXISTS support_ticket_records(channel_id TEXT PRIMARY KEY,number INTEGER NOT NULL UNIQUE,closed_by TEXT,closed_at INTEGER,reason TEXT)');
 return sqlite;
}
export async function ticketRecord(channelId:string){
 const db=await database();
 return db.transaction(()=>{
  let record=db.prepare('SELECT * FROM support_ticket_records WHERE channel_id=?').get(channelId);
  if(!record){const number=db.prepare('SELECT next_ticket_number AS n FROM ticket_counter WHERE id=1').get().n;db.prepare('UPDATE ticket_counter SET next_ticket_number=next_ticket_number+1 WHERE id=1').run();db.prepare('INSERT INTO support_ticket_records(channel_id,number) VALUES (?,?)').run(channelId,number);record=db.prepare('SELECT * FROM support_ticket_records WHERE channel_id=?').get(channelId);}
  return record;
 })();
}
export async function recordClosure(channelId:string,userId:string,reason:string|null){await ticketRecord(channelId);const db=await database();db.prepare('UPDATE support_ticket_records SET closed_by=?,closed_at=?,reason=? WHERE channel_id=?').run(userId,Date.now(),reason,channelId);}
export function duration(ms:number){const seconds=Math.max(0,Math.floor(ms/1000));return [seconds>=3600?`${Math.floor(seconds/3600)}h`:null,seconds>=60?`${Math.floor(seconds%3600/60)}m`:null,`${seconds%60}s`].filter(Boolean).join(' ');}
export async function closureEmbed(ticket:any,channel:any,user:any,full:boolean){
 const record=await ticketRecord(channel.id);
 const opened=ticket.get('opendiscord:opened-on').value??Date.now();
 const closed=record.closed_at??ticket.get('opendiscord:closed-on').value??Date.now();
 const creator=ticket.get('opendiscord:opened-by').value??user.id;
 const closer=record.closed_by??ticket.get('opendiscord:closed-by').value??user.id;
 const reason=record.reason?.trim()||'No reason provided.';
 const number=`#${String(record.number).padStart(4,'0')}`;
 const embed=new EmbedBuilder().setColor(0x5865F2).setTitle('Ticket Closed').setFooter({text:'Event Bot'}).setTimestamp(closed);
 if(!full) return embed.setDescription('Your support ticket has been closed.').addFields({name:'Ticket #',value:number},{name:'Closed By',value:`<@${closer}>`},{name:'Reason',value:reason.slice(0,1024)},{name:'Duration',value:duration(closed-opened)});
 const answers=ticket.get('opendiscord:answers').value??[];
 const opening=answers.map((a:any)=>a.value||a.files?.map((f:any)=>f.name).join(', ')).filter(Boolean).join('\n')||'No reason provided.';
 const priority=ticket.get('opendiscord:priority').value??0;
 return embed.addFields({name:'Ticket #',value:number},{name:'Channel',value:`${channel.name} (${channel.id})`},{name:'Opened By',value:`<@${creator}>`},{name:'Closed By',value:`<@${closer}>`},{name:'Ticket Type',value:ticket.option.get('opendiscord:name').value},{name:'Priority',value:({[-1]:'None',0:'Very Low',1:'Low',2:'Normal',3:'High',4:'Very High',5:'Urgent'} as Record<number,string>)[priority]??'Normal'},{name:'Opened',value:`<t:${Math.floor(opened/1000)}:F>`},{name:'Closed',value:`<t:${Math.floor(closed/1000)}:F>`},{name:'Duration',value:duration(closed-opened)},{name:'Opening Reason',value:opening.slice(0,1024)},{name:'Closing Reason',value:reason.slice(0,1024)},{name:'Creator ID',value:creator},{name:'Closer ID',value:closer});
}

export async function archiveService(){return (await import(pathToFileURL(resolve(process.env.GLURPS_ROOT!, 'dist/services/tickets/TicketArchiveService.js')).href)).ticketArchiveService;}
export async function compactClosureEmbed(ticket:any,channel:any,user:any){const full=(await closureEmbed(ticket,channel,user,true)).toJSON();const get=(name:string)=>full.fields!.find(f=>f.name===name)!.value;return new EmbedBuilder().setColor(0x2ecc71).setAuthor({name:channel.guild.name,iconURL:channel.guild.iconURL()??undefined}).setTitle('Ticket Closed').addFields({name:'🔢 Ticket ID',value:get('Ticket #'),inline:true},{name:'✅ Opened By',value:get('Opened By'),inline:true},{name:'🔒 Closed By',value:get('Closed By'),inline:true},{name:'🕒 Open Time',value:get('Opened'),inline:true},{name:'Duration',value:get('Duration'),inline:true},{name:'Reason',value:get('Closing Reason')}).setFooter({text:'Event Bot'}).setTimestamp(full.timestamp?new Date(full.timestamp):new Date());}
