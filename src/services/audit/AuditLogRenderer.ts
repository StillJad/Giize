import type { APIEmbedField } from "discord.js";
import { giizeEmbed } from "../../utils/embeds.js";

export class AuditLogRenderer {
  render(title: string, fields: APIEmbedField[]) {
    return giizeEmbed()
      .setTitle(title)
      .addFields(fields.map(field => ({
        ...field,
        value: this.truncate(field.value, 1024),
      })).slice(0, 25));
  }

  truncate(value: string, maxLength = 900) {
    if (!value) return "None";
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
  }
}

export const auditLogRenderer = new AuditLogRenderer();
