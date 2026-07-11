type LogContext = {
  name?: string;
  type?: string;
};

class Logger {
  info(message: string) {
    console.log(`${this.timestamp()} ${message}`);
  }

  warn(message: string, error?: unknown) {
    console.warn(`${this.timestamp()} ${message}`);
    if (error) console.warn(this.formatError(error));
  }

  error(message: string, error: unknown, context?: LogContext) {
    const details = [
      `${this.timestamp()} ${message}`,
      context?.type ? `type=${context.type}` : "",
      context?.name ? `name=${context.name}` : "",
    ].filter(Boolean).join(" ");

    console.error(details);
    console.error(this.formatError(error));
  }

  private timestamp() {
    return `[${new Date().toISOString()}]`;
  }

  private formatError(error: unknown) {
    return error instanceof Error ? error.stack ?? error.message : String(error);
  }
}

export const logger = new Logger();
