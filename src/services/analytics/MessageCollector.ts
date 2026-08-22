/**
 * MessageCollector – Fetches recent messages from a Discord guild
 * within bounded limits.
 *
 * Privacy principles:
 * - Only collects messages the bot can legitimately access.
 * - Strips unnecessary metadata before analysis.
 * - Never collects user IDs, avatars, or profile data.
 * - Caps message count to prevent unbounded memory usage.
 * - Handles inaccessible channels gracefully.
 */

import {
  type Guild,
  type TextChannel,
  type Message,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../utils/logger.js";
import type { PreparedMessage, AnalysisInput } from "../ai/types.js";

const SCOPE = "MessageCollector";

/** Absolute maximum messages to collect across all channels. */
const MAX_TOTAL_MESSAGES = 2_000;

/** Maximum messages to fetch per individual channel. */
const MAX_PER_CHANNEL = 200;

/** Maximum text length for a single prepared message. */
const MAX_MESSAGE_TEXT_LENGTH = 300;

/**
 * Collect recent messages from all accessible text channels in a guild.
 *
 * Returns a bounded `AnalysisInput` ready for AI consumption.
 */
export async function collectMessages(
  guild: Guild,
  hoursBack: number,
): Promise<AnalysisInput> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const timeRange = `last ${hoursBack} hour${hoursBack === 1 ? "" : "s"}`;

  const textChannels = guild.channels.cache.filter(
    (ch): ch is TextChannel =>
      ch.type === ChannelType.GuildText &&
      ch.permissionsFor(guild.members.me?.id ?? "")?.has(PermissionFlagsBits.ReadMessageHistory) === true,
  );

  logger.info(
    SCOPE,
    `Collecting messages from ${textChannels.size} channels in guild ${guild.id} (${timeRange})`,
  );

  const allMessages: Message[] = [];
  let channelsSkipped = 0;

  for (const [, channel] of textChannels) {
    if (allMessages.length >= MAX_TOTAL_MESSAGES) break;

    try {
      const remaining = MAX_TOTAL_MESSAGES - allMessages.length;
      const limit = Math.min(MAX_PER_CHANNEL, remaining);

      const messages = await channel.messages.fetch({
        limit,
        after: since.toISOString(),
      });

      allMessages.push(...messages.values());
    } catch (error) {
      channelsSkipped++;
      logger.warn(
        SCOPE,
        `Skipping channel ${channel.name} (${channel.id}): ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  if (channelsSkipped > 0) {
    logger.warn(SCOPE, `Skipped ${channelsSkipped} inaccessible channel(s)`);
  }

  logger.info(SCOPE, `Collected ${allMessages.length} messages from ${textChannels.size - channelsSkipped} channels`);

  const prepared = allMessages
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(prepareMessage);

  return {
    messageCount: prepared.length,
    timeRange,
    messages: prepared,
  };
}

/**
 * Convert a Discord message into a privacy-safe, compact representation.
 */
function prepareMessage(msg: Message): PreparedMessage {
  return {
    channel: msg.channel.type === ChannelType.GuildText ? msg.channel.name : "unknown",
    author: msg.member?.displayName ?? msg.author.displayName ?? "unknown",
    text: msg.content.slice(0, MAX_MESSAGE_TEXT_LENGTH),
    time: formatTime(msg.createdTimestamp),
  };
}

/** Format a timestamp as a short readable string. */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Format an AnalysisInput into a concise text block for the AI prompt.
 * Keeps token count manageable by summarizing rather than listing every message.
 */
export function formatForAI(input: AnalysisInput): string {
  const lines: string[] = [
    `Time range: ${input.timeRange}`,
    `Total messages: ${input.messageCount}`,
    "",
  ];

  // Group messages by channel for better context
  const byChannel = new Map<string, PreparedMessage[]>();
  for (const msg of input.messages) {
    const existing = byChannel.get(msg.channel);
    if (existing) {
      existing.push(msg);
    } else {
      byChannel.set(msg.channel, [msg]);
    }
  }

  for (const [channel, messages] of byChannel) {
    lines.push(`--- #${channel} (${messages.length} messages) ---`);
    // Include at most 50 messages per channel in the prompt
    const sample = messages.slice(0, 50);
    for (const msg of sample) {
      lines.push(`[${msg.time}] ${msg.author}: ${msg.text}`);
    }
    if (messages.length > 50) {
      lines.push(`... and ${messages.length - 50} more messages`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
