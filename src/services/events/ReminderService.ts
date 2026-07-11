import type { Client } from "discord.js";
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

  private async tick(client: Client) {
    const reminders = eventService.getDueReminders(Date.now());

    for (const reminder of reminders) {
      await eventService.sendReminder(client, reminder.event, reminder.key, reminder.label);
    }
  }
}

export const reminderService = new ReminderService();
