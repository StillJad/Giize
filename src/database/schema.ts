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

export const verifiedPlayers = sqliteTable("verified_players", {
  discordId: text("discord_id").primaryKey(),

  minecraftUuid: text("minecraft_uuid").notNull(),

  minecraftUsername: text("minecraft_username").notNull(),

  platform: text("platform").notNull(),

  verificationCode: text("verification_code"),

  verified: integer("verified").default(0),

  verifiedAt: integer("verified_at"),

  createdAt: integer("created_at").notNull()
});