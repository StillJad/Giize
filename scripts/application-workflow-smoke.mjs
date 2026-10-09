import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = mkdtempSync(join(tmpdir(), 'glurps-app-flow-'));
process.env.DATABASE_PATH = join(directory, 'test.db');
const { sqlite } = await import('../dist/database/database.js');
const { eventService } = await import('../dist/services/events/EventService.js');
const { EventApplicationService } = await import('../dist/services/events/EventApplicationService.js');
const { eventApplicationRenderer } = await import('../dist/services/events/EventApplicationRenderer.js');
try {
  sqlite.prepare(`INSERT INTO events (id,event_number,guild_id,message_id,channel_id,host_id,title,description,start_timestamp,end_timestamp,status,created_at,verify_required)
  VALUES (1,1,'guild','msg','channel','host','Test event','description',0,0,'scheduled',0,0)`).run();
  const event = eventService.getEventById(1);
  const service = new EventApplicationService();
  let modal;
  await service.openModal({ inGuild: () => true, guildId: 'guild', user: {id:'user'}, showModal: async value => { modal=value.toJSON(); } }, 1);
  assert.equal(modal.components.length, 2);
  for (const row of modal.components) assert.equal(row.components[0].required, false);
  const application = service.createApplication({event,discordId:'user',minecraftUsername:'Before',platform:'Java',answerOne:'',answerTwo:'',priority:'Normal',status:'pending',reviewedBy:null});
  const embed = eventApplicationRenderer.renderTicketEmbed(event, application).toJSON();
  assert.equal(embed.fields.filter(field => field.value === 'Not provided').length, 2);
  assert.equal(eventApplicationRenderer.renderReviewComponents(application.id, false)[0].toJSON().components.length, 4);
  service.canReview = () => true;
  const guild={id:'guild', channels:{fetch:async()=>null}, members:{fetch:async()=>null}};
  eventService.updateEventMessage=async()=>{};
  eventService.assignGoingRole=async()=>{};
  const interaction={inGuild:()=>true,guildId:'guild',guild,user:{id:'admin'},member:{},client:{},deferred:true,deferReply:async()=>{},editReply:async()=>{},message:{edit:async()=>{}},channel:null};
  for (const status of ['accepted','rejected','accepted','pending']) {
    await service.review(interaction, application.id, status);
    assert.equal(service.getApplication(application.id).status,status);
    assert.equal(Boolean(sqlite.prepare('SELECT 1 FROM event_participants WHERE event_id=1 AND user_id=?').get('user')),status==='accepted');
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM event_application_audit').get().count,4);
  await service.review(interaction, application.id, 'accepted');
  await service.saveUsername({...interaction, customId:`event_app_username:${application.id}:review-message`, fields:{getTextInputValue:()=> 'UpdatedPlayer'}});
  assert.equal(service.getApplication(application.id).minecraftUsername,'UpdatedPlayer');
  assert.deepEqual(eventService.getParticipantMinecraftNames(1,['user']),['UpdatedPlayer']);
  await service.review(interaction,application.id,'pending');
  sqlite.prepare('UPDATE event_applications SET application_channel_id=? WHERE id=?').run('application-ticket',application.id);
  const removed=[];
  guild.channels.fetch=async id=>({type:0,delete:async()=>removed.push(id)});
  eventService.sendEndedLog=async()=>{};
  await eventService.endByNumber(guild,{},1,'admin');
  assert.deepEqual(removed,['application-ticket']);
  const before=sqlite.prepare('SELECT COUNT(*) AS count FROM event_application_audit').get().count;
  await service.review(interaction,application.id,'accepted');
  assert.equal(service.getApplication(application.id).status,'pending');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM event_application_audit').get().count,before);
  console.log('Optional answers, reversible decisions, participant sync, audit history, and event-end ticket cleanup passed.');
} finally { sqlite.close(); rmSync(directory,{recursive:true,force:true}); }
