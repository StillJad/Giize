import 'dotenv/config';
import {parse} from 'jsonc-parser';
import {readFileSync,writeFileSync,existsSync,mkdirSync,symlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const engine=resolve(root,'vendor/open-ticket');
const templates=resolve(engine,'config-templates');
const read=name=>parse(readFileSync(resolve(templates,name),'utf8'));
const write=(name,data)=>writeFileSync(resolve(engine,'config',name),JSON.stringify(data,null,2)+'\n');
export function configureEngine(env=process.env) {
 const general=read('general.jsonc');
 general.token='';general.tokenFromENV=true;general.serverId=env.GUILD_ID??'';general.mainColor='#5865F2';general.globalAdmins=[];general.textCommands=false;
 general.status={...general.status,text:'Event Bot'};
 for(const key of Object.keys(general.permissions)) general.permissions[key]='admin';
 general.permissions.help='none';general.permissions.claim='none';general.permissions.unclaim='none';
 general.logs.logMessages.deleting={dm:false,logs:false};general.logs.enabled=Boolean(env.TICKET_LOGS_CHANNEL_ID);general.logs.channel=env.TICKET_LOGS_CHANNEL_ID??'';
 general.ticketSystem.pinFirstTicketMessage=false;general.ticketSystem.enableTicketClaimButtons=false;general.ticketSystem.enableTicketPinButtons=false;general.ticketSystem.closeEmoji="🔒";general.ticketSystem.enableDeleteWithoutTranscript=false;general.ticketSystem.claimedCategories=[];
 general.ticketSystem.closedCategory.enabled=false;general.ticketSystem.backupCategory.enabled=false;
 general.ticketSystem.limits.userMaximum=1;general.ticketSystem.askPriorityOnTicketCreation=false;
 const base=read('options.jsonc').find(option=>option.type==='ticket');
 const options=[['support','Support','🎫'],['report','Player Report','🚨'],['appeal','Appeal','📝']].map(([id,name,emoji])=>{
  const option=structuredClone(base);option.id=id;option.name=name;option.description=`Open a private ${name.toLowerCase()} ticket.`;
  option.button={emoji,label:name,color:'blue'};option.questions=['issue'];option.ticketAdmins=[env.TICKET_STAFF_ROLE_ID??'1557371367241027705'];option.readonlyAdmins=[];
  option.channel.category=env.TICKET_CATEGORY_ID??'';option.channel.prefix='ticket-';option.channel.topic=`Event ${name}`;
  option.dmMessage.enabled=false;option.ticketMessage.embed.title=`${name} Ticket`;option.ticketMessage.embed.description='Describe what happened and include any useful evidence. An administrator will help you here.';
  option.ticketMessage.embed.fields=[];option.ticketMessage.embed.customColor='#5865F2';option.ticketMessage.ping={'@here':false,'@everyone':false,custom:[env.TICKET_STAFF_ROLE_ID??'1557371367241027705']};
  option.autoclose.enableInactiveHours=true;option.autoclose.inactiveHours=48;option.autoclose.disableOnClaim=true;
  option.autodelete.enableInactiveDays=false;option.cooldown.enabled=true;option.cooldown.cooldownMinutes=5;
  return option;
 });
 const panel=read('panels.jsonc')[0];panel.id='support';panel.name='Event Support';panel.options=options.map(o=>o.id);panel.embed.title='Event Support';panel.embed.description='Choose Support, Player Report, or Appeal to open a private ticket.';panel.embed.fields=[];panel.embed.footer='';panel.settings.enableMaxTicketsWarningInText=false;panel.settings.enableMaxTicketsWarningInEmbed=false;panel.settings.describeOptionsInText=false;panel.settings.describeOptionsInEmbedFields=false;panel.settings.describeOptionsInEmbedDescription=false;panel.embed.customColor='#5865F2';
 const question=read('questions.jsonc').find(q=>q.type==='paragraph');question.id='issue';question.name='How can we help?';question.required=true;question.placeholder='Describe your issue or include evidence.';
 const transcripts=read('transcripts.jsonc');transcripts.general.enabled=true;transcripts.general.enableCreatorDM=true;transcripts.general.enableChannel=Boolean(env.TICKET_LOGS_CHANNEL_ID);transcripts.general.channel=env.TICKET_LOGS_CHANNEL_ID??'';transcripts.general.mode='text';transcripts.textTranscriptStyle.layout='detailed';transcripts.textTranscriptStyle.includeFiles=true;transcripts.textTranscriptStyle.includeEmbeds=true;transcripts.embedSettings.customColor='#5865F2';
 const custom=resolve(root,'data/panel-customization.json');
 if(existsSync(custom)) Object.assign(panel.embed,JSON.parse(readFileSync(custom,'utf8')));
 return {general,options,panel,question,transcripts};
}
if(process.argv.includes('--check')) {
 const settings=configureEngine({GUILD_ID:'123',TICKET_CATEGORY_ID:'456',TICKET_LOGS_CHANNEL_ID:'789'});
 if(!settings.options.length || settings.general.textCommands || settings.general.permissions.help!=='none') throw new Error('Invalid integration configuration');
 if(settings.general.ticketSystem.pinFirstTicketMessage || settings.general.ticketSystem.enableTicketClaimButtons || settings.general.ticketSystem.enableTicketPinButtons || settings.panel.settings.describeOptionsInEmbedFields || settings.panel.embed.footer) throw new Error('Ticket simplification configuration failed');
 console.log('Open Ticket integration configuration checked.');
} else {
 for(const key of ['DISCORD_TOKEN','CLIENT_ID','GUILD_ID']) if(!process.env[key]) throw new Error(`Missing ${key}`);
 process.env.GLURPS_ROOT=root;process.env.TOKEN=process.env.DISCORD_TOKEN;
 process.env.DATABASE_PATH=resolve(root,process.env.DATABASE_PATH??'data/glurps.db');
 const settings=configureEngine();
 write('general.jsonc',settings.general);write('options.jsonc',settings.options);write('panels.jsonc',[settings.panel]);write('questions.jsonc',[settings.question]);write('transcripts.jsonc',settings.transcripts);
 const state=resolve(root,'data/openticket');mkdirSync(state,{recursive:true});
 for(const name of ['global','options','states','stats','tickets','users']) {
  const file=resolve(state,`${name}.json`);
  if(!existsSync(file)) writeFileSync(file,'[]\n',{flag:'wx'});
 }
 if(!existsSync(resolve(engine,'database'))) symlinkSync(state,resolve(engine,'database'),'dir');
 process.chdir(engine);
 await import(pathToFileURL(resolve(engine,'dist/src/index.js')).href);
}
