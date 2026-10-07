import { Events } from "discord.js";
import { levelService } from "../services/community/LevelService.js";
import { client } from "../client.js";
import { autoModService } from "../services/automod/AutoModService.js";
import { autoModTracker } from "../services/automod/AutoModTracker.js";
import { logger } from "../utils/logger.js";

client.on(Events.MessageCreate, async message => {
  try {
    const blocked = await autoModService.handleMessage(message);
    if (!blocked) await levelService.handleMessage(message);
  } catch (error) {
    logger.error("AutoMod message handler failed.", error, { type: "event", name: Events.MessageCreate });
  }
});

setInterval(() => {
  autoModTracker.cleanup();
}, 60_000).unref();

client.on(Events.MessageReactionAdd,async (reaction,user)=>{try {await levelService.handleReaction(reaction as any,user as any);} catch(error){logger.warn('Reaction XP failed.',error);}});
