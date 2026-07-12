type TrackedMessage = {
  content: string;
  createdAt: number;
};

export class AutoModTracker {
  private readonly messages = new Map<string, TrackedMessage[]>();
  private readonly deletedMessageIds = new Map<string, number>();

  trackMessage(guildId: string, userId: string, normalizedContent: string, createdAt = Date.now()) {
    const key = this.messageKey(guildId, userId);
    const messages = (this.messages.get(key) ?? [])
      .filter(message => createdAt - message.createdAt <= 20_000);

    messages.push({ content: normalizedContent, createdAt });
    this.messages.set(key, messages);

    return messages;
  }

  markAutoModDelete(messageId: string) {
    this.deletedMessageIds.set(messageId, Date.now() + 15_000);
  }

  wasAutoModDelete(messageId: string) {
    this.cleanupDeletedMessages();
    return this.deletedMessageIds.delete(messageId);
  }

  cleanup() {
    const now = Date.now();

    for (const [key, messages] of this.messages.entries()) {
      const freshMessages = messages.filter(message => now - message.createdAt <= 20_000);

      if (freshMessages.length > 0) {
        this.messages.set(key, freshMessages);
      } else {
        this.messages.delete(key);
      }
    }

    this.cleanupDeletedMessages();
  }

  private cleanupDeletedMessages() {
    const now = Date.now();

    for (const [messageId, expiresAt] of this.deletedMessageIds.entries()) {
      if (expiresAt <= now) {
        this.deletedMessageIds.delete(messageId);
      }
    }
  }

  private messageKey(guildId: string, userId: string) {
    return `${guildId}:${userId}`;
  }
}

export const autoModTracker = new AutoModTracker();
