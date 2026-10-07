import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { ChannelType, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, VoiceConnectionStatus, NoSubscriberBehavior, StreamType, type AudioPlayer, type AudioResource, type VoiceConnection } from '@discordjs/voice';
import { logger } from '../../utils/logger.js';
const run=promisify(execFile);
export function youtubeLink(input:string) {
 const url=new URL(input); const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:' || !['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(host)) throw new Error('Use a YouTube video or playlist link.');
 if(host==='youtu.be') {const id=url.pathname.slice(1);if(!/^[\w-]{11}$/.test(id)) throw new Error('Invalid YouTube video link.');return `https://www.youtube.com/watch?v=${id}`;}
 const list=url.searchParams.get('list');const video=url.searchParams.get('v')??(/^\/(shorts|live)\//.test(url.pathname)?url.pathname.split('/')[2]:null);
 if(list && /^[\w-]{10,100}$/.test(list)) return `https://www.youtube.com/playlist?list=${list}`;
 if(video && /^[\w-]{11}$/.test(video)) return `https://www.youtube.com/watch?v=${video}`;
 throw new Error('Use a YouTube video or playlist link.');
}
export type Track={url:string;title:string};
export function playlistTracks(data:any):Track[] {
 const entries=data.entries??[data];return entries.filter((e:any)=>e && /^[\w-]{11}$/.test(e.id)).slice(0,100).map((e:any)=>({url:`https://www.youtube.com/watch?v=${e.id}`,title:String(e.title??'YouTube video').slice(0,200)}));
}
type Session={connection:VoiceConnection;player:AudioPlayer;tracks:Track[];index:number;volume:number;loop:'off'|'song'|'playlist';resource?:AudioResource;processes:ChildProcess[];generation:number;stopped:boolean;ready:boolean;notify:(message:string)=>Promise<unknown>};
export class LobbyMusicService {
 private sessions=new Map<string,Session>();private busy=new Set<string>();
 async resolve(link:string) {
  const {stdout}=await run('python3',['-m','yt_dlp','--ignore-config','--no-warnings','--socket-timeout','10','--retries','1','--js-runtimes','node','--flat-playlist','--dump-single-json','--playlist-end','100','--',youtubeLink(link)],{timeout:45000,maxBuffer:4*1024*1024});
  const tracks=playlistTracks(JSON.parse(stdout));if(!tracks.length)throw new Error('No playable videos were found. Use a public YouTube link.');return tracks;
 }
 stop(guildId:string) {
  const s=this.sessions.get(guildId);if(!s)return false;s.stopped=true;s.generation++;this.kill(s);s.player.stop(true);s.connection.destroy();this.sessions.delete(guildId);return true;
 }
 private kill(s:Session) {for(const p of s.processes)p.kill('SIGKILL');s.processes=[];}
 private async next(guildId:string,s:Session,skip=false) {
  if(s.stopped || this.sessions.get(guildId)!==s)return;
  if(skip || s.loop!=='song')s.index++;
  if(s.index>=s.tracks.length){if(s.loop==='playlist')s.index=0;else{this.stop(guildId);return;}}
  try{await this.stream(guildId,s);}catch(error){logger.warn('Lobby music playback failed.',error);this.stop(guildId);await s.notify('Lobby music stopped: YouTube could not stream this video. Try another public link.').catch(()=>{});}
 }
 private async stream(guildId:string,s:Session) {
  const generation=++s.generation;s.ready=false;this.kill(s);
  const source=spawn('python3',['-m','yt_dlp','--ignore-config','--no-warnings','--no-playlist','--socket-timeout','10','--retries','1','--js-runtimes','node','-f','bestaudio/best','-o','-','--',s.tracks[s.index].url],{stdio:['ignore','pipe','pipe']});
  const ffmpeg=spawn('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-f','s16le','-ar','48000','-ac','2','pipe:1'],{stdio:['pipe','pipe','pipe']});
  s.processes=[source,ffmpeg];source.stdout!.pipe(ffmpeg.stdin!);ffmpeg.stdin!.on('error',()=>{});
  let diagnostics='';source.stderr!.on('data',data=>{diagnostics=(diagnostics+data.toString()).slice(-2000);});ffmpeg.stderr!.on('data',()=>{});
  for(const process of s.processes)process.on('error',error=>{if(!s.stopped && s.generation===generation){logger.warn('Music process failed.',error);s.player.stop(true);}});
  const resource=createAudioResource(ffmpeg.stdout!,{inputType:StreamType.Raw,inlineVolume:true});resource.volume!.setVolume(s.volume/100);s.resource=resource;s.player.play(resource);
  try{await entersState(s.player,AudioPlayerStatus.Playing,25000);s.ready=true;}catch{if(!s.stopped && s.generation===generation){logger.warn('YouTube stream did not start.',diagnostics);this.kill(s);}throw new Error('YouTube could not start this video on the VPS. Try another public link.');}
 }
 async execute(interaction:ChatInputCommandInteraction) {
  const guild=interaction.guild!;const action=interaction.options.getSubcommand();
  await interaction.deferReply({flags:64});
  if(this.busy.has(guild.id)){await interaction.editReply('A music action is still starting. Try again in a moment.');return;}
  this.busy.add(guild.id);
  try {
   if(action==='play') {
    const member=await guild.members.fetch(interaction.user.id);const channel=member.voice.channel;
    if(!channel)throw new Error('Join a voice or Stage channel first.');
    const me=await guild.members.fetchMe();const permissions=channel.permissionsFor(me);
    if(!permissions?.has([PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]))throw new Error('I need Connect and Speak permissions in your channel.');
    const tracks=await this.resolve(interaction.options.getString('link',true));this.stop(guild.id);
    const connection=joinVoiceChannel({channelId:channel.id,guildId:guild.id,adapterCreator:guild.voiceAdapterCreator,selfDeaf:true});
    const s:Session={connection,player:createAudioPlayer({behaviors:{noSubscriber:NoSubscriberBehavior.Pause}}),tracks,index:0,volume:25,loop:'playlist',processes:[],generation:0,stopped:false,ready:false,notify:async content=>{const c=interaction.channel;if(c?.isSendable())return c.send({content,allowedMentions:{parse:[]}});}};
    this.sessions.set(guild.id,s);connection.subscribe(s.player);
    connection.on(VoiceConnectionStatus.Disconnected,async()=>{try{await Promise.race([entersState(connection,VoiceConnectionStatus.Signalling,5000),entersState(connection,VoiceConnectionStatus.Connecting,5000)]);}catch{this.stop(guild.id);}});
    s.player.on('error',error=>{logger.warn('Lobby audio player error.',error);this.stop(guild.id);void s.notify('Lobby music stopped after an audio error. Try playing the link again.');});
    s.player.on(AudioPlayerStatus.Idle,()=>{if(!s.stopped && s.ready)void this.next(guild.id,s);});
    try{await entersState(connection,VoiceConnectionStatus.Ready,20000);if(channel.type===ChannelType.GuildStageVoice){await me.voice.setSuppressed(false).catch(()=>{throw new Error('I joined the Stage but need permission to become a speaker.');});}await this.stream(guild.id,s);}catch(error){this.stop(guild.id);throw error;}
    await interaction.editReply({content:`Playing **${tracks[0].title}** in <#${channel.id}>. ${tracks.length} track(s), looping at 25% volume.`,allowedMentions:{parse:[]}});return;
   }
   const s=this.sessions.get(guild.id);if(!s)throw new Error('No lobby music is playing. Use /lobbymusic play first.');
   if(action==='stop'){this.stop(guild.id);await interaction.editReply('Music stopped. Disconnected.');}
   else if(action==='pause'){s.player.pause();await interaction.editReply('Music paused.');}
   else if(action==='resume'){s.player.unpause();await interaction.editReply('Music resumed.');}
   else if(action==='skip'){s.ready=false;s.generation++;this.kill(s);s.player.stop(true);await this.next(guild.id,s,true);await interaction.editReply(s.stopped?'Queue finished.':`Playing **${s.tracks[s.index].title}**.`);}
   else if(action==='volume'){s.volume=interaction.options.getInteger('percent',true);s.resource?.volume?.setVolume(s.volume/100);await interaction.editReply(`Volume: ${s.volume}%.`);}
   else if(action==='loop'){s.loop=interaction.options.getString('mode',true) as Session['loop'];await interaction.editReply(`Loop: ${s.loop}.`);}
   else if(action==='status'){await interaction.editReply({content:`**${s.tracks[s.index].title}**\nTrack ${s.index+1}/${s.tracks.length} · ${s.player.state.status} · volume ${s.volume}% · loop ${s.loop}`,allowedMentions:{parse:[]}});}
  } catch(error) {await interaction.editReply({content:error instanceof Error && !('stderr' in error)?error.message:'YouTube could not read this link. Use a public video or playlist.',allowedMentions:{parse:[]}});}
  finally{this.busy.delete(guild.id);}
 }
}
export const lobbyMusicService=new LobbyMusicService();
