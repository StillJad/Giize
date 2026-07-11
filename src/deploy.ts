import "dotenv/config";
import { REST, Routes } from "discord.js";
import { config } from "./config/config.js";
import { loadCommands } from "./handlers/CommandHandler.js";
import { logger } from "./utils/logger.js";

const commands = await loadCommands();

const rest = new REST({ version: "10" }).setToken(config.token);

await rest.put(
  Routes.applicationGuildCommands(config.clientId, config.guildId),
  { body: commands.map(command => command.data.toJSON()) }
);

logger.info(`✓ Deployed ${commands.size} slash commands`);
