import type { Client } from "discord.js";
import { logger } from "../../utils/logger.js";
import { eventService } from "./EventService.js";

export class ReminderService {
  private interval: NodeJS.Timeout | undefined;

  start(client: Client) {
    if (this.interval) return;

    void this.tick(client);
    this.interval = setInterval(() => {
      void this.tick(client);
    }, 60_000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
  }

  private async tick(client: Client) {
    try {
    const reminders = eventService.getDueReminders(Date.now());

    for (const reminder of reminders) {
      await eventService.sendReminder(client, reminder.event, reminder.key, reminder.label);
    }
    } catch (error) {
      logger.error("Event reminder failed.", error);
    }
  }
}

export const reminderService = new ReminderService();
