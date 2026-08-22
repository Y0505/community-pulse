/**
 * deploy-commands – Registers slash commands with the Discord REST API.
 *
 * Supports both guild-specific (development) and global registration.
 *
 * Usage:
 *   npm run deploy:commands          → register globally
 *   DISCORD_GUILD_ID=xxx npm run deploy:commands → register to one guild
 */

import { REST, Routes } from "discord.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

// Import all command modules
import pingCommand from "./commands/ping.js";
import serverCommand from "./commands/server.js";
import setupCommand from "./commands/setup.js";
import communitySummaryCommand from "./commands/community-summary.js";
import unansweredCommand from "./commands/unanswered.js";
import communityHealthCommand from "./commands/community-health.js";

const SCOPE = "DeployCommands";

const commands = [
  pingCommand.data.toJSON(),
  serverCommand.data.toJSON(),
  setupCommand.data.toJSON(),
  communitySummaryCommand.data.toJSON(),
  unansweredCommand.data.toJSON(),
  communityHealthCommand.data.toJSON(),
];

async function deploy(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

  logger.info(SCOPE, `Deploying ${commands.length} command(s)…`);

  try {
    if (env.DISCORD_GUILD_ID) {
      // Guild-specific registration (fast, ideal for development)
      await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
        body: commands,
      });
      logger.info(
        SCOPE,
        `Successfully registered ${commands.length} command(s) to guild ${env.DISCORD_GUILD_ID}`,
      );
    } else {
      // Global registration (takes up to an hour to propagate)
      await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
        body: commands,
      });
      logger.info(SCOPE, `Successfully registered ${commands.length} command(s) globally`);
    }
  } catch (error) {
    logger.error(SCOPE, "Failed to deploy commands", error);
    process.exit(1);
  }
}

await deploy();
