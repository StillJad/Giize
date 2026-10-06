import "dotenv/config";
import { REST, Routes } from "discord.js";
import { config } from "./config/config.js";
import { loadCommands } from "./handlers/CommandHandler.js";
import { logger } from "./utils/logger.js";

const commands = await loadCommands();

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify(commands.map(command => command.data.toJSON()), null, 2));
} else {
  logger.info("Open Ticket registers the combined command set during npm start. Use --dry-run to inspect legacy/custom command definitions.");
}
