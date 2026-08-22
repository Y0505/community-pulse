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
import type { GeminiAnalysisResponse } from "./types.js";

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
 * Parse a Gemini response as JSON with a safety cap.
 *
 * Returns the raw parsed object. Callers must validate the shape
 * before using it — the return type is Record<string, unknown>
 * to prevent blind trust in the AI output.
 */
function parseJSON(raw: string): Record<string, unknown> {
  // Safety: cap response length to prevent memory issues
  const safe = raw.length > MAX_RESPONSE_CHARS ? raw.slice(0, MAX_RESPONSE_CHARS) : raw;

  // Strip markdown code fences if present (some models add them)
  const cleaned = safe
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("AI response is not a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes("AI response")) throw err;
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

    const raw = parseJSON(text);

    // Validate required fields exist and have the right types
    if (
      typeof raw.insight !== "string" ||
      !Array.isArray(raw.topics) ||
      !Array.isArray(raw.questions) ||
      !Array.isArray(raw.importantIssues)
    ) {
      logger.error(SCOPE, "Gemini response missing required fields");
      return null;
    }

    // Clamp arrays to reasonable sizes
    const topics = (raw.topics as unknown[]).slice(0, 10);
    const questions = (raw.questions as unknown[]).slice(0, 50);
    const importantIssues = (raw.importantIssues as unknown[]).slice(0, 10);

    // Sanitize insight text
    const insight = String(raw.insight).slice(0, 1000);

    // Validate and sanitize topics
    const sanitizedTopics = topics
      .filter((t): t is { name: string; messageCount: number; trending: boolean } =>
        typeof t === "object" && t !== null && typeof (t as Record<string, unknown>).name === "string",
      )
      .map((t) => ({
        name: String(t.name).slice(0, 100),
        messageCount: Math.max(1, Math.min(10000, Math.round(Number(t.messageCount) || 1))),
        trending: Boolean(t.trending),
      }));

    // Validate and sanitize questions
    const sanitizedQuestions = questions
      .filter((q): q is { text: string; author: string; channel: string } =>
        typeof q === "object" && q !== null &&
        typeof (q as Record<string, unknown>).text === "string" &&
        typeof (q as Record<string, unknown>).author === "string" &&
        typeof (q as Record<string, unknown>).channel === "string",
      )
      .map((q) => ({
        text: String(q.text).slice(0, 500),
        author: String(q.author).slice(0, 50),
        channel: String(q.channel).slice(0, 50),
        timestamp: typeof (q as Record<string, unknown>).timestamp === "string" ? String((q as Record<string, unknown>).timestamp) : undefined,
        answered: Boolean((q as Record<string, unknown>).answered),
        suggestedAnswer: typeof (q as Record<string, unknown>).suggestedAnswer === "string" ? String((q as Record<string, unknown>).suggestedAnswer).slice(0, 500) : undefined,
      }));

    // Validate and sanitize important issues with strict severity validation
    const VALID_SEVERITIES = new Set(["low", "medium", "high"]);
    const sanitizedIssues = importantIssues
      .filter((i): i is { description: string } =>
        typeof i === "object" && i !== null && typeof (i as Record<string, unknown>).description === "string",
      )
      .map((i) => ({
        description: String(i.description).slice(0, 300),
        severity: VALID_SEVERITIES.has(String((i as Record<string, unknown>).severity))
          ? String((i as Record<string, unknown>).severity) as "low" | "medium" | "high"
          : "low",
      }));

    const analysis: GeminiAnalysisResponse = {
      insight,
      topics: sanitizedTopics,
      questions: sanitizedQuestions,
      importantIssues: sanitizedIssues,
    };

    logger.info(SCOPE, `Analysis complete: ${analysis.topics.length} topics, ${analysis.questions.length} questions`);
    return analysis;
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

    const raw = parseJSON(text);

    if (typeof raw.explanation !== "string") {
      logger.error(SCOPE, "Health explanation missing 'explanation' field");
      return null;
    }

    return String(raw.explanation).slice(0, 1000);
  } catch (error) {
    logger.error(SCOPE, "Health explanation generation failed", error);
    return null;
  }
}
