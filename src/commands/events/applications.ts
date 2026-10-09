import {SlashCommandBuilder,AttachmentBuilder} from 'discord.js';
import type {Command} from '../../types/Command.js';
import {sqlite} from '../../database/database.js';
import {glurpsEmbed} from '../../utils/embeds.js';
export const command:Command={data:new SlashCommandBuilder().setName('applications').setDescription('Summarize or export event applications.')
.addIntegerOption(o=>o.setName('event').setDescription('Event number.').setRequired(true).setMinValue(1))
.addStringOption(o=>o.setName('status').setDescription('Filter applications.').addChoices({name:'Pending',value:'pending'},{name:'Accepted',value:'accepted'},{name:'Denied',value:'rejected'}))
.addBooleanOption(o=>o.setName('export').setDescription('Download all matching records as JSON.')),
async execute(i){const event=sqlite.prepare('SELECT id,title FROM events WHERE guild_id=? AND event_number=?').get(i.guildId,i.options.getInteger('event',true)) as {id:number;title:string}|undefined;if(!event){await i.reply({content:'Event not found.',flags:64});return;}
const status=i.options.getString('status');const rows=sqlite.prepare(`SELECT id,discord_id,minecraft_username,status,application_channel_id,created_at FROM event_applications WHERE event_id=? ${status?'AND status=?':''} ORDER BY created_at`).all(...(status?[event.id,status]:[event.id])) as {id:number;discord_id:string;minecraft_username:string;status:string;application_channel_id:string|null}[];
await i.reply({embeds:[glurpsEmbed().setTitle(event.title).setDescription(`${rows.length} matching applications\n\n`+ (rows.slice(0,20).map(r=>`**${r.minecraft_username}** · ${r.status}${r.application_channel_id?` · <#${r.application_channel_id}>`:''}`).join('\n')||'No applications yet.'))],files:i.options.getBoolean('export')?[new AttachmentBuilder(Buffer.from(JSON.stringify(rows,null,2)),{name:`applications-${event.id}.json`})]:[],flags:64,allowedMentions:{parse:[]}});
}};
