/**
 * GeminiProvider – Google Gemini API integration.
 *
 * This module wraps the official Google Generative AI SDK to provide a
 * clean abstraction over Gemini. It handles:
 *
 * - SDK initialization
 * - Structured JSON generation
 * - Response parsing and validation
 * - Error handling with safe degradation
 * - Timeout management
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireGeminiKey } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import type {
  GeminiAnalysisResponse,
  GeminiHealthResponse,
} from "./types.js";

const SCOPE = "GeminiProvider";

/** Timeout for a single Gemini request (30 seconds). */
const REQUEST_TIMEOUT_MS = 30_000;

/** Maximum response length to prevent unbounded data. */
const MAX_RESPONSE_CHARS = 50_000;

/**
 * Initialize the Gemini client. Called lazily on first use so the bot
 * can start without a Gemini key for basic commands.
 */
function getClient(): GoogleGenerativeAI {
  const apiKey = requireGeminiKey();
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Build a prompt that instructs Gemini to return structured JSON for
 * community analysis.
 */
function buildAnalysisPrompt(inputSummary: string): string {
  return `You are a Discord community analyst. Analyze the following community messages and return ONLY a valid JSON object with no markdown formatting.

The JSON must have this exact structure:
{
  "insight": "A 1-2 sentence overall insight about the community",
  "topics": [
    { "name": "Topic Name", "messageCount": 10, "trending": true }
  ],
  "questions": [
    { "text": "The question", "author": "username", "channel": "channel-name", "answered": false, "suggestedAnswer": "optional answer" }
  ],
  "importantIssues": [
    { "description": "Brief issue description", "severity": "low" | "medium" | "high" }
  ]
}

Rules:
- "topics" should list the 3-8 main discussion themes.
- "questions" should list actual questions found in messages. Mark "answered" true only if someone gave a substantive reply.
- "suggestedAnswer" should only be included for unanswered questions.
- "importantIssues" should highlight problems, complaints, or urgent needs.
- "trending" means the topic appears to be gaining momentum.
- Keep all text concise (under 200 chars per field).
- Do NOT include user IDs, email addresses, or private information.
- Return ONLY the JSON object, no explanation.

Community messages to analyze:
${inputSummary}`;
}

/**
 * Build a prompt that instructs Gemini to explain a health score.
 */
function buildHealthPrompt(scoreBreakdown: string): string {
  return `You are a Discord community analyst. Given the following community health metrics, write a 2-3 sentence explanation.

The explanation should:
- Summarize the overall health
- Highlight the strongest metric
- Point out the area needing most improvement
- Be specific to the data provided

Return ONLY a JSON object:
{ "explanation": "Your explanation here" }

Do NOT include markdown formatting. Do NOT include any text outside the JSON.

Metrics:
${scoreBreakdown}`;
}

/**
 * Parse and validate a Gemini response as JSON with a safety cap.
 */
function parseJSON<T>(raw: string): T {
  // Safety: cap response length to prevent memory issues
  const safe = raw.length > MAX_RESPONSE_CHARS ? raw.slice(0, MAX_RESPONSE_CHARS) : raw;

  // Strip markdown code fences if present (some models add them)
  const cleaned = safe
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    logger.error(SCOPE, `Failed to parse JSON response (length: ${cleaned.length})`);
    throw new Error("AI returned invalid JSON. The response could not be parsed.");
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze community messages and return structured analysis.
 *
 * Returns null on any failure — never throws to the caller.
 */
export async function analyzeCommunity(
  inputSummary: string,
): Promise<GeminiAnalysisResponse | null> {
  try {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = buildAnalysisPrompt(inputSummary);

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini request timed out")), REQUEST_TIMEOUT_MS),
      ),
    ]);

    const text = result.response.text();
    if (!text) {
      logger.error(SCOPE, "Gemini returned empty response");
      return null;
    }

    const parsed = parseJSON<GeminiAnalysisResponse>(text);

    // Validate required fields
    if (
      typeof parsed.insight !== "string" ||
      !Array.isArray(parsed.topics) ||
      !Array.isArray(parsed.questions) ||
      !Array.isArray(parsed.importantIssues)
    ) {
      logger.error(SCOPE, "Gemini response missing required fields");
      return null;
    }

    // Clamp arrays to reasonable sizes
    parsed.topics = parsed.topics.slice(0, 10);
    parsed.questions = parsed.questions.slice(0, 50);
    parsed.importantIssues = parsed.importantIssues.slice(0, 10);

    // Sanitize insight text
    parsed.insight = parsed.insight.slice(0, 1000);

    // Validate and sanitize topics
    parsed.topics = parsed.topics
      .filter((t) => typeof t.name === "string")
      .map((t) => ({
        name: t.name.slice(0, 100),
        messageCount: Math.max(1, Math.min(10000, Math.round(Number(t.messageCount) || 1))),
        trending: Boolean(t.trending),
      }));

    // Validate and sanitize questions
    parsed.questions = parsed.questions
      .filter((q) => typeof q.text === "string" && typeof q.author === "string" && typeof q.channel === "string")
      .map((q) => ({
        text: q.text.slice(0, 500),
        author: q.author.slice(0, 50),
        channel: q.channel.slice(0, 50),
        timestamp: typeof q.timestamp === "string" ? q.timestamp : undefined,
        answered: Boolean(q.answered),
        suggestedAnswer: typeof q.suggestedAnswer === "string" ? q.suggestedAnswer.slice(0, 500) : undefined,
      }));

    // Validate and sanitize important issues with strict severity validation
    const VALID_SEVERITIES = new Set(["low", "medium", "high"]);
    parsed.importantIssues = parsed.importantIssues
      .filter((i) => typeof i.description === "string")
      .map((i) => ({
        description: i.description.slice(0, 300),
        severity: VALID_SEVERITIES.has(i.severity) ? i.severity : "low",
      }));

    logger.info(SCOPE, `Analysis complete: ${parsed.topics.length} topics, ${parsed.questions.length} questions`);
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.includes("API key")) {
      logger.error(SCOPE, "Invalid Gemini API key");
    } else if (error instanceof Error && error.message.includes("timed out")) {
      logger.error(SCOPE, "Gemini request timed out");
    } else {
      logger.error(SCOPE, "Gemini analysis failed", error);
    }
    return null;
  }
}

/**
 * Generate a health explanation from score metrics.
 *
 * Returns null on any failure.
 */
export async function generateHealthExplanation(
  scoreBreakdown: string,
): Promise<string | null> {
  try {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = buildHealthPrompt(scoreBreakdown);

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini request timed out")), REQUEST_TIMEOUT_MS),
      ),
    ]);

    const text = result.response.text();
    if (!text) return null;

    const parsed = parseJSON<GeminiHealthResponse>(text);

    if (typeof parsed.explanation !== "string") {
      logger.error(SCOPE, "Health explanation missing 'explanation' field");
      return null;
    }

    return parsed.explanation.slice(0, 1000);
  } catch (error) {
    logger.error(SCOPE, "Health explanation generation failed", error);
    return null;
  }
}
