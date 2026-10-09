import { REST, Routes } from 'discord.js';
import { config } from '../dist/config/config.js';
import { sqlite } from '../dist/database/database.js';
const rest = new REST({version:'10'}).setToken(config.token);
const saved = sqlite.prepare('SELECT channel_id FROM welcome_configs WHERE guild_id=?').get(config.guildId);
const channels = [...new Set([saved?.channel_id,config.welcomeChannelId].filter(Boolean))];
let scanned=0,updated=0;
try {
 for(const channel of channels){
  let before;
  while(true){
   const query=new URLSearchParams({limit:'100'});if(before)query.set('before',before);
   const messages=await rest.get(Routes.channelMessages(channel),{query});
   if(!messages.length)break;
   for(const message of messages){
    scanned++;
    if(message.author.id!==config.clientId)continue;
    if(!message.embeds?.some(e=>/welcome/i.test(e.title??'') && /event bot/i.test(e.description??'')))continue;
    const embeds=message.embeds.map(e=>{
     const copy={...e};delete copy.type;delete copy.provider;delete copy.video;
     if(/welcome/i.test(copy.title??''))copy.description=copy.description?.replace(/Welcome to Event Bot!/gi,'Welcome to **Glurps**! Glad to have you here.').replace(/Event Bot/gi,'Glurps');
     return copy;
    });
    await rest.patch(Routes.channelMessage(channel,message.id),{body:{embeds,allowed_mentions:{parse:[]}}});updated++;
   }
   before=messages.at(-1).id;
  }
 }
 console.log(JSON.stringify({channels:channels.length,scanned,updated}));
}finally{sqlite.close();}
