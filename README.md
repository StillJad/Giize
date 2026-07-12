# Giize Bot

Giize Bot is a Discord.js v14 bot for Giize Events communities. It includes Minecraft server utilities, event RSVP panels, tickets, welcome messages, and Minecraft account verification.

## Features

- Event creation, RSVP tracking, participant exports, live embed updates, Going roles, logs, and reminders.
- Simple private ticket channels with plain text transcripts.
- Welcome embeds with placeholders and optional join roles.
- Minecraft Java/Bedrock verification with Java account lookup, confirmation buttons, nickname updates, platform roles, and logs.
- Discord audit logging for messages, members, moderation, roles, channels, threads, voice, invites, and server updates.
- Configurable AutoMod for spam, duplicate messages, mentions, emojis, invites, links, banned words, and excessive caps.
- Minecraft server IP and status commands.
- SQLite persistence for events, participants, welcome settings, tickets, and counters.

## Installation

```bash
npm install
cp .env.example .env
npm run build
npm run deploy
npm run dev
```

## Docker Deployment

Build and start the production container:

```bash
docker compose up -d --build
```

Follow logs:

```bash
docker compose logs -f
```

Stop the bot:

```bash
docker compose down
```

The SQLite database is stored in `./data` on the host and mounted to `/app/data` in the container.

## Required Intents

Enable these in the Discord Developer Portal and keep them in the bot client:

- Server Members Intent
- Message Content Intent
- Guilds
- Guild Messages
- Guild Moderation
- Guild Voice States
- Guild Invites

## Required Permissions

Recommended bot permissions:

- View Channels
- Send Messages
- Manage Channels
- Manage Roles
- Manage Nicknames
- Read Message History
- Attach Files
- Embed Links
- Use Slash Commands
- View Audit Log
- Ban Members
- Moderate Members
- Manage Messages

The bot role must be above roles it assigns and above members whose nicknames it changes.

## Environment Variables

Required:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`

Production configuration:

- `STAFF_ROLE_ID`
- `VERIFY_ROLE_ID`
- `JAVA_VERIFIED_ROLE_ID`
- `BEDROCK_VERIFIED_ROLE_ID`
- `TICKET_CATEGORY_ID`
- `TICKET_LOGS_CHANNEL_ID`
- `DIAMOND_SUPPORTER_ROLE_ID`
- `IRON_SUPPORTER_ROLE_ID`
- `DIRT_SUPPORTER_ROLE_ID`
- `EVENT_LOGS_CHANNEL_ID`
- `VERIFICATION_LOG_CHANNEL_ID`
- `AUDIT_LOGS_CHANNEL_ID`
- `WELCOME_CHANNEL_ID`
- `WELCOME_BANNER_URL`
- `WELCOME_ROLE_ID`
- `RULES_CHANNEL_ID`
- `ABOUT_CHANNEL_ID`
- `ROLES_CHANNEL_ID`
- `BEDROCK_CHANNEL_ID`
- `ANNOUNCEMENTS_CHANNEL_ID`
- `IP_CHANNEL_ID`
- `SERVER_IP`
- `SERVER_PORT`

Legacy aliases still supported:

- `VERIFIED_ROLE_ID`
- `MC_HOST`
- `MC_PORT`

## Commands

General:

- `/help`
- `/ping`

Minecraft:

- `/server`
- `/status`

Events:

- `/event create`
- `/event edit`
- `/event delete`
- `/event end`
- `/event list`
- `/participants`

Tickets:

- `/ticket open`
- `/ticketstaff close`
- `/ticketstaff add`
- `/ticketstaff remove`
- `/ticketstaff rename`

Welcome:

- `/welcome setup`
- `/welcome enable`
- `/welcome preview`
- `/welcome disable`
- `/welcome refresh`

Verification:

- `/verify`
- `/unverify`
- `/verification setup`
- `/verification test`

Admin:

- `/setup`
- `/automod status`
- `/automod enable`
- `/automod disable`
- `/automod configure`
- `/automod word add`
- `/automod word remove`
- `/automod word list`
- `/automod domain allow`
- `/automod domain remove`
- `/automod domain list`

## Screenshots

Screenshots will be added here:

- Event panel
- Ticket transcript log
- Welcome preview
- Verification confirmation
