import { Events } from "discord.js";
import { client } from "../client.js";
import { autoModService } from "../services/automod/AutoModService.js";
import { autoModTracker } from "../services/automod/AutoModTracker.js";
import { logger } from "../utils/logger.js";

client.on(Events.MessageCreate, async message => {
  try {
    await autoModService.handleMessage(message);
  } catch (error) {
    logger.error("AutoMod message handler failed.", error, { type: "event", name: Events.MessageCreate });
  }
});

setInterval(() => {
  autoModTracker.cleanup();
}, 60_000).unref();
