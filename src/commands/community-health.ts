/**
 * /community-health – Calculate and display community health metrics.
 *
 * Computes an internal CommunityPulse health score using transparent,
 * deterministic metrics. The AI generates a human-readable explanation.
 *
 * NOTE: This is an internal CommunityPulse product metric, NOT a
 * scientifically validated health assessment.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import type { Command } from "../types/index.js";
import { requireGeminiKey, getAnalysisHours } from "../config/env.js";
import { runFullAnalysis } from "../services/analytics/CommunityAnalyzer.js";

/** Discord embed field value limit. */
const FIELD_LIMIT = 1024;

/** Safely truncate a string to fit a Discord embed field. */
function truncate(value: string, limit = FIELD_LIMIT): string {
  if (value.length <= limit) return value;
  return value.slice(0, limit - 1) + "…";
}

const communityHealthCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("community-health")
    .setDescription("Calculate community health score with AI insights.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(context) {
    // Runtime permission check (defense in depth — Discord also enforces this)
    if (!context.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await context.ephemeralReply({
        content: "⚠️ You need the **Manage Server** permission to use this command.",
      });
      return;
    }

    // Check Gemini API key before deferring
    try {
      requireGeminiKey();
    } catch {
      await context.ephemeralReply({
        content:
          "⚠️ AI features are not configured. The server administrator needs to add `GEMINI_API_KEY` to the bot's environment.",
      });
      return;
    }

    await context.deferReply(true);

    const hoursBack = getAnalysisHours();
    const result = await runFullAnalysis(context.member.guild, hoursBack);

    if (result.messageCount === 0) {
      await context.editReply({
        content:
          `📭 Not enough recent activity in the last ${hoursBack} hour${hoursBack === 1 ? "" : "s"} to calculate a health score.`,
      });
      return;
    }

    const { health } = result;
    const bar = buildProgressBar(health.overall);

    // --- Build the health embed ---
    const embed = new EmbedBuilder()
      .setTitle("🩺 Community Health")
      .setDescription(
        `Based on activity from the last **${hoursBack}** hour${hoursBack === 1 ? "" : "s"}\n` +
          `Analyzed **${result.messageCount}** messages across the server`,
      )
      .setColor(healthColor(health.overall))
      .addFields({
        name: `Overall Score: ${health.overall}/100`,
        value: bar,
      })
      .addFields(
        {
          name: "💬 Engagement",
          value: `${health.engagement}/100`,
          inline: true,
        },
        {
          name: "🤝 Response Rate",
          value: `${health.responseRate}/100`,
          inline: true,
        },
        {
          name: "❓ Question Balance",
          value: `${health.questionBalance}/100`,
          inline: true,
        },
        {
          name: "📈 Activity",
          value: `${health.activity}/100`,
          inline: true,
        },
      )
      .setTimestamp();

    // AI explanation
    if (health.explanation) {
      embed.addFields({
        name: "🤖 Analysis",
        value: truncate(health.explanation),
      });
    }

    embed.setFooter({
      text: "CommunityPulse · Internal product metric · Not scientifically validated",
    });

    await context.editReply({ content: undefined, embeds: [embed] });
  },
};

/** Return a color based on the health score. */
function healthColor(score: number): number {
  if (score >= 80) return 0x57f287; // Green
  if (score >= 60) return 0xfee75c; // Yellow
  if (score >= 40) return 0xeb9e3e; // Orange
  return 0xed4245; // Red
}

/** Build a visual progress bar using Unicode blocks. */
function buildProgressBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

export default communityHealthCommand;
