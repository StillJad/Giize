# Glurps Bot

Glurps Bot is a Discord.js v14 bot for Glurps Events communities. It includes Minecraft server utilities, event applications, tickets, welcome messages, Minecraft account verification, AutoMod, audit logs, and a private web dashboard.

## Features

- Event creation, RSVP tracking, participant exports, live embed updates, Going roles, logs, and reminders.
- Simple private ticket channels with plain text transcripts.
- Welcome embeds with placeholders and optional join roles.
- Minecraft Java/Bedrock verification with Java account lookup, confirmation buttons, nickname updates, platform roles, and logs.
- Discord audit logging for messages, members, moderation, roles, channels, threads, voice, invites, and server updates.
- Configurable AutoMod for spam, duplicate messages, mentions, emojis, invites, links, and banned words.
- Minecraft server IP and status commands.
- SQLite persistence for events, participants, welcome settings, tickets, and counters.
- Public Glurps.net landing page plus a private web dashboard with Discord OAuth, server overview, welcome/ticket/event/AutoMod/logging settings, and bot health.

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

The dashboard/web service runs as `giize-dashboard` and talks to the bot over the private Compose network at `http://giize-bot:3001`. The bot API is not published directly to the host.

The same Next.js service serves:

- `https://glurps.net` as the public landing page.
- `https://dashboard.glurps.net` as the authenticated dashboard.

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

### Nginx Glurps.net Example

Create a separate Nginx site for Glurps.net and the dashboard subdomain. Do not overwrite existing Cockpit or VPS configuration. A ready-to-copy example lives at `nginx/glurps.example.conf`.

```nginx
server {
    listen 80;
    server_name www.glurps.net;
    return 301 https://glurps.net$request_uri;
}

server {
    listen 80;
    server_name glurps.net dashboard.glurps.net;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name glurps.net;

    ssl_certificate /etc/letsencrypt/live/glurps.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/glurps.net/privkey.pem;

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

DNS note: the current notes say `glurps.net` and wildcard subdomains point to `162.213.198.42`, while the current Glurps VPS public IPv4 is `85.190.101.48`. Point the website DNS to the VPS that actually hosts the dashboard before enabling HTTPS/Nginx. Do not change the Minecraft SRV record unless you intentionally move the Minecraft service.

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
- `ANNOUNCEMENTS_CHANNEL_ID`
- `SERVER_IP`
- `SERVER_PORT`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `DASHBOARD_SESSION_SECRET`
- `DASHBOARD_INTERNAL_SECRET`
- `DASHBOARD_GUILD_ID`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_DASHBOARD_URL`
- `NEXT_PUBLIC_DISCORD_INVITE_URL`
- `NEXT_PUBLIC_MINECRAFT_ADDRESS`
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
- `/events list`
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
