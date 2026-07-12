import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export const sqlite = new Database("data/giize.db");

sqlite.exec(`
CREATE TABLE IF NOT EXISTS guild_configs (
  guild_id TEXT PRIMARY KEY,
  welcome_channel_id TEXT,
  welcome_image_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS button_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  label TEXT NOT NULL,
  emoji TEXT,
  role_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verified_players (
  guild_id TEXT,
  discord_id TEXT NOT NULL,
  java_username TEXT,
  java_uuid TEXT,
  bedrock_username TEXT,
  verified_java_at INTEGER,
  verified_bedrock_at INTEGER,
  minecraft_uuid TEXT,
  minecraft_username TEXT,
  platform TEXT,
  verification_code TEXT,
  verified INTEGER DEFAULT 0,
  verified_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS welcome_configs (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  role_id TEXT,
  image_url TEXT,
  thumbnail_url TEXT,
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_counter (
  id INTEGER PRIMARY KEY,
  next_ticket_number INTEGER NOT NULL
);

INSERT OR IGNORE INTO ticket_counter (id, next_ticket_number)
VALUES (1, 1);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_number INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT,
  start_timestamp INTEGER NOT NULL,
  end_timestamp INTEGER NOT NULL,
  max_players INTEGER,
  ping_role TEXT,
  going_role TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS events_guild_event_number_idx
ON events (guild_id, event_number);

CREATE TABLE IF NOT EXISTS event_participants (
  event_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_role_assignments (
  event_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id, role_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_reminders (
  event_id INTEGER NOT NULL,
  reminder_key TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, reminder_key),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
`);

function columnExists(table: string, column: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(existingColumn => existingColumn.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  if (!columnExists(table, column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing("verified_players", "guild_id", "TEXT");
addColumnIfMissing("verified_players", "java_username", "TEXT");
addColumnIfMissing("verified_players", "java_uuid", "TEXT");
addColumnIfMissing("verified_players", "bedrock_username", "TEXT");
addColumnIfMissing("verified_players", "verified_java_at", "INTEGER");
addColumnIfMissing("verified_players", "verified_bedrock_at", "INTEGER");
addColumnIfMissing("events", "going_role", "TEXT");

sqlite.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS verified_players_guild_discord_idx
ON verified_players (guild_id, discord_id);

UPDATE verified_players
SET java_username = COALESCE(java_username, minecraft_username),
    java_uuid = COALESCE(java_uuid, minecraft_uuid),
    verified_java_at = COALESCE(verified_java_at, verified_at)
WHERE platform = 'java' AND minecraft_username IS NOT NULL;

UPDATE verified_players
SET bedrock_username = COALESCE(bedrock_username, minecraft_username),
    verified_bedrock_at = COALESCE(verified_bedrock_at, verified_at)
WHERE platform = 'bedrock' AND minecraft_username IS NOT NULL;
`);

export const db = drizzle(sqlite);
