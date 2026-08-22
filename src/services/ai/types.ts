/**
 * Structured types for AI-generated community analysis.
 *
 * These define the contract between CommunityPulse and Gemini. The AI
 * provider must produce JSON conforming to these interfaces, and all
 * consumers must validate responses before use.
 */

/** A single discussion topic detected by the AI. */
export interface Topic {
  /** Short label for the topic (e.g. "API Integration"). */
  name: string;
  /** Approximate number of messages related to this topic. */
  messageCount: number;
  /** Whether this topic appears to be trending upward. */
  trending: boolean;
}

/** A message identified as a question by the AI. */
export interface DetectedQuestion {
  /** The original question text (truncated for privacy). */
  text: string;
  /** Username of the person who asked (display name only). */
  author: string;
  /** Channel name where the question was posted. */
  channel: string;
  /** ISO timestamp of when the question was posted. */
  timestamp: string;
  /** Whether someone responded meaningfully. */
  answered: boolean;
  /** AI-suggested answer, only if the question is unanswered. */
  suggestedAnswer?: string;
}

/** An important issue or concern detected by the AI. */
export interface ImportantIssue {
  /** Brief description of the issue. */
  description: string;
  /** Severity: "low", "medium", or "high". */
  severity: "low" | "medium" | "high";
}

/** Complete structured output from community analysis. */
export interface CommunityAnalysisResult {
  /** AI-generated summary insight. */
  insight: string;
  /** Topics discussed during the analysis period. */
  topics: Topic[];
  /** Trending topics (subset of topics marked as trending). */
  trendingTopics: Topic[];
  /** All detected questions. */
  questions: DetectedQuestion[];
  /** Unanswered questions (subset of questions where answered === false). */
  unansweredQuestions: DetectedQuestion[];
  /** Important issues requiring attention. */
  importantIssues: ImportantIssue[];
}

/** Input data prepared for the AI model. */
export interface AnalysisInput {
  /** Number of messages collected. */
  messageCount: number;
  /** Time range description (e.g. "last 24 hours"). */
  timeRange: string;
  /** Prepared message summaries (truncated, privacy-safe). */
  messages: PreparedMessage[];
}

/** A privacy-safe message summary for AI consumption. */
export interface PreparedMessage {
  /** Channel name. */
  channel: string;
  /** Author display name (not ID). */
  author: string;
  /** Message text, truncated to a reasonable length. */
  text: string;
  /** ISO timestamp string. */
  timestamp: string;
  /** Approximate time display (HH:MM). */
  time: string;
}

/** Community health score breakdown. */
export interface HealthScore {
  /** Overall score 0–100. */
  overall: number;
  /** Engagement score 0–100 (message volume relative to community size). */
  engagement: number;
  /** Response rate score 0–100 (percentage of questions answered). */
  responseRate: number;
  /** Question quality score 0–100 (balance of questions vs. discussion). */
  questionBalance: number;
  /** Activity score 0–100 (distribution of activity over time). */
  activity: number;
  /** AI-generated health explanation. */
  explanation: string;
}

/** Raw JSON schema expected from Gemini for community analysis. */
export interface GeminiAnalysisResponse {
  insight: string;
  topics: Array<{ name: string; messageCount: number; trending: boolean }>;
  questions: Array<{
    text: string;
    author: string;
    channel: string;
    timestamp?: string;
    answered: boolean;
    suggestedAnswer?: string;
  }>;
  importantIssues: Array<{
    description: string;
    severity: "low" | "medium" | "high";
  }>;
}

