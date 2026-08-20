/**
 * CommunityPulse – Entry point.
 *
 * Boots the Discord client, registers command modules and event handlers,
 * then connects to the gateway.
 */

import { Client, GatewayIntentBits } from "discord.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

// Command modules
import pingCommand from "./commands/ping.js";
import serverCommand from "./commands/server.js";
import setupCommand from "./commands/setup.js";
import type { Command, BotEvent } from "./types/index.js";

// Event modules
import readyEvent from "./events/ready.js";
import interactionCreateEvent, {
  registerCommands,
} from "./events/interactionCreate.js";
import guildMemberAddEvent from "./events/guildMemberAdd.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const SCOPE = "Main";

const commands: Command[] = [pingCommand, serverCommand, setupCommand];

const events: BotEvent[] = [readyEvent, interactionCreateEvent, guildMemberAddEvent];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Register commands for the interaction router
registerCommands(commands);

// Register event handlers
for (const event of events) {
  if (event.once) {
    client.once(event.name, (...args: unknown[]) => event.execute(...args));
  } else {
    client.on(event.name, (...args: unknown[]) => event.execute(...args));
  }
}

// Global error handlers
client.on("error", (error) => {
  logger.error(SCOPE, "Uncaught client error", error);
});

process.on("unhandledRejection", (reason) => {
  logger.error(SCOPE, "Unhandled promise rejection", reason);
});

process.on("uncaughtException", (error) => {
  logger.error(SCOPE, "Uncaught exception", error);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

logger.info(SCOPE, "Starting CommunityPulse…");

try {
  await client.login(env.DISCORD_TOKEN);
  logger.info(SCOPE, "Connected to Discord gateway");
} catch (error) {
  logger.error(SCOPE, "Failed to log in to Discord", error);
  process.exit(1);
}
