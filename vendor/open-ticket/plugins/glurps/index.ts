import { api, opendiscord } from '#opendiscord';
import { PermissionFlagsBits, ApplicationCommandType, ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { installAdministratorDispatcher, calculateAdministratorAccess } from './policy.js';
const glurpsRoot=process.env.GLURPS_ROOT!;
let glurpsCommands:any;
(globalThis as any).__eventEngine=opendiscord;
opendiscord.permissions.setCalculation(calculateAdministratorAccess as api.ODPermissionCalculationCallback);
opendiscord.events.get('onClientReady').listen(async manager=>{
  (globalThis as any).__glurpsClient=manager.client;
  const commandsModule=await import(pathToFileURL(resolve(glurpsRoot,'dist/handlers/CommandHandler.js')).href);
  glurpsCommands=await commandsModule.loadCommands();
  for(const name of ['ticket','ticketpanel']) glurpsCommands.delete(name);
  await import(pathToFileURL(resolve(glurpsRoot,'dist/index.js')).href);
});
opendiscord.events.get('afterSlashCommandsLoaded').listen(manager=>{
  for(const command of manager.getAll()) {
    command.builder.defaultMemberPermissions=PermissionFlagsBits.Administrator;
    command.builder.dmPermission=false;
    command.builder.contexts=[InteractionContextType.Guild];
  }
  for(const command of glurpsCommands.values()) {
    const json=command.data.toJSON();
    manager.add(new api.ODSlashCommand(`glurps:${json.name}`,{
      type:ApplicationCommandType.ChatInput,name:json.name,description:json.description,options:json.options,
      defaultMemberPermissions:PermissionFlagsBits.Administrator,dmPermission:false,
      contexts:[InteractionContextType.Guild],integrationTypes:[ApplicationIntegrationType.GuildInstall],
    } as api.ODSlashCommandBuilder));
  }
  installAdministratorDispatcher(manager,opendiscord.client.client);
});
opendiscord.events.get('afterSlashCommandsRegistered').listen(async manager=>{
  const allowed=new Set(manager.getAll().map(command=>command.name));
  const registered=await opendiscord.client.client.application!.commands.fetch();
  for(const command of registered.values()) if(command.type===ApplicationCommandType.ChatInput && !allowed.has(command.name)) await command.delete();
});
