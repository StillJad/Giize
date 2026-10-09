import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {PermissionsBitField,PermissionFlagsBits} from 'discord.js';
const dir=mkdtempSync(join(tmpdir(),'event-admin-verify-'));process.env.DATABASE_PATH=join(dir,'test.db');process.env.VERIFICATION_LOGS_CHANNEL_ID='';
const {sqlite}=await import('../dist/database/database.js');const {loadCommands}=await import('../dist/handlers/CommandHandler.js');const {verificationService}=await import('../dist/services/verification/VerificationService.js');
try{
 const commands=await loadCommands();const verify=commands.get('verify').data.toJSON();assert.equal(verify.default_member_permissions,null);assert(!verify.options.some(o=>o.type===6));
 for(const name of ['forceverify','unverify','verification']){let reply;const cmd=commands.get(name);assert.equal(cmd.data.toJSON().default_member_permissions,PermissionFlagsBits.Administrator.toString());await cmd.execute({inGuild:()=>true,memberPermissions:new PermissionsBitField(),reply:async p=>reply=p});assert.match(reply.content,/Administrator/);}
 let verified,removed,reply;verificationService.verifyMember=async(...args)=>{verified=args;};verificationService.unverifyMember=async(...args)=>{removed=args;};verificationService.hasActiveEventParticipation=()=>true;
 const member={id:'target',user:{bot:false}};const strings={platform:'bedrock',minecraft_username:'Test Player',reason:'Helped in ticket'};const i={inGuild:()=>true,guildId:'guild',guild:{id:'guild',members:{fetch:async()=>member}},user:{id:'admin'},memberPermissions:new PermissionsBitField(PermissionFlagsBits.Administrator),options:{getUser:()=>({id:'target',bot:false}),getString:n=>strings[n],getBoolean:()=>false},deferReply:async()=>{},editReply:async p=>reply=p};
 await commands.get('forceverify').execute(i);assert.equal(verified[1].id,'target');assert.equal(verified[3],'Test Player');assert.equal(sqlite.prepare("SELECT actor_id FROM moderation_cases WHERE action='forceverify'").get().actor_id,'admin');
 strings.minecraft_username='!!';verified=null;await commands.get('forceverify').execute(i);assert.equal(verified,null);
 await commands.get('unverify').execute(i);assert.equal(removed,undefined);assert.match(reply.content,/force:true/);i.options.getBoolean=()=>true;await commands.get('unverify').execute(i);assert.equal(removed[1].id,'target');assert.equal(sqlite.prepare("SELECT target_id FROM moderation_cases WHERE action='unverify'").get().target_id,'target');
 console.log('Public self-verification, administrator-only assistance, target validation, event guard/override and actor audit passed.');
}finally{sqlite.close();rmSync(dir,{recursive:true,force:true});}
