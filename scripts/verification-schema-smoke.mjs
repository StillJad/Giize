import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const directory = mkdtempSync(join(tmpdir(), "giize-verification-smoke-"));
const databasePath = join(directory, "giize.db");
const db = new Database(databasePath);

function columnInfo(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function migrateVerifiedPlayersNullableLegacyUuid() {
  const minecraftUuidColumn = columnInfo("verified_players").find(column => column.name === "minecraft_uuid");
  if (!minecraftUuidColumn?.notnull) return;

  const migrate = db.transaction(() => {
    db.exec(`
      DROP TABLE IF EXISTS verified_players_migration_backup;
      ALTER TABLE verified_players RENAME TO verified_players_migration_backup;

      CREATE TABLE verified_players (
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

      INSERT INTO verified_players (
        guild_id, discord_id, java_username, java_uuid, bedrock_username,
        verified_java_at, verified_bedrock_at, minecraft_uuid, minecraft_username,
        platform, verification_code, verified, verified_at, created_at
      )
      SELECT
        guild_id, discord_id, java_username, java_uuid, bedrock_username,
        verified_java_at, verified_bedrock_at, minecraft_uuid, minecraft_username,
        platform, verification_code, verified, verified_at, created_at
      FROM verified_players_migration_backup;

      DROP TABLE verified_players_migration_backup;
    `);
  });

  migrate();
}

try {
  db.exec(`
    CREATE TABLE verified_players (
      guild_id TEXT,
      discord_id TEXT NOT NULL,
      java_username TEXT,
      java_uuid TEXT,
      bedrock_username TEXT,
      verified_java_at INTEGER,
      verified_bedrock_at INTEGER,
      minecraft_uuid TEXT NOT NULL,
      minecraft_username TEXT,
      platform TEXT,
      verification_code TEXT,
      verified INTEGER DEFAULT 0,
      verified_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `);

  db.prepare(`
    INSERT INTO verified_players (
      guild_id, discord_id, java_username, java_uuid, minecraft_uuid,
      minecraft_username, platform, verified, verified_at, created_at
    )
    VALUES ('guild', 'java-only', 'StillJad', 'java-uuid-1', 'java-uuid-1', 'StillJad', 'java', 1, 1, 1)
  `).run();

  migrateVerifiedPlayersNullableLegacyUuid();

  const minecraftUuidColumn = columnInfo("verified_players").find(column => column.name === "minecraft_uuid");
  if (minecraftUuidColumn?.notnull) throw new Error("minecraft_uuid is still NOT NULL.");

  db.prepare(`
    INSERT INTO verified_players (
      guild_id, discord_id, java_username, java_uuid, bedrock_username,
      verified_java_at, verified_bedrock_at, minecraft_uuid, minecraft_username,
      platform, verified, verified_at, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run("guild", "bedrock-only", null, null, "BedrockUser", null, 2, null, "BedrockUser", "bedrock", 2, 2);

  db.prepare("UPDATE verified_players SET bedrock_username = ?, verified_bedrock_at = ?, minecraft_username = ?, platform = ?, verified_at = ? WHERE guild_id = ? AND discord_id = ?")
    .run("RockAfterJava", 3, "RockAfterJava", "bedrock", 3, "guild", "java-only");

  db.prepare(`
    INSERT INTO verified_players (
      guild_id, discord_id, java_username, java_uuid, bedrock_username,
      verified_java_at, verified_bedrock_at, minecraft_uuid, minecraft_username,
      platform, verified, verified_at, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run("guild", "java-after-bedrock", null, null, "FirstBedrock", null, 4, null, "FirstBedrock", "bedrock", 4, 4);

  db.prepare("UPDATE verified_players SET java_username = ?, java_uuid = ?, verified_java_at = ?, minecraft_uuid = ?, minecraft_username = ?, platform = ?, verified_at = ? WHERE guild_id = ? AND discord_id = ?")
    .run("JavaLater", "java-uuid-2", 5, "java-uuid-2", "JavaLater", "java", 5, "guild", "java-after-bedrock");

  const bedrockOnly = db.prepare("SELECT * FROM verified_players WHERE discord_id = 'bedrock-only'").get();
  const javaOnly = db.prepare("SELECT * FROM verified_players WHERE discord_id = 'java-only'").get();
  const javaAfterBedrock = db.prepare("SELECT * FROM verified_players WHERE discord_id = 'java-after-bedrock'").get();

  if (bedrockOnly.minecraft_uuid !== null) throw new Error("Bedrock-only minecraft_uuid was not null.");
  if (javaOnly.java_uuid !== "java-uuid-1" || javaOnly.bedrock_username !== "RockAfterJava") throw new Error("Java plus Bedrock data was not preserved.");
  if (javaAfterBedrock.java_uuid !== "java-uuid-2" || javaAfterBedrock.bedrock_username !== "FirstBedrock") throw new Error("Java-after-Bedrock data was not preserved.");

  console.log("Verification schema smoke check passed.");
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
