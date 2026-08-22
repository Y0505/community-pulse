/**
 * HealthScorer – Deterministic community health scoring.
 *
 * This module calculates an internal CommunityPulse health metric between
 * 0 and 100. It is NOT a scientifically validated metric. It is a
 * product-specific heuristic that combines several observable community
 * signals into a single interpretable number.
 *
 * Scoring methodology (documented and transparent):
 *
 * 1. Engagement (0-100):
 *    Based on message volume relative to community size.
 *    - < 1 msg/member/day = low engagement
 *    - 1-5 msg/member/day = moderate engagement
 *    - > 5 msg/member/day = high engagement
 *
 * 2. Response Rate (0-100):
 *    Percentage of questions that received a response.
 *    - 100% answered = 100 score
 *    - 80% answered = 80 score
 *    - < 20% answered = 20 score
 *    - 0 questions = 85 (neutral baseline)
 *
 * 3. Question Balance (0-100):
 *    Measures whether the community asks questions (good) without
 *    being overwhelmed by them (also good).
 *    - 5-15% of messages are questions = 100 (healthy balance)
 *    - < 1% = 60 (low interaction)
 *    - > 30% = 40 (overloaded)
 *
 * 4. Activity (0-100):
 *    Measures whether activity is spread across the time period
 *    or concentrated in a burst.
 *    - Even distribution = 100
 *    - Heavily concentrated = lower score
 *
 * The overall score is a weighted average:
 *   engagement: 25%, responseRate: 30%, questionBalance: 20%, activity: 25%
 */

import type { HealthScore } from "../ai/types.js";
import type { AnalysisInput, PreparedMessage } from "../ai/types.js";
import type { GeminiAnalysisResponse } from "../ai/types.js";

/** Members in the guild (used for per-member engagement calculation). */
interface HealthInput {
  messageCount: number;
  memberCount: number;
  hoursAnalyzed: number;
  aiResult: GeminiAnalysisResponse;
  input: AnalysisInput;
}

/**
 * Calculate a deterministic health score from collected data + AI analysis.
 */
export function calculateHealthScore(data: HealthInput): HealthScore {
  const engagement = calculateEngagement(data.messageCount, data.memberCount, data.hoursAnalyzed);
  const responseRate = calculateResponseRate(data.aiResult);
  const questionBalance = calculateQuestionBalance(data.messageCount, data.aiResult);
  const activity = calculateActivity(data.input.messages);

  const overall = Math.round(
    engagement * 0.25 +
    responseRate * 0.30 +
    questionBalance * 0.20 +
    activity * 0.25,
  );

  return {
    overall: clamp(overall, 0, 100),
    engagement: clamp(Math.round(engagement), 0, 100),
    responseRate: clamp(Math.round(responseRate), 0, 100),
    questionBalance: clamp(Math.round(questionBalance), 0, 100),
    activity: clamp(Math.round(activity), 0, 100),
    explanation: "", // Filled in by the AI service after scoring
  };
}

/**
 * Build a human-readable breakdown string for the AI health prompt.
 */
export function formatScoreForAI(score: HealthScore, data: HealthInput): string {
  const lines = [
    `Overall: ${score.overall}/100`,
    `Engagement: ${score.engagement}/100 (messages: ${data.messageCount}, members: ${data.memberCount}, period: ${data.hoursAnalyzed}h)`,
    `Response Rate: ${score.responseRate}/100 (questions: ${data.aiResult.questions.length}, unanswered: ${data.aiResult.questions.filter((q) => !q.answered).length})`,
    `Question Balance: ${score.questionBalance}/100 (${data.aiResult.questions.length} questions out of ${data.messageCount} messages)`,
    `Activity: ${score.activity}/100`,
    "",
    `Trending topics: ${data.aiResult.topics.filter((t) => t.trending).map((t) => t.name).join(", ") || "none detected"}`,
    `Important issues: ${data.aiResult.importantIssues.length}`,
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Individual scoring functions
// ---------------------------------------------------------------------------

/**
 * Engagement score: messages per member per hour, scaled to 0-100.
 *
 * Good engagement: 0.1-1 messages per member per hour.
 */
function calculateEngagement(messageCount: number, memberCount: number, hours: number): number {
  if (memberCount === 0 || hours === 0) return 0;

  const msgsPerMemberPerHour = messageCount / (memberCount * hours);

  // Scale: 0 msgs/member/hour → 0 score, 0.5+ → 100 score
  const score = (msgsPerMemberPerHour / 0.5) * 100;
  return clamp(score, 0, 100);
}

/**
 * Response rate score: what percentage of questions got answered.
 */
function calculateResponseRate(result: GeminiAnalysisResponse): number {
  const questions = result.questions;
  if (questions.length === 0) return 85; // Neutral baseline when no questions

  const answered = questions.filter((q) => q.answered).length;
  return (answered / questions.length) * 100;
}

/**
 * Question balance: healthy ratio of questions to total messages.
 *
 * 5-15% of messages being questions is ideal.
 */
function calculateQuestionBalance(messageCount: number, result: GeminiAnalysisResponse): number {
  if (messageCount === 0) return 0;

  const questionRatio = result.questions.length / messageCount;
  const percentage = questionRatio * 100;

  if (percentage >= 5 && percentage <= 15) return 100;
  if (percentage < 1) return 60;
  if (percentage < 5) return 60 + ((percentage - 1) / 4) * 40;
  if (percentage <= 25) return 100 - ((percentage - 15) / 10) * 40;
  if (percentage <= 30) return 60 - ((percentage - 25) / 5) * 20;
  return 40;
}

/**
 * Activity score: how evenly distributed messages are over the time period.
 *
 * Split the time into hourly buckets and measure variance. Low variance
 * (even distribution) gets a higher score.
 */
function calculateActivity(messages: PreparedMessage[]): number {
  if (messages.length === 0) return 0;

  // Parse time strings into hours and bucket
  const buckets = new Map<number, number>();
  for (const msg of messages) {
    const hour = parseHour(msg.time);
    if (hour >= 0) {
      buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
    }
  }

  if (buckets.size === 0) return 50;

  const counts = Array.from(buckets.values());
  const max = Math.max(...counts);
  const min = Math.min(...counts);

  if (max === 0) return 0;

  // Evenness ratio: min/max. Perfectly even = 1, all in one bucket = 0.
  const evenness = min / max;

  // Scale to 0-100 with a floor so even small activity gets some score
  return 30 + evenness * 70;
}

/** Parse "HH:MM" time string to hour (0-23), or -1 on failure. */
function parseHour(time: string): number {
  const match = time.match(/^(\d{1,2}):/);
  if (!match) return -1;
  const hour = parseInt(match[1]!, 10);
  return Number.isNaN(hour) ? -1 : hour;
}

/** Clamp a number between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
