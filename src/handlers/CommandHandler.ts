import { Collection } from "discord.js";
import fg from "fast-glob";
import { pathToFileURL } from "node:url";
import type { Command } from "../types/Command.js";

export async function loadCommands() {
  const commands = new Collection<string, Command>();
  const files = await fg("src/commands/**/*.ts");

  for (const file of files) {
    const mod = await import(pathToFileURL(process.cwd() + "/" + file).href);
    const command = mod.command as Command | undefined;

    if (!command?.data?.name || !command.execute) continue;
    commands.set(command.data.name, command);
  }

  return commands;
}
