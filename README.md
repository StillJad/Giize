# Giize Bot

Giize Bot is a Discord.js v14 bot for Giize Events communities. It includes Minecraft server utilities, event applications, tickets, welcome messages, Minecraft account verification, AutoMod, audit logs, and a private web dashboard.

## Features

- Event creation, RSVP tracking, participant exports, live embed updates, Going roles, logs, and reminders.
- Simple private ticket channels with plain text transcripts.
- Welcome embeds with placeholders and optional join roles.
- Minecraft Java/Bedrock verification with Java account lookup, confirmation buttons, nickname updates, platform roles, and logs.
- Discord audit logging for messages, members, moderation, roles, channels, threads, voice, invites, and server updates.
- Configurable AutoMod for spam, duplicate messages, mentions, emojis, invites, links, and banned words.
- Minecraft server IP and status commands.
- SQLite persistence for events, participants, welcome settings, tickets, and counters.
- Web dashboard with Discord OAuth, server overview, welcome/ticket/event/AutoMod/logging settings, and bot health.

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

The dashboard runs as `giize-dashboard` and talks to the bot over the private Compose network at `http://giize-bot:3001`. The bot API is not published directly to the host.

Dashboard commands:

```bash
npm run dashboard:dev
npm run dashboard:build
npm run dashboard:start
```

For local OAuth development, use:

```text
http://localhost:3000/api/auth/callback/discord
```

### Nginx Dashboard Example

Create a separate Nginx site for your dashboard domain. Do not overwrite existing Cockpit or VPS configuration.

```nginx
server {
    listen 80;
    server_name dashboard.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dashboard.example.com;

    ssl_certificate /etc/letsencrypt/live/dashboard.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dashboard.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

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
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `DASHBOARD_SESSION_SECRET`
- `DASHBOARD_INTERNAL_SECRET`
- `DASHBOARD_GUILD_ID`
- `NEXT_PUBLIC_DASHBOARD_URL`
- `DASHBOARD_HOST_PORT`
- `DASHBOARD_API_PORT`

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

Verification:

- `/verify`
- `/unverify`

Admin:

- `/moderation`
- `/channel`
- `/purge`
- `/ticketpanel send`

Dashboard:

- Overview
- Welcome
- Verification
- Tickets
- Events
- AutoMod
- Logging
- Members
- Roles
- Nicknames
- Warnings
- Timeouts
- Channels
- Announcements
- Settings
- Bot Health

## Screenshots

Screenshots will be added here:

- Event panel
- Ticket transcript log
- Welcome preview
- Verification confirmation
