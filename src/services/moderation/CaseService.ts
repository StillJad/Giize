import {sqlite} from '../../database/database.js';
sqlite.exec(`CREATE TABLE IF NOT EXISTS moderation_cases (guild_id TEXT NOT NULL,case_id INTEGER NOT NULL,target_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,duration TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(guild_id,case_id));
CREATE TABLE IF NOT EXISTS moderation_case_edits (id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,case_id INTEGER NOT NULL,actor_id TEXT NOT NULL,old_reason TEXT NOT NULL,new_reason TEXT NOT NULL,created_at INTEGER NOT NULL);`);
export class CaseService {
 record(guild:string,target:string,actor:string,action:string,reason:string,duration:string|null=null) {
  return sqlite.transaction(()=>{const id=(sqlite.prepare('SELECT COALESCE(MAX(case_id),0)+1 AS next FROM moderation_cases WHERE guild_id=?').get(guild) as {next:number}).next;
  sqlite.prepare('INSERT INTO moderation_cases VALUES (?,?,?,?,?,?,?,?)').run(guild,id,target,actor,action,reason,duration,Date.now());return id;})();
 }
 edit(guild:string,id:number,actor:string,reason:string){return sqlite.transaction(()=>{const row=sqlite.prepare('SELECT reason FROM moderation_cases WHERE guild_id=? AND case_id=?').get(guild,id) as {reason:string}|undefined;if(!row)return false;sqlite.prepare('INSERT INTO moderation_case_edits(guild_id,case_id,actor_id,old_reason,new_reason,created_at) VALUES (?,?,?,?,?,?)').run(guild,id,actor,row.reason,reason,Date.now());sqlite.prepare('UPDATE moderation_cases SET reason=? WHERE guild_id=? AND case_id=?').run(reason,guild,id);return true;})();}
}
export const caseService=new CaseService();
