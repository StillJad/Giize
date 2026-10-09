import assert from 'node:assert/strict';
import {Collection,PermissionsBitField,PermissionFlagsBits} from 'discord.js';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'event-member-'));process.env.DATABASE_PATH=join(dir,'test.db');
const {sqlite}=await import('../dist/database/database.js');const {levelService}=await import('../dist/services/community/LevelService.js');const {loadCommands,publicCommands}=await import('../dist/handlers/CommandHandler.js');
try {
 const commands=await loadCommands();for(const name of publicCommands) assert.equal(commands.get(name).data.toJSON().default_member_permissions,null);
 let reply;await commands.get('level').execute({inGuild:()=>true,memberPermissions:new PermissionsBitField(),guildId:'guild',user:{id:'viewer'},options:{getUser:()=>null},reply:async data=>reply=data});assert.equal(reply.embeds[0].data.title,'Your Rank');
 await commands.get('help').execute({inGuild:()=>true,memberPermissions:new PermissionsBitField(),member:null,reply:async data=>reply=data});assert(!JSON.stringify(reply).includes('/moderation'));
 const base=Date.now();const oldNow=Date.now;Date.now=()=>base;
 const message={id:'image-id',guild:{id:'guild'},member:{},author:{id:'image-user',bot:false},webhookId:null,system:false,content:'',attachments:new Collection([['file',{name:'photo.PNG',contentType:null,url:'https://example.invalid/photo.PNG'}]]),channel:{name:'general',isThread:()=>false},reference:null};
 try {await levelService.handleMessage(message);assert.equal(levelService.get('guild','image-user').xp,30);Date.now=()=>base+15000;await levelService.handleMessage({...message,id:'text-id',content:'A separate message',attachments:new Collection()});assert.equal(levelService.get('guild','image-user').xp,50);Date.now=()=>base+60000;const reaction={partial:false,message};await levelService.handleReaction(reaction,{id:'reactor',bot:false});assert.equal(levelService.get('guild','image-user').xp,55);assert.equal(levelService.get('guild','reactor').xp,5);await levelService.handleReaction(reaction,{id:'reactor',bot:false});assert.equal(levelService.get('guild','reactor').xp,5);}finally{Date.now=oldNow;}
 const {eventService}=await import('../dist/services/events/EventService.js');let captured;const oldCreate=eventService.create;eventService.create=async(_i,input)=>captured=input;
 const current={id:'current-channel'};await commands.get('event').execute({inGuild:()=>true,memberPermissions:new PermissionsBitField(PermissionFlagsBits.Administrator),channel:current,options:{getSubcommand:()=> 'create',getString:()=>null,getInteger:()=>null,getRole:()=>null,getBoolean:()=>null,getChannel:()=>null}});assert.equal(captured.channel,current);eventService.create=oldCreate;
 console.log('Public command access/help, standalone image XP, bilateral reaction XP, duplicate prevention and event channel fallback passed.');
}finally{sqlite.close();rmSync(dir,{recursive:true,force:true});}
