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
  guildId: text("guild_id"),
  discordId: text("discord_id").primaryKey(),
  javaUsername: text("java_username"),
  javaUuid: text("java_uuid"),
  bedrockUsername: text("bedrock_username"),
  verifiedJavaAt: integer("verified_java_at"),
  verifiedBedrockAt: integer("verified_bedrock_at"),
  minecraftUuid: text("minecraft_uuid"),
  minecraftUsername: text("minecraft_username"),
  platform: text("platform"),
  verificationCode: text("verification_code"),
  verified: integer("verified").default(0),
  verifiedAt: integer("verified_at"),
  createdAt: integer("created_at").notNull()
});

export const welcomeConfigs = sqliteTable("welcome_configs", {
  guildId: text("guild_id").primaryKey(),
  enabled: integer("enabled").notNull().default(1),
  channelId: text("channel_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  roleId: text("role_id"),
  imageUrl: text("image_url"),
  thumbnailUrl: text("thumbnail_url"),
  color: text("color"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const ticketCounter = sqliteTable("ticket_counter", {
  id: integer("id").primaryKey(),
  nextTicketNumber: integer("next_ticket_number").notNull()
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventNumber: integer("event_number").notNull(),
  guildId: text("guild_id").notNull(),
  messageId: text("message_id").notNull(),
  channelId: text("channel_id").notNull(),
  hostId: text("host_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  location: text("location"),
  startTimestamp: integer("start_timestamp").notNull(),
  endTimestamp: integer("end_timestamp").notNull(),
  maxPlayers: integer("max_players"),
  pingRole: text("ping_role"),
  goingRole: text("going_role"),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull()
});

export const eventParticipants = sqliteTable("event_participants", {
  eventId: integer("event_id").notNull(),
  userId: text("user_id").notNull(),
  status: text("status").notNull()
});
