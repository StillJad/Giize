import "dotenv/config";
import { Events } from "discord.js";
import { client } from "./client.js";
import { config } from "./config/config.js";
import { sqlite } from "./database/database.js";
import "./handlers/AuditLogHandler.js";
import "./handlers/AutoModHandler.js";
import { loadCommands } from "./handlers/CommandHandler.js";
import "./handlers/ButtonHandler.js";
import "./handlers/ModalHandler.js";
import "./handlers/SelectMenuHandler.js";
import "./handlers/WelcomeHandler.js";
import { levelService } from "./services/community/LevelService.js";
import { autoModService } from "./services/automod/AutoModService.js";
import { reminderService } from "./services/events/ReminderService.js";
import { logger } from "./utils/logger.js";

const required = ["DISCORD_TOKEN", "CLIENT_ID", "GUILD_ID"] as const;
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}. Fill in .env before starting.`);

const commands = await loadCommands();
if ((globalThis as { __glurpsClient?: unknown }).__glurpsClient) { commands.delete("ticket"); commands.delete("ticketpanel"); }
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Stopping Glurps Bot.");
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  reminderService.stop();
  try {
    client.destroy();
    sqlite.close();
  } finally {
    clearTimeout(timeout);
  }
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

logger.info("✓ Connected to database");
logger.info("✓ Loaded configuration");
logger.info(`✓ Loaded commands (${commands.size})`);
logger.info("✓ Loaded events");
logger.info("✓ Loaded buttons");
logger.info("✓ Loaded modals");
logger.info("✓ Loaded AutoMod");

const onReady = (ready: typeof client) => {
  logger.info(`✓ Logged in as ${ready.user?.tag ?? "Glurps Bot"}`);
  autoModService.initializeForGuild(config.guildId);
  void ready.guilds.fetch(config.guildId).then(guild => levelService.prepareReward(guild)).catch(error => logger.warn("Level reward setup needs attention.", error));
  reminderService.start(client);
};
if (client.isReady()) onReady(client);
else client.once(Events.ClientReady, onReady);

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

try {
  if (!client.isReady()) await client.login(config.token);
} catch (error) {
  await shutdown();
  throw error;
}
