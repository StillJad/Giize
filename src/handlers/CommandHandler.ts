import { Collection } from "discord.js";
import fg from "fast-glob";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Command } from "../types/Command.js";

export async function loadCommands() {
  const commands = new Collection<string, Command>();
  const currentFile = fileURLToPath(import.meta.url);
  const currentDirectory = path.dirname(currentFile);
  const extension = path.extname(currentFile) === ".ts" ? "ts" : "js";
  const commandsDirectory = path.resolve(currentDirectory, "../commands");
  const files = await fg(`**/*.${extension}`, {
    absolute: true,
    cwd: commandsDirectory,
    ignore: ["**/*.d.ts", "**/*.map"],
    onlyFiles: true,
  });

  for (const file of files) {
    const mod = await import(pathToFileURL(file).href);
    const command = mod.command as Command | undefined;

    if (!command?.data?.name || !command.execute) continue;
    commands.set(command.data.name, command);
  }

  return commands;
}
