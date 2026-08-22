/**
 * CommunityAnalyzer – Orchestrates message collection, AI analysis,
 * and health scoring into a single cohesive analysis pass.
 *
 * This is the main entry point that commands call. It coordinates
 * between the message collector, AI service, and health scorer.
 */

import type { Guild } from "discord.js";
import { collectMessages, formatForAI } from "./MessageCollector.js";
import { analyzeMessages, explainHealth } from "../ai/AIService.js";
import { calculateHealthScore, formatScoreForAI } from "./HealthScorer.js";
import type { CommunityAnalysisResult, HealthScore, PreparedMessage } from "../ai/types.js";
import { logger } from "../../utils/logger.js";

const SCOPE = "CommunityAnalyzer";

/** Options controlling which AI work is performed. */
export interface AnalysisOptions {
  /** Generate an AI health explanation. Only needed by /community-health. */
  includeHealthExplanation?: boolean;
}

/** Result of a full community analysis pass. */
export interface FullAnalysis {
  /** The AI-generated community analysis. */
  analysis: CommunityAnalysisResult | null;
  /** Deterministic health score. */
  health: HealthScore;
  /** Number of messages collected. */
  messageCount: number;
  /** Time range analyzed. */
  timeRange: string;
  /** Whether the AI was available. */
  aiAvailable: boolean;
}

/**
 * Run a complete community analysis for a guild.
 *
 * Steps:
 * 1. Collect bounded messages from all accessible channels.
 * 2. Send to Gemini for structured analysis.
 * 3. Calculate deterministic health score.
 * 4. (Optional) Generate AI health explanation.
 *
 * Returns a complete result even if the AI fails — health scores
 * are always deterministic.
 */
export async function runFullAnalysis(
  guild: Guild,
  hoursBack: number,
  options: AnalysisOptions = {},
): Promise<FullAnalysis> {
  logger.info(SCOPE, `Starting full analysis for guild ${guild.id} (${hoursBack}h)`);

  // Step 1: Collect messages
  const input = await collectMessages(guild, hoursBack);

  if (input.messageCount === 0) {
    logger.info(SCOPE, "No messages found in the analysis period");
    return {
      analysis: null,
      health: {
        overall: 0,
        engagement: 0,
        responseRate: 0,
        questionBalance: 0,
        activity: 0,
        explanation: "No activity detected during the analysis period.",
      },
      messageCount: 0,
      timeRange: input.timeRange,
      aiAvailable: false,
    };
  }

  // Step 2: AI analysis
  const aiPrompt = formatForAI(input);
  const aiResult = await analyzeMessages(aiPrompt);
  const aiAvailable = aiResult !== null;

  // Step 3: Health score (always deterministic)
  const health = calculateHealthScore({
    messageCount: input.messageCount,
    memberCount: guild.memberCount,
    hoursAnalyzed: hoursBack,
    aiResult: aiResult ?? {
      insight: "",
      topics: [],
      questions: [],
      importantIssues: [],
    },
    input,
  });

  // Step 4: AI health explanation (non-critical, only when explicitly requested)
  if (options.includeHealthExplanation && aiAvailable) {
    const breakdown = formatScoreForAI(health, {
      messageCount: input.messageCount,
      memberCount: guild.memberCount,
      hoursAnalyzed: hoursBack,
      aiResult: aiResult!,
      input,
    });
    const explanation = await explainHealth(breakdown);
    if (explanation) {
      health.explanation = explanation;
    } else {
      health.explanation = generateFallbackExplanation(health);
    }
  } else {
    health.explanation = generateFallbackExplanation(health);
  }

  // Build the final analysis result, enriching timestamps from collected messages
  const analysis: CommunityAnalysisResult | null = aiResult
    ? ((): CommunityAnalysisResult => {
        const refined = refineUnansweredStatus(aiResult.questions, input.messages);
        return {
          insight: aiResult.insight,
          topics: aiResult.topics.map((t) => ({
            ...t,
            messageCount: Math.max(1, t.messageCount),
          })),
          trendingTopics: aiResult.topics.filter((t) => t.trending),
          questions: refined.map((q) => ({
            text: q.text,
            author: q.author,
            channel: q.channel,
            timestamp: findTimestamp(q.text, q.channel, input.messages),
            answered: q.answered,
            suggestedAnswer: q.suggestedAnswer,
          })),
          unansweredQuestions: refined
            .filter((q) => !q.answered)
            .map((q) => ({
              text: q.text,
              author: q.author,
              channel: q.channel,
              timestamp: findTimestamp(q.text, q.channel, input.messages),
              answered: false,
              suggestedAnswer: q.suggestedAnswer,
            })),
          importantIssues: aiResult.importantIssues.map((i) => ({
            description: i.description,
            severity: i.severity,
          })),
        };
      })()
    : null;

  return {
    analysis,
    health,
    messageCount: input.messageCount,
    timeRange: input.timeRange,
    aiAvailable,
  };
}

/**
 * Fallback explanation when the AI is unavailable.
 * Uses simple rules based on the health score.
 */
/**
 * Attempt to find a timestamp for a question by matching it against
 * collected messages. Uses simple substring matching — not perfect,
 * but better than fabricating a timestamp.
 *
 * Returns the ISO timestamp of the matching message, or an empty string
 * if no reliable match is found. The UI must handle empty timestamps
 * gracefully.
 */
function findTimestamp(
  questionText: string,
  channel: string,
  messages: PreparedMessage[],
): string {
  const lower = questionText.toLowerCase();
  const channelMessages = messages.filter((m) => m.channel === channel);

  for (const msg of channelMessages) {
    if (msg.text.toLowerCase().includes(lower.slice(0, 50))) {
      return msg.timestamp;
    }
  }
  // Return empty string rather than fabricating a timestamp.
  return "";
}

/**
 * Patterns that indicate a message is likely a response to a preceding question.
 * These are intentionally broad to catch common response patterns without
 * creating a complex NLP pipeline. The AI remains the primary classifier;
 * this is a lightweight safety net.
 */
const RESPONSE_PATTERNS = [
  // Direct answer starters
  /^(yes|no|maybe|sure|nope|nah|yep|yeah)/i,
  // Documentation / reference pointers
  /^(check|try|look|see|read|go to|visit|use|follow)/i,
  /^(docs?|documentation|here\s+is|here's|here are|here's a)/i,
  // Explanatory replies
  /^(you can|you should|you need to|you have to|you may)/i,
  /^(it's|its|this is|that's|the reason|because|basically)/i,
  // Confirmation and acknowledgment
  /^(done|fixed|solved|resolved|working|works|confirmed|agreed|thanks)/i,
  // Technical answers
  /^(install|configure|set up|setup|update|upgrade|run|execute)/i,
  /^(error|issue|problem|bug|crash|failed|failing)/i,
  // Link-like responses (just a URL or channel reference)
  /^(https?:\/\/|<#[\w]+>|<@[\w]+>)/i,
];

/** Check whether a message looks like a response to a question. */
function looksLikeResponse(text: string): boolean {
  const trimmed = text.trim();
  // Very short messages (1-3 words) are often acknowledgments
  if (trimmed.split(/\s+/).length <= 3 && trimmed.length > 1) return true;
  return RESPONSE_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Local heuristic: re-evaluate whether a question is truly unanswered.
 *
 * After the AI classifies questions, this checks the surrounding
 * messages for responses that the AI might have missed. A question
 * is considered answered if a message from a *different* author
 * follows it within 3 messages and looks like a response.
 *
 * This is a lightweight safety net — it doesn't replace the AI
 * classification but catches obvious missed responses.
 */
function refineUnansweredStatus(
  questions: Array<{ text: string; author: string; channel: string; answered: boolean; suggestedAnswer?: string }>,
  messages: PreparedMessage[],
): Array<{ text: string; author: string; channel: string; answered: boolean; suggestedAnswer?: string }> {
  return questions.map((q) => {
    if (q.answered) return q;

    const lower = q.text.toLowerCase().slice(0, 80);
    const channelMessages = messages.filter((m) => m.channel === q.channel);

    // Find the question's approximate position
    const qIndex = channelMessages.findIndex(
      (m) => m.author === q.author && m.text.toLowerCase().includes(lower.slice(0, 40)),
    );

    if (qIndex === -1) return q;

    // Check the next 3 messages for a response from a different author
    const nearby = channelMessages.slice(qIndex + 1, qIndex + 4);
    for (const msg of nearby) {
      if (msg.author !== q.author && looksLikeResponse(msg.text)) {
        return { ...q, answered: true };
      }
    }

    return q;
  });
}

function generateFallbackExplanation(health: HealthScore): string {
  if (health.overall >= 80) {
    return "Community health is strong. Activity levels and engagement are good.";
  }
  if (health.overall >= 60) {
    return "Community health is moderate. Some areas could use attention, but overall activity is steady.";
  }
  if (health.overall >= 40) {
    return "Community health needs attention. Engagement or response rates are below target.";
  }
  if (health.overall > 0) {
    return "Community health is low. Consider increasing activity and encouraging responses to questions.";
  }
  return "Insufficient data to generate a health assessment for this period.";
}
