import assert from 'node:assert/strict';
import {youtubeLink,playlistTracks,LobbyMusicService} from '../dist/services/music/LobbyMusicService.js';
import {command} from '../dist/commands/utility/lobbymusic.js';
assert.equal(youtubeLink('https://youtu.be/BaW_jenozKc?si=abc'),'https://www.youtube.com/watch?v=BaW_jenozKc');
assert.equal(youtubeLink('https://www.youtube.com/watch?v=BaW_jenozKc&list=PL1234567890123'),'https://www.youtube.com/playlist?list=PL1234567890123');
for(const link of ['http://youtube.com/watch?v=BaW_jenozKc','https://youtube.com.evil.test/watch?v=BaW_jenozKc','https://127.0.0.1/','https://youtube.com/watch?v=bad'])assert.throws(()=>youtubeLink(link));
assert.deepEqual(playlistTracks({entries:[null,{id:'BaW_jenozKc',title:'Test'},{id:'invalid'}]}),[{url:'https://www.youtube.com/watch?v=BaW_jenozKc',title:'Test'}]);
assert.deepEqual(command.data.toJSON().options.map(o=>o.name),['play','pause','resume','skip','stop','status','volume','loop']);
const service=new LobbyMusicService();let killed=0,stopped=0,destroyed=0,volume;
const session={generation:0,processes:[{kill:()=>killed++}],player:{stop:()=>stopped++,pause:()=>{},unpause:()=>{},state:{status:'playing'}},connection:{destroy:()=>destroyed++},tracks:[{title:'Test'}],index:0,volume:25,loop:'playlist',resource:{volume:{setVolume:v=>volume=v}}};
service.sessions.set('guild',session);
async function action(name,values={}){let reply;await service.execute({guild:{id:'guild'},deferReply:async()=>{},editReply:async r=>{reply=r},options:{getSubcommand:()=>name,getInteger:()=>values.percent,getString:()=>values.mode}});return reply;}
await action('volume',{percent:60});assert.equal(volume,.6);await action('loop',{mode:'off'});assert.equal(session.loop,'off');await action('pause');await action('resume');await action('stop');assert.equal(killed,1);assert.equal(stopped,1);assert.equal(destroyed,1);assert.equal(service.sessions.size,0);assert.match((await action('status')).content,/No lobby music/);
const queue={...session,stopped:false,index:0,loop:'playlist',processes:[],tracks:[{title:'First'},{title:'Second'}]};service.sessions.set('guild',queue);let streams=0;service.stream=async()=>{streams++};await service.next('guild',queue,true);assert.equal(queue.index,1);await service.next('guild',queue,true);assert.equal(queue.index,0);queue.loop='song';await service.next('guild',queue);assert.equal(queue.index,0);queue.loop='off';queue.index=1;await service.next('guild',queue,true);assert.equal(service.sessions.size,0);assert.equal(streams,3);
console.log('YouTube URL restrictions, playlist parsing, music controls and process/connection cleanup passed.');
