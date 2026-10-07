import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/Command.js';
import { lobbyMusicService } from '../../services/music/LobbyMusicService.js';
export const command:Command={
 data:new SlashCommandBuilder().setName('lobbymusic').setDescription('Play lobby music in your voice or Stage channel.')
 .addSubcommand(s=>s.setName('play').setDescription('Play a YouTube video or playlist.').addStringOption(o=>o.setName('link').setDescription('Public YouTube video or playlist URL.').setRequired(true).setMaxLength(500)))
 .addSubcommand(s=>s.setName('pause').setDescription('Pause the music.'))
 .addSubcommand(s=>s.setName('resume').setDescription('Resume the music.'))
 .addSubcommand(s=>s.setName('skip').setDescription('Skip the current song.'))
 .addSubcommand(s=>s.setName('stop').setDescription('Stop music and disconnect.'))
 .addSubcommand(s=>s.setName('status').setDescription('Show the current song and playback settings.'))
 .addSubcommand(s=>s.setName('volume').setDescription('Change volume.').addIntegerOption(o=>o.setName('percent').setDescription('Volume from 0 to 100.').setMinValue(0).setMaxValue(100).setRequired(true)))
 .addSubcommand(s=>s.setName('loop').setDescription('Set repeat mode.').addStringOption(o=>o.setName('mode').setDescription('What to repeat.').setRequired(true).addChoices({name:'Off',value:'off'},{name:'Current song',value:'song'},{name:'Playlist',value:'playlist'}))),
 execute:interaction=>lobbyMusicService.execute(interaction),
};
