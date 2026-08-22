/**
 * /community-summary – AI-powered community analysis report.
 *
 * Collects recent messages, sends them to Gemini for structured analysis,
 * and presents a polished report to the administrator.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import type { Command } from "../types/index.js";
import { requireGeminiKey, getAnalysisHours } from "../config/env.js";
import { runFullAnalysis } from "../services/analytics/CommunityAnalyzer.js";

const communitySummaryCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("community-summary")
    .setDescription("Generate an AI-powered community analysis report.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(context) {
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

    // Defer the reply since analysis takes time
    await context.reply({
      content: "🔍 Analyzing community activity… This may take a moment.",
      ephemeral: true,
    });

    const hoursBack = getAnalysisHours();
    const result = await runFullAnalysis(context.member.guild, hoursBack);

    if (result.messageCount === 0) {
      await context.editReply({
        content:
          `📭 Not enough recent community activity in the last ${hoursBack} hour${hoursBack === 1 ? "" : "s"} to generate a reliable analysis.`,
      });
      return;
    }

    // --- Build the report embed ---
    const embed = new EmbedBuilder()
      .setTitle("📊 Community Brief")
      .setDescription(`Analysis of the last **${hoursBack}** hour${hoursBack === 1 ? "" : "s"}`)
      .setColor(0x5865F2)
      .setTimestamp();

    // Stats section
    embed.addFields({
      name: "💬 Messages Analyzed",
      value: String(result.messageCount),
      inline: true,
    });

    if (result.analysis) {
      const questionCount = result.analysis.questions.length;
      const unansweredCount = result.analysis.unansweredQuestions.length;

      embed.addFields(
        {
          name: "❓ Questions Detected",
          value: String(questionCount),
          inline: true,
        },
        {
          name: "⚠️ Unanswered",
          value: String(unansweredCount),
          inline: true,
        },
      );

      // Trending topics
      if (result.analysis.trendingTopics.length > 0) {
        const topicLines = result.analysis.trendingTopics
          .slice(0, 5)
          .map((t, i) => `${i + 1}. **${t.name}**`)
          .join("\n");
        embed.addFields({ name: "🔥 Trending Topics", value: topicLines });
      } else if (result.analysis.topics.length > 0) {
        const topicLines = result.analysis.topics
          .slice(0, 5)
          .map((t, i) => `${i + 1}. **${t.name}**`)
          .join("\n");
        embed.addFields({ name: "📋 Main Topics", value: topicLines });
      }

      // AI insight
      if (result.analysis.insight) {
        embed.addFields({
          name: "💡 Insight",
          value: result.analysis.insight,
        });
      }

      // Important issues
      if (result.analysis.importantIssues.length > 0) {
        const issueLines = result.analysis.importantIssues
          .slice(0, 5)
          .map((i) => {
            const icon = i.severity === "high" ? "🔴" : i.severity === "medium" ? "🟡" : "🔵";
            return `${icon} ${i.description}`;
          })
          .join("\n");
        embed.addFields({ name: "⚠️ Attention Needed", value: issueLines });
      }
    }

    // Footer with data source note
    embed.setFooter({
      text: `CommunityPulse · ${result.aiAvailable ? "AI-powered" : "AI unavailable — showing raw stats"} · Internal metric`,
    });

    await context.editReply({
      content: undefined,
      embeds: [embed],
    });
  },
};

export default communitySummaryCommand;
