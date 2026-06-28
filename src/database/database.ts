import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const sqlite = new Database("data/giize.db");

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
  discord_id TEXT PRIMARY KEY,
  minecraft_uuid TEXT NOT NULL,
  minecraft_username TEXT NOT NULL,
  platform TEXT NOT NULL,
  verification_code TEXT,
  verified INTEGER DEFAULT 0,
  verified_at INTEGER,
  created_at INTEGER NOT NULL
);
`);

export const db = drizzle(sqlite);