/**
 * ready – Fires once the bot successfully connects to the Discord gateway.
 */

import { Events, type Client } from "discord.js";
import type { BotEvent } from "../types/index.js";
import { logger } from "../utils/logger.js";

const readyEvent: BotEvent = {
  name: Events.ClientReady,
  once: true,

  async execute(...args: unknown[]) {
    const client = args[0] as Client;
    const tag = client.user?.tag ?? "unknown";
    const guildCount = client.guilds.cache.size;
    const memberCount = client.guilds.cache.reduce(
      (acc: number, g) => acc + g.memberCount,
      0,
    );

    logger.info(
      "Ready",
      `Logged in as ${tag} · Serving ${guildCount} guild${guildCount === 1 ? "" : "s"} · ${memberCount} member${memberCount === 1 ? "" : "s"}`,
    );
  },
};

export default readyEvent;
