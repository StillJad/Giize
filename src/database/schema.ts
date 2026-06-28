import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const guildConfigs = sqliteTable("guild_configs", {
  guildId: text("guild_id").primaryKey(),
  welcomeChannelId: text("welcome_channel_id"),
  welcomeImageUrl: text("welcome_image_url"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const buttonRoles = sqliteTable("button_roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  label: text("label").notNull(),
  emoji: text("emoji"),
  roleId: text("role_id").notNull(),
  createdAt: integer("created_at").notNull()
});
