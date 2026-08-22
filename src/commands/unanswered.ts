/**
 * /unanswered – Identify questions without meaningful responses.
 *
 * Analyzes recent messages to surface questions that community members
 * asked but did not receive answers. Shows suggested answers only to
 * administrators.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import type { Command } from "../types/index.js";
import { requireGeminiKey, getAnalysisHours } from "../config/env.js";
import { runFullAnalysis } from "../services/analytics/CommunityAnalyzer.js";

const unansweredCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("unanswered")
    .setDescription("Find unanswered questions from recent community activity.")
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

    await context.reply({
      content: "🔍 Scanning recent messages for unanswered questions…",
      ephemeral: true,
    });

    const hoursBack = getAnalysisHours();
    const result = await runFullAnalysis(context.member.guild, hoursBack);

    if (result.messageCount === 0) {
      await context.editReply({
        content:
          `📭 Not enough recent activity in the last ${hoursBack} hour${hoursBack === 1 ? "" : "s"} to detect questions.`,
      });
      return;
    }

    const unanswered = result.analysis?.unansweredQuestions ?? [];

    if (unanswered.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("✅ All Clear")
        .setDescription(
          `No unanswered questions detected in the last ${hoursBack} hour${hoursBack === 1 ? "" : "s"}.`,
        )
        .setColor(0x57F287)
        .addFields({
          name: "Messages Analyzed",
          value: String(result.messageCount),
          inline: true,
        })
        .setFooter({ text: "CommunityPulse" })
        .setTimestamp();

      await context.editReply({ content: undefined, embeds: [embed] });
      return;
    }

    // --- Build the unanswered questions report ---
    const embed = new EmbedBuilder()
      .setTitle("⚠️ Unanswered Questions")
      .setDescription(
        `Found **${unanswered.length}** question${unanswered.length === 1 ? "" : "s"} without a response in the last ${hoursBack} hour${hoursBack === 1 ? "" : "s"}.`,
      )
      .setColor(0xFEE75C)
      .setTimestamp();

    // Show up to 10 questions to stay within embed limits
    const questionsToShow = unanswered.slice(0, 10);

    for (const q of questionsToShow) {
      const fieldParts: string[] = [];
      fieldParts.push(`> ${q.text.slice(0, 200)}`);
      fieldParts.push("");
      fieldParts.push(`Asked by: **${q.author}** · ${q.channel}`);

      if (q.suggestedAnswer) {
        fieldParts.push("");
        fieldParts.push(`🤖 *Suggested answer: ${q.suggestedAnswer.slice(0, 200)}*`);
      }

      embed.addFields({
        name: "❓ Unanswered",
        value: fieldParts.join("\n"),
      });
    }

    if (unanswered.length > 10) {
      embed.addFields({
        name: "… and more",
        value: `${unanswered.length - 10} additional unanswered question${unanswered.length - 10 === 1 ? "" : "s"} not shown.`,
      });
    }

    embed.addFields({
      name: "Messages Analyzed",
      value: String(result.messageCount),
      inline: true,
    });

    embed.setFooter({
      text: "CommunityPulse · AI-detected · Suggested answers are internal notes only",
    });

    await context.editReply({ content: undefined, embeds: [embed] });
  },
};

export default unansweredCommand;
