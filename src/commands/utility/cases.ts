import {SlashCommandBuilder} from 'discord.js';
import type {Command} from '../../types/Command.js';
import {sqlite} from '../../database/database.js';
import {caseService} from '../../services/moderation/CaseService.js';
import {glurpsEmbed} from '../../utils/embeds.js';
type Case={case_id:number;target_id:string;actor_id:string;action:string;reason:string;duration:string|null;created_at:number};
export const command:Command={data:new SlashCommandBuilder().setName('cases').setDescription('View moderation cases and member history.')
 .addSubcommand(s=>s.setName('view').setDescription('View a numbered case.').addIntegerOption(o=>o.setName('id').setDescription('Case number.').setRequired(true).setMinValue(1)))
 .addSubcommand(s=>s.setName('history').setDescription('View the latest 15 cases for a member.').addUserOption(o=>o.setName('user').setDescription('Member.').setRequired(true)))
 .addSubcommand(s=>s.setName('edit').setDescription('Correct a case reason; keeps edit history.').addIntegerOption(o=>o.setName('id').setDescription('Case number.').setRequired(true).setMinValue(1)).addStringOption(o=>o.setName('reason').setDescription('Corrected reason.').setRequired(true).setMaxLength(1000))),
 async execute(i){const guild=i.guildId!;const sub=i.options.getSubcommand();if(sub==='edit'){await i.reply({content:caseService.edit(guild,i.options.getInteger('id',true),i.user.id,i.options.getString('reason',true))?'Case reason updated; edit history retained.':'Case not found.',flags:64});return;}
 const rows=(sub==='view'?sqlite.prepare('SELECT * FROM moderation_cases WHERE guild_id=? AND case_id=?').all(guild,i.options.getInteger('id',true)):sqlite.prepare('SELECT * FROM moderation_cases WHERE guild_id=? AND target_id=? ORDER BY case_id DESC LIMIT 15').all(guild,i.options.getUser('user',true).id)) as Case[];
 await i.reply({embeds:[glurpsEmbed().setTitle('Moderation Cases').setDescription(rows.map(r=>`**#${r.case_id} · ${r.action}**\nMember: <@${r.target_id}> · Admin: <@${r.actor_id}>\n${r.reason.slice(0,170)}${r.duration?` · ${r.duration}`:''}\n<t:${Math.floor(r.created_at/1000)}:f>`).join('\n\n')||'No cases found.')],flags:64,allowedMentions:{parse:[]}});
 }};
