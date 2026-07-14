import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { PermissionFlagsBits } from "discord.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function commandJson(path) {
  const module = await import(new URL(`../dist/${path}`, import.meta.url));
  return module.command.data.toJSON();
}

const eventCommand = await commandJson("commands/events/event.js");
assert(eventCommand.default_member_permissions === PermissionFlagsBits.Administrator.toString(), "/event is not Administrator-only.");
assert(eventCommand.options.map(option => option.name).join(",") === "create,edit,delete,end", "/event subcommands are wrong.");

const eventsCommand = await commandJson("commands/events/events.js");
assert(eventsCommand.options.map(option => option.name).join(",") === "list", "/events must only contain list.");

const moderationCommand = await commandJson("commands/utility/moderation.js");
const moderationSubcommands = moderationCommand.options.map(option => option.name);
assert(!moderationSubcommands.includes("ban"), "Old /moderation ban is still registered.");
assert(!moderationSubcommands.includes("kick"), "Old /moderation kick is still registered.");
assert(!moderationSubcommands.includes("unban"), "Old /moderation unban is still registered.");
assert(["warn", "warnings", "clear-warning", "clear-warnings", "timeout", "remove-timeout", "nickname"].every(command => moderationSubcommands.includes(command)), "Allowed /moderation subcommands are missing.");

const adminModCommand = await commandJson("commands/utility/adminmod.js");
assert(adminModCommand.default_member_permissions === PermissionFlagsBits.Administrator.toString(), "/adminmod is not Administrator-only.");
assert(adminModCommand.options.map(option => option.name).join(",") === "ban,kick,unban", "/adminmod subcommands are wrong.");

const channelCommand = await commandJson("commands/utility/channel.js");
assert(channelCommand.default_member_permissions === PermissionFlagsBits.Administrator.toString(), "/channel is not Administrator-only.");

const purgeCommand = await commandJson("commands/utility/purge.js");
assert(purgeCommand.default_member_permissions === PermissionFlagsBits.Administrator.toString(), "/purge is not Administrator-only.");

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE events (id INTEGER PRIMARY KEY, guild_id TEXT NOT NULL, status TEXT NOT NULL);
  CREATE TABLE event_participants (event_id INTEGER NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL);
  CREATE TABLE event_applications (event_id INTEGER NOT NULL, discord_id TEXT NOT NULL, status TEXT NOT NULL);
`);

const hasActiveParticipation = db.prepare(`
  SELECT 1
  FROM events e
  WHERE e.guild_id = ?
    AND e.status = 'scheduled'
    AND (
      EXISTS (
        SELECT 1
        FROM event_participants p
        WHERE p.event_id = e.id
          AND p.user_id = ?
          AND p.status = 'going'
      )
      OR EXISTS (
        SELECT 1
        FROM event_applications a
        WHERE a.event_id = e.id
          AND a.discord_id = ?
          AND a.status = 'accepted'
      )
    )
  LIMIT 1
`);

db.prepare("INSERT INTO events VALUES (1, 'guild', 'scheduled'), (2, 'guild', 'ended')").run();
db.prepare("INSERT INTO event_applications VALUES (1, 'user-a', 'accepted'), (2, 'user-b', 'accepted')").run();
db.prepare("INSERT INTO event_participants VALUES (1, 'user-c', 'going'), (2, 'user-d', 'going')").run();
assert(Boolean(hasActiveParticipation.get("guild", "user-a", "user-a")), "Accepted active application did not block unverify.");
assert(Boolean(hasActiveParticipation.get("guild", "user-c", "user-c")), "Active participant did not block unverify.");
assert(!hasActiveParticipation.get("guild", "user-b", "user-b"), "Ended accepted application incorrectly blocked unverify.");
assert(!hasActiveParticipation.get("guild", "user-d", "user-d"), "Ended participant incorrectly blocked unverify.");
db.close();

const eventRendererSource = readFileSync(new URL("../src/services/events/EventRenderer.ts", import.meta.url), "utf8");
assert(eventRendererSource.includes("users.join(\", \")"), "Participants are not comma-space formatted.");
assert(eventRendererSource.includes("No accepted participants yet."), "Empty participant copy is wrong.");

const eventServiceSource = readFileSync(new URL("../src/services/events/EventService.ts", import.meta.url), "utf8");
assert(eventServiceSource.includes("const seen = new Set<string>()"), "Participant duplicate removal is missing.");
assert(eventServiceSource.includes("key = name.toLowerCase()"), "Participant duplicate removal is not case-insensitive.");

console.log("Command regression smoke check passed.");
