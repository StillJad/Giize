import "dotenv/config";
import { Events } from "discord.js";
import { client } from "./client.js";
import { config } from "./config/config.js";
import { loadCommands } from "./handlers/CommandHandler.js";

const commands = await loadCommands();

client.once(Events.ClientReady, ready => {
  console.log(`✅ Logged in as ${ready.user.tag}`);
  console.log(`✅ Loaded ${commands.size} commands`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const msg = "❌ Command failed.";
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(msg).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

await client.login(config.token);
