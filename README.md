# Event Bot v2

A Discord-only bot built on **Open Ticket v4.2.2**, with Event event applications, moderation, AutoMod, and community leveling attached to the same Discord client. No web dashboard. Full Open Ticket source, its GPL license, and attribution are included.

## Features

- Open Ticket support/report/appeal panels: claiming, releasing, reopening, moving, pinning, priorities, participants, limits, cooldowns, statistics, inactivity closing, and transcripts.
- Local HTML transcripts using discord-html-transcripts. Copies are saved in `data/transcripts`; the upstream external transcript service is not used.
- Event application tickets with optional questions and Accept/Deny/Set Pending/Edit Username buttons. Decisions remain editable until the event ends and synchronize participants and Going roles.
- Event ending deletes only its application tickets. Application records and audit history remain.
- Administrator-only slash commands with runtime enforcement, including the Open Ticket commands. Members interact through public panels.
- Public Minecraft verification panel, Java/Bedrock account linking, nicknames, and platform roles.
- AutoMod for spam, repeats, mentions, emojis, invites, blocked words, and optional domain filtering; all configured through `/automod`.
- Numbered moderation cases, member history, reason corrections with edit history, bans, kicks, timeouts, warnings, channel controls, and purge.
- Application summary and JSON export.
- XP, rank, top-ten leaderboard, and an Embed Links role reward at **level 25**, role **1515691359862915162**.

## Setup

Requires Node.js 22.13 or later and the Server Members and Message Content intents.

```sh
npm ci
cp .env.example .env
npm test
npm start
```

Fill in bot credentials and server/role/channel IDs in `.env`. Open Ticket configuration is generated from its retained templates on startup; the bot token stays in the environment. Slash commands are registered by the Open Ticket engine during startup. `npm run deploy` only validates configuration; it does not register the old standalone command set.

Post member-facing panels as an administrator:

- `/panel id:support` — support/report/appeal tickets.
- `/verify-panel channel:...` — Minecraft verification.
- `/levels panel channel:...` — rank and leaderboard buttons.

Administrator controls include `/automod`, `/levels configure`, `/levels set`, `/cases`, `/applications`, `/event`, `/participants`, and Open Ticket's own management commands. `/ticketstaff` remains for existing legacy tickets and application-channel helpers.

## Leveling

Eligible messages earn 20 XP, at most once a minute. Repeated content, bots, webhooks, system messages, threads, support tickets, application tickets, and AutoMod-blocked messages earn no XP. Level thresholds follow `50 * level^2 + 100 * level`.

At level 25, the bot awards role `1515691359862915162`. It adds Embed Links to that role's existing permissions. The bot needs Manage Roles and a position above the reward role. Channel overrides can still prevent embeds. No voice XP or imported Arcane XP is included. The first startup verifies the reward role; assignment failures are logged.

## Data and deployment

All durable state is under `data`: SQLite via `DATABASE_PATH`, Open Ticket JSON state in `data/openticket`, and transcript archives in `data/transcripts`. Back up this directory. To keep the existing bot's records, use `DATABASE_PATH=data/giize.db` with a backed-up copy of that database.

```sh
docker compose build
docker compose up -d
```

Stop the previous bot before starting the replacement with the same token. This is one Discord connection, shared by the Open Ticket engine and the Event plugin.

The old dashboard service is absent from this Compose project. If it also serves a public website, preserve that website separately before removing its old service.

## Verification status

Local TypeScript builds and automated workflow checks cover application decisions, optional answers, participant synchronization, event-end cleanup, AutoMod activation/filters, XP cooldowns, role permission configuration, case edits, and native/custom command isolation. Docker and live Discord checks still need the deployment host. Passing these checks is not a claim of a completed live Discord test.

## Source

See `THIRD_PARTY.md` and `vendor/open-ticket/UPSTREAM.md` for upstream versions and custom changes. This distribution is GPL-3.0-only, with dependencies retaining their own licenses.

Update: normal messages up to 40 words earn 20 XP; messages under 3 seconds apart or repeats trigger a 30-second XP penalty. Images add 10 XP and replies add 5 XP. Receiving a new reaction adds 5 XP at most once per 30 seconds; self-reactions and repeat reactions do not count. Use `/level [user]`, `/leaderboard`, and `/panel-edit channel message [title] [description]`. Milestone roles start at 1 then every five levels through 100. Only the highest milestone role is retained; the level-25 Embed Links reward is separate. Event applications do not require verification.
