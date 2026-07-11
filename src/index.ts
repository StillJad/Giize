import "dotenv/config";
import { Events } from "discord.js";
import { client } from "./client.js";
import { config } from "./config/config.js";
import "./database/database.js";
import { loadCommands } from "./handlers/CommandHandler.js";
import "./handlers/ButtonHandler.js";
import "./handlers/ModalHandler.js";
import "./handlers/WelcomeHandler.js";
import { reminderService } from "./services/events/ReminderService.js";
import { logger } from "./utils/logger.js";

const commands = await loadCommands();

logger.info("✓ Connected to database");
logger.info("✓ Loaded configuration");
logger.info(`✓ Loaded commands (${commands.size})`);
logger.info("✓ Loaded events");
logger.info("✓ Loaded buttons");
logger.info("✓ Loaded modals");

client.once(Events.ClientReady, ready => {
  logger.info(`✓ Logged in as ${ready.user.tag}`);
  reminderService.start(client);
});

client.on("error", error => {
  logger.error("Discord client error.", error, { type: "client", name: "error" });
});

client.on("shardError", error => {
  logger.error("Discord shard error.", error, { type: "client", name: "shardError" });
});

client.on("warn", warning => {
  logger.warn(`Discord client warning: ${warning}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error("Slash command failed.", error, {
      type: "command",
      name: interaction.commandName,
    });
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply("Something went wrong. Please try again.").catch(() => {});
    } else {
      await interaction.reply({ content: "Something went wrong. Please try again.", flags: 64 }).catch(() => {});
    }
  }
});

await client.login(config.token);
