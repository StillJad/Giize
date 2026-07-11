import { Events } from "discord.js";
import { client } from "../client.js";
import { welcomeService } from "../services/welcome/WelcomeService.js";
import { logger } from "../utils/logger.js";

client.on(Events.GuildMemberAdd, async member => {
  try {
    await welcomeService.sendWelcome(member);
  } catch (error) {
    logger.error("Welcome event failed.", error, { type: "event", name: Events.GuildMemberAdd });
  }
});
