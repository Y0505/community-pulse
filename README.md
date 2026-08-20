# CommunityPulse

> AI-ready Discord community intelligence and automation bot.

CommunityPulse helps Discord server owners onboard new members, answer common questions, and understand what is happening in their community — so they can focus on building, not moderating.

---

## Why CommunityPulse Exists

Most Discord bots are either too generic or too complex. CommunityPulse takes a different approach: it starts with a clean, minimal core and is designed to grow into an AI-powered community intelligence platform.

**Phase 1** (this release) gives you a polished bot core, a beautiful setup wizard, and an automated welcome system — everything you need to make a first impression that counts.

---

## Features

| Feature | Description |
|---|---|
| `/ping` | Health check with gateway latency and uptime display |
| `/server` | Server overview embed with key metadata |
| `/setup` | Multi-step interactive wizard with buttons, select menus, and modals |
| **Welcome system** | Automated welcome messages for new members with community-specific styling |
| **Admin-only configuration** | Setup is restricted to members with Manage Server permissions |
| **Type-safe architecture** | Strict TypeScript throughout — no `any`, no shortcuts |

---

## Architecture

```
src/
├── commands/          # Slash command modules
│   ├── ping.ts
│   ├── server.ts
│   └── setup.ts
├── events/            # Discord event handlers
│   ├── ready.ts
│   ├── interactionCreate.ts
│   └── guildMemberAdd.ts
├── config/
│   └── env.ts         # Environment validation
├── utils/
│   └── logger.ts      # Structured logging
├── types/
│   └── index.ts       # Shared types and in-memory stores
├── deploy-commands.ts # Registers commands with Discord API
└── index.ts           # Entry point
```

**Design principles:**

- Each command and event lives in its own module.
- No business logic in `index.ts`.
- Types are shared through a central `types/` directory.
- Environment variables are validated at startup — the bot will not start with missing secrets.
- Errors are caught, logged, and surfaced to the user without exposing internal details.

---

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript (strict mode)
- **Discord library:** discord.js v14
- **Environment:** dotenv
- **Linting:** ESLint (flat config)
- **Formatting:** Prettier
- **Module system:** ESM

---

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/community-pulse.git
cd community-pulse

# Install dependencies
npm install

# Copy the environment template
cp .env.example .env

# Fill in your Discord credentials (see below)
# Then register commands and start the bot
```

---

## Discord Developer Portal Setup

### 1. Create an Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications).
2. Click **New Application** and give it a name (e.g. "CommunityPulse").
3. Navigate to **Bot** in the sidebar.

### 2. Configure the Bot

1. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent** — needed to detect new members for the welcome system.
   - **Message Content Intent** — reserved for future AI-powered features.
2. Copy the **Bot Token** — this is your `DISCORD_TOKEN`.

### 3. Get Client and Guild IDs

1. Your **Application ID** (on the General Information page) is your `DISCORD_CLIENT_ID`.
2. For development, enable **Developer Mode** in Discord (Settings → Advanced), then right-click your test server → **Copy Server ID** → this is your `DISCORD_GUILD_ID`.

### 4. Required Bot Intents

| Intent | Required | Reason |
|---|---|---|
| `Guilds` | ✅ | Core functionality — reading guild data |
| `GuildMembers` | ✅ | Welcome system — detecting new members |
| `GuildMessages` | ✅ | Future message analysis features |
| `MessageContent` | ✅ | Future AI features |

### 5. Required Bot Permissions (when inviting)

The bot needs these permissions — **not Administrator**:

- `Send Messages`
- `Embed Links`
- `Use Slash Commands`
- `Manage Messages` (for future features)

Generate an invite link at **OAuth2 → URL Generator** with the scopes `bot` and `applications.commands`.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Required — your Discord bot token from the Developer Portal
DISCORD_TOKEN=your-bot-token-here

# Required — your Discord application/client ID
DISCORD_CLIENT_ID=your-client-id-here

# Optional — set to register commands to a specific guild (faster for dev)
# Leave empty or remove to register globally
DISCORD_GUILD_ID=your-test-guild-id
```

**Never commit your `.env` file.** It is already in `.gitignore`.

---

## Development Commands

```bash
# Start the bot in development mode (uses tsx for instant startup)
npm run dev

# Type-check without emitting files
npm run check

# Build the TypeScript project
npm run build

# Start from the compiled output
npm start

# Register slash commands with Discord
npm run deploy:commands

# Lint the source code
npm run lint

# Format code with Prettier
npm run format
```

### Recommended workflow

1. `cp .env.example .env` and fill in your credentials.
2. `npm run deploy:commands` — register commands to your test guild.
3. `npm run dev` — start the bot.
4. Open Discord and type `/ping`, `/server`, or `/setup` to test.

---

## Deployment

For production:

1. Set `DISCORD_GUILD_ID` to empty (or remove it) so commands register globally.
2. Run `npm run deploy:commands` once — global registration takes up to 60 minutes.
3. Run `npm run build && npm start` on your hosting platform.

CommunityPulse runs anywhere Node.js runs — a VPS, a container, Railway, Fly.io, or a home server.

---

## Security

- Tokens and secrets are **never logged**.
- `.env` is **gitignored** and never committed.
- Environment variables are **validated at startup** — the bot will not start with missing secrets.
- The `/setup` command is restricted to members with **Manage Server** permissions.
- Errors are logged without exposing internal details or credentials.

---

## Roadmap

### Phase 1 — Bot Core *(current)*

- [x] Slash command framework
- [x] `/ping` health check
- [x] `/server` server info
- [x] Interactive `/setup` wizard
- [x] Automated welcome system
- [x] Structured logging
- [x] Error handling

### Phase 2 — Community Intelligence

- [ ] PostgreSQL persistence layer
- [ ] AI-powered Q&A using community knowledge base
- [ ] Unanswered question detection
- [ ] Trending topic analysis
- [ ] Daily community pulse summaries
- [ ] Moderation assistance tools

### Phase 3 — Dashboard & Platform

- [ ] Next.js web dashboard
- [ ] Community analytics and insights
- [ ] AI-powered community health reports
- [ ] SaaS billing and multi-tenant support

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Dependencies

| Package | License | Purpose |
|---|---|---|
| [discord.js](https://www.npmjs.com/package/discord.js) | Apache-2.0 | Discord API wrapper |
| [dotenv](https://www.npmjs.com/package/dotenv) | BSD-2-Clause | Environment variable loading |
| [TypeScript](https://www.npmjs.com/package/typescript) | Apache-2.0 | Type-safe JavaScript |
| [ESLint](https://www.npmjs.com/package/eslint) | MIT | Code linting |
| [Prettier](https://www.npmjs.com/package/prettier) | MIT | Code formatting |
