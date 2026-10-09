// Adapted from Open Discord's slash-command dispatcher. GPL-3.0-only.
import { PermissionFlagsBits } from 'discord.js';
export function installAdministratorDispatcher(manager:any,client:any) {
 manager.startListeningToInteractions=()=>{
  client.on('interactionCreate',(interaction:any)=>{
   if(!interaction.isChatInputCommand()) return;
   const command=manager.getFiltered((command:any)=>command.name===interaction.commandName)[0];
   if(!command || String(command.id).startsWith('glurps:')) return;
   if(!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    void interaction.reply({content:'Administrator permission is required.',flags:64});return;
   }
   for(const listener of manager.interactionListeners) {
    if(typeof listener.name==='string' && listener.name!==interaction.commandName) continue;
    if(listener.name instanceof RegExp && !listener.name.test(interaction.commandName)) continue;
    listener.callback(interaction,command);
   }
  });
 };
}

export async function calculateAdministratorAccess(user:any,_channel:any,guild:any) {
 const member=await guild?.members.fetch(user.id).catch(()=>null);
 const admin=Boolean(member?.permissions.has(PermissionFlagsBits.Administrator));
 return {type:admin?'admin':'member',level:admin?3:0,scope:admin?'global-user':null,source:null};
}
