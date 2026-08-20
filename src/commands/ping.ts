/**
 * /ping – Health check command.
 *
 * Returns the bot's Discord gateway latency and confirms the bot is alive.
 */

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import type { Command } from "../types/index.js";

const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's latency and connection status."),

  async execute(context) {
    const latency = context.member.guild.shard.ping;

    const embed = new EmbedBuilder()
      .setTitle("🏓 Pong!")
      .setDescription("Bot is online and responding.")
      .addFields(
        { name: "Gateway Latency", value: `${latency} ms`, inline: true },
        { name: "Uptime", value: formatUptime(process.uptime()), inline: true },
      )
      .setColor(0x5865f2)
      .setTimestamp();

    await context.ephemeralReply({ embeds: [embed] });
  },
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

export default pingCommand;
