import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'event-panel-'));process.env.DATABASE_PATH=join(dir,'test.db');
const {sqlite}=await import('../dist/database/database.js');const {LevelService,xpForLevel}=await import('../dist/services/community/LevelService.js');const levels=new LevelService();
try {
 levels.settings('g');for(let i=0;i<10;i++)sqlite.prepare('INSERT INTO member_xp(guild_id,user_id,xp) VALUES (?,?,?)').run('g',`user${i}`,100+i*20);
 assert.equal(levels.pages('g'),1);assert.equal(levels.panelPayload('g').components.length,1);
 sqlite.prepare('INSERT INTO member_xp(guild_id,user_id,xp) VALUES (?,?,?)').run('g','eleventh',1000);assert.equal(levels.pages('g'),2);assert.equal(levels.panelPayload('g').components.length,2);
 let reply,update;const interaction={guildId:'g',user:{id:'viewer'},customId:'levels_browse',reply:async p=>reply=p,update:async p=>update=p};
 await levels.button(interaction);assert.equal(reply.flags,64);assert.equal(reply.embeds[0].data.footer.text,'Page 2 of 2');assert(reply.components[0].components[1].data.disabled);
 await levels.button({...interaction,customId:'levels_page:viewer:0'});assert.equal(update.embeds[0].data.footer.text,'Page 1 of 2');assert(update.components[0].components[0].data.disabled);
 update=undefined;await levels.button({...interaction,customId:'levels_page:someoneelse:0'});assert.equal(update,undefined);assert.match(reply.content,/your own/);
 assert.match(JSON.stringify(levels.rank('g','eleventh').data),/Image Perms/);assert.match(JSON.stringify(levels.xpInfo('g').data),/30-second spam cooldown/);assert(!JSON.stringify(levels.panelPayload('g')).includes('Embed Links'));
 let edited=0,deleted=0;levels.registerPanel('g','panel-channel','panel-message');levels.client={channels:{fetch:async()=>({isTextBased:()=>true,messages:{edit:async(_id,p)=>{edited++;assert.equal(p.embeds[0].data.title,'🏆 Live Leaderboard')},delete:async()=>deleted++}})}};
 sqlite.prepare('INSERT INTO level_notices VALUES (?,?,?)').run('notice-channel','notice-message',Date.now()-1);await levels.refreshPanels();assert.equal(edited,1);assert.equal(deleted,1);assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM level_notices').get().count,0);
 levels.changed('g');await levels.refreshPanels();assert.equal(edited,2);
 let permanent,temporary;sqlite.prepare('INSERT INTO level_announcements VALUES (?,?)').run('g','notice-channel');sqlite.prepare('UPDATE member_xp SET xp=? WHERE guild_id=? AND user_id=?').run(xpForLevel(25),'g','eleventh');levels.syncReward=async()=>{};
 const guild={id:'g',channels:{fetch:async()=>({id:'notice-channel',isTextBased:()=>true,send:async p=>{temporary=p;return {id:'new-notice'}}})}};
 await levels.afterAward({guild,channel:{send:async p=>{permanent=p}}},24,'eleventh');assert.match(permanent.content,/level \*\*25\*\*/);assert.match(temporary.embeds[0].data.description,/Image Perms unlocked/);assert(sqlite.prepare('SELECT * FROM level_notices WHERE message_id=?').get('new-notice').expires_at>Date.now());
 console.log('Live panel updates, private pagination, single-page controls, rank progress and dual announcements with persisted deletion passed.');
}finally{levels.stop();sqlite.close();rmSync(dir,{recursive:true,force:true});}
