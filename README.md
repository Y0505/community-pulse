# CommunityPulse

> AI-powered Discord community intelligence and operations.

CommunityPulse helps community managers understand what is happening inside their Discord server without manually reading thousands of messages. It identifies important discussions, unanswered questions, trending topics, and provides actionable insights — all powered by Google Gemini.

---

## Why CommunityPulse Exists

Community managers often miss critical conversations buried in fast-moving channels. Members ask questions that go unanswered. Trends emerge and fade before anyone notices. CommunityPulse automates this intelligence gathering, giving administrators a clear picture of community health on demand.

---

## Features

| Feature | Description |
|---|---|
| `/ping` | Bot health check with gateway latency and uptime |
| `/server` | Server overview with key metadata |
| `/setup` | Multi-step interactive wizard (buttons, select menus, modals) |
| **Welcome system** | Automated welcome messages for new members |
| `/community-summary` | AI-powered analysis of recent community activity |
| `/unanswered` | Detect questions that members asked but nobody answered |
| `/community-health` | Deterministic health score with AI-generated insights |

---

## Architecture

```
src/
├── commands/                    # Slash command modules
│   ├── ping.ts
│   ├── server.ts
│   ├── setup.ts
│   ├── community-summary.ts
│   ├── unanswered.ts
│   └── community-health.ts
├── events/                      # Discord event handlers
│   ├── ready.ts
│   ├── interactionCreate.ts
│   └── guildMemberAdd.ts
├── services/
│   ├── ai/
│   │   ├── types.ts             # AI response type definitions
│   │   ├── GeminiProvider.ts    # Gemini API integration
│   │   └── AIService.ts         # Public AI interface
│   └── analytics/
│       ├── MessageCollector.ts  # Bounded Discord message fetcher
│       ├── CommunityAnalyzer.ts # Analysis orchestrator
│       └── HealthScorer.ts      # Deterministic health scoring
├── config/
│   └── env.ts                   # Environment validation
├── utils/
│   └── logger.ts                # Structured logging
├── types/
│   └── index.ts                 # Shared types and in-memory stores
├── deploy-commands.ts           # Registers commands with Discord API
└── index.ts                     # Entry point
```

**Design principles:**

- Commands are thin — they validate permissions, defer replies, and format output.
- Business logic lives in services, not command files.
- AI integration is abstracted behind `AIService` — the Gemini provider can be swapped without changing commands.
- Message collection is bounded and privacy-conscious.
- Health scoring is deterministic and transparent.

---

## AI Integration

CommunityPulse uses [Google Gemini](https://ai.google.dev/) through its official SDK (`@google/generative-ai`) for:

- **Topic extraction** — identifying the main discussion themes
- **Question detection** — finding messages that are questions
- **Unanswered question detection** — determining if questions received responses
- **Insight generation** — producing a concise summary of community activity
- **Health explanation** — writing a human-readable assessment of health metrics

The AI is used for analysis only. It never autonomously communicates with community members. All AI-generated responses are reviewed by administrators before any action is taken.

**Data sent to Gemini:**

- Message text (truncated to 300 characters)
- Author display names (not user IDs)
- Channel names
- Timestamps (hour-level)

**Data NOT sent to Gemini:**

- User IDs
- Avatars or profile images
- Email addresses
- Private messages
- Bot tokens or API keys

---

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript (strict mode)
- **Discord library:** discord.js v14
- **AI provider:** Google Gemini (`@google/generative-ai`)
- **Environment:** dotenv
- **Linting:** ESLint (flat config)
- **Formatting:** Prettier
- **Module system:** ESM

---

## Installation

```bash
git clone https://github.com/Y0505/community-pulse.git
cd community-pulse
npm install
cp .env.example .env
```

Fill in your `.env` file (see below), then:

```bash
npm run deploy:commands
npm run dev
```

---

## Discord Developer Portal Setup

### 1. Create an Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications).
2. Click **New Application** and name it (e.g. "CommunityPulse").
3. Navigate to **Bot** in the sidebar.

### 2. Enable Required Intents

Under **Privileged Gateway Intents**, enable:

| Intent | Required | Reason |
|---|---|---|
| Server Members | ✅ | Welcome system, member count for health scoring |
| Message Content | ✅ | Reading messages for community analysis |
| Guild Messages | ✅ | Fetching message history for analysis |

### 3. Required Bot Permissions (when inviting)

- `Send Messages`
- `Embed Links`
- `Use Slash Commands`
- `Read Message History`
- `View Channels`

Generate an invite at **OAuth2 → URL Generator** with scopes `bot` and `applications.commands`.

---

## Environment Variables

```env
# Required
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id

# Optional — guild-specific command registration for development
DISCORD_GUILD_ID=your-test-guild-id

# Required for AI features
GEMINI_API_KEY=your-gemini-api-key

# Optional — analysis period (default: 24, max: 168)
COMMUNITY_ANALYSIS_HOURS=24
```

**Never commit your `.env` file.** It is in `.gitignore`.

---

## Development Commands

```bash
npm run dev              # Start with tsx (hot reload)
npm run build            # Compile TypeScript
npm start                # Run compiled output
npm run deploy:commands  # Register slash commands
npm run check            # Type-check without emitting
npm run lint             # ESLint
npm run format           # Prettier
```

---

## Commands

| Command | Permission | Description |
|---|---|---|
| `/ping` | Everyone | Bot health check |
| `/server` | Everyone | Server information |
| `/setup` | Manage Server | Interactive configuration wizard |
| `/community-summary` | Manage Server | AI community analysis report |
| `/unanswered` | Manage Server | Find unanswered questions |
| `/community-health` | Manage Server | Community health score |

AI commands (`/community-summary`, `/unanswered`, `/community-health`) require `GEMINI_API_KEY` to be configured. If the key is missing, users see a clear configuration message.

---

## Community Health Score

CommunityPulse calculates an internal health score (0-100) using these deterministic metrics:

| Metric | Weight | What it measures |
|---|---|---|
| Engagement | 25% | Message volume relative to community size |
| Response Rate | 30% | Percentage of questions that received answers |
| Question Balance | 20% | Healthy ratio of questions to total messages |
| Activity | 25% | How evenly distributed activity is over time |

**This is an internal CommunityPulse product metric.** It is not scientifically validated. It is designed to give administrators a consistent, interpretable signal about community activity trends.

---

## Deployment

### Railway

1. Connect your GitHub repository at [railway.app](https://railway.app).
2. Add environment variables in the Railway dashboard.
3. Set the start command to `npm start`.
4. Railway will automatically build and deploy.

### Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
```

### Global command registration

Run `npm run deploy:commands` without `DISCORD_GUILD_ID` to register commands globally. Global registration takes up to 60 minutes to propagate.

---

## Security

- Tokens and API keys are **never logged**.
- `.env` is **gitignored**.
- Environment variables are **validated at startup** — the bot won't start with missing Discord credentials.
- AI commands require the Gemini key at runtime, not at startup — the bot starts without it for basic commands.
- Admin commands require Discord **Manage Server** permission, enforced server-side.
- Error messages never expose internal details, tokens, or API keys.

---

## Privacy

CommunityPulse is designed with privacy in mind:

- **No permanent message storage** — messages are collected, analyzed in memory, and discarded.
- **Minimal data to AI** — only message text (truncated), display names, channel names, and timestamps are sent to Gemini.
- **No user IDs sent to AI** — only display names for context.
- **Bounded collection** — maximum 2,000 messages per analysis, capped per channel.
- **Access controls** — only messages from channels the bot can read are collected.
- **No private data** — DMs and private channels are never accessed.

---

## Dependencies

| Package | License | Purpose |
|---|---|---|
| [discord.js](https://www.npmjs.com/package/discord.js) | Apache-2.0 | Discord API wrapper |
| [@google/generative-ai](https://www.npmjs.com/package/@google/generative-ai) | Apache-2.0 | Google Gemini SDK |
| [dotenv](https://www.npmjs.com/package/dotenv) | BSD-2-Clause | Environment variable loading |
| [TypeScript](https://www.npmjs.com/package/typescript) | Apache-2.0 | Type-safe JavaScript |
| [ESLint](https://www.npmjs.com/package/eslint) | MIT | Code linting |
| [Prettier](https://www.npmjs.com/package/prettier) | MIT | Code formatting |

Third-party dependencies remain subject to their respective licenses. Use them according to their license terms.

---

## Roadmap

### Phase 1 — Bot Core & Intelligence *(current)*

- [x] Slash command framework
- [x] `/ping`, `/server`, `/setup` commands
- [x] Interactive setup wizard
- [x] Welcome system
- [x] AI-powered `/community-summary`
- [x] `/unanswered` question detection
- [x] `/community-health` scoring
- [x] Structured logging and error handling

### Phase 2 — Persistence & Advanced AI

- [ ] PostgreSQL persistence layer
- [ ] Historical trend tracking
- [ ] AI-powered Q&A knowledge base
- [ ] Moderation assistance tools
- [ ] Scheduled daily/weekly pulse reports

### Phase 3 — Dashboard & Platform

- [ ] Next.js web dashboard
- [ ] Community analytics and insights
- [ ] AI-powered community health reports
- [ ] SaaS billing and multi-tenant support

---

## License

This project is licensed under the [MIT License](LICENSE).

Application code is original and project-specific. Third-party dependencies remain subject to their respective licenses.
