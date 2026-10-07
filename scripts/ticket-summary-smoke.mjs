import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'event-ticket-'));
process.env.GLURPS_ROOT=resolve('.');process.env.DATABASE_PATH=join(dir,'test.db');
const {ticketRecord,recordClosure,closureEmbed,duration}=await import('../vendor/open-ticket/dist/plugins/glurps/ticket-summary.js');
const {sqlite}=await import('../dist/database/database.js');
try {
 const first=await ticketRecord('channel');assert.equal((await ticketRecord('channel')).number,first.number);assert.equal((await ticketRecord('other')).number,first.number+1);
 const now=Date.now();const data={'opendiscord:opened-on':now-8000,'opendiscord:opened-by':'creator','opendiscord:closed-on':now,'opendiscord:closed-by':'closer','opendiscord:answers':[{value:'Please help me.'}],'opendiscord:priority':2};
 const ticket={get:key=>({value:data[key]}),option:{get:()=>({value:'Support'})}};
 await recordClosure('channel','closer','Solved');
 const dm=(await closureEmbed(ticket,{id:'channel',name:'ticket-test'},{id:'deleter'},false)).toJSON();
 assert.equal(dm.title,'Ticket Closed');assert.equal(dm.fields.find(f=>f.name==='Closed By').value,'<@closer>');assert.equal(dm.fields.find(f=>f.name==='Reason').value,'Solved');assert.equal(dm.fields.length,4);
 const log=(await closureEmbed(ticket,{id:'channel',name:'ticket-test'},{id:'deleter'},true)).toJSON();assert.equal(log.fields.find(f=>f.name==='Priority').value,'Normal');assert.equal(log.fields.find(f=>f.name==='Opening Reason').value,'Please help me.');assert.equal(log.fields.find(f=>f.name==='Closer ID').value,'closer');assert.equal(log.footer.text,'Event Bot');assert.equal(duration(7476000),'2h 4m 36s');
 console.log('Ticket numbering, preserved closer/reason, DM and log fields, priority and duration passed.');
} finally {sqlite.close();rmSync(dir,{recursive:true,force:true});}
