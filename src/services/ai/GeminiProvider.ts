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

import { GoogleGenerativeAI, GoogleGenerativeAIAbortError, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { requireGeminiKey } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import type { GeminiAnalysisResponse } from "./types.js";

const SCOPE = "GeminiProvider";

/** Timeout for a single Gemini request (30 seconds). */
const REQUEST_TIMEOUT_MS = 30_000;

/** Maximum response length to prevent unbounded data. */
const MAX_RESPONSE_CHARS = 50_000;

/** Maximum retry attempts for temporary Gemini failures. */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff in milliseconds. */
const BASE_DELAY_MS = 1_000;

/**
 * HTTP status codes that indicate a temporary failure worth retrying.
 * 429 = rate limited, 500/502/503/504 = server-side issues.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

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
// Retry helpers — original CommunityPulse implementation.
// Determines whether an error is temporary and worth retrying, and
// provides exponential backoff between attempts.
// ---------------------------------------------------------------------------

/**
 * Returns true when the error indicates a temporary failure that
 * may succeed on a subsequent attempt.
 *
 * Retried:
 *  - GoogleGenerativeAIFetchError with HTTP 429, 500, 502, 503, 504
 *  - Generic network errors (TypeError from failed fetch, etc.)
 *
 * NOT retried:
 *  - GoogleGenerativeAIAbortError (timeout)
 *  - GoogleGenerativeAIRequestInputError (bad request / invalid key)
 *  - GoogleGenerativeAIResponseError (malformed response)
 *  - Any HTTP 4xx error (client-side, permanent)
 */
function isRetryableError(error: unknown): boolean {
  // SDK HTTP errors — check the status code
  if (error instanceof GoogleGenerativeAIFetchError) {
    return typeof error.status === "number" && RETRYABLE_STATUS_CODES.has(error.status);
  }
  // Generic TypeError is typically a network-level failure (DNS, connection refused, etc.)
  if (error instanceof TypeError) {
    return true;
  }
  return false;
}

/** Native sleep using a Promise. No third-party dependency. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
  const prompt = buildAnalysisPrompt(inputSummary);

  // Retry loop for temporary failures (503, 429, network errors).
  // Permanent errors (bad key, invalid request) are not retried.
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(SCOPE, `Gemini analysis request (attempt ${attempt}/${MAX_RETRIES})`);

      const result = await model.generateContent(prompt, {
        timeout: REQUEST_TIMEOUT_MS,
      });

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

      // Validate insight is a non-empty string
      const insight = validateString(raw.insight, 1000);
      if (insight === null) {
        logger.error(SCOPE, "Gemini insight is not a string");
        return null;
      }

      // Validate and sanitize topics
      const VALID_SEVERITIES = new Set(["low", "medium", "high"]);

      const sanitizedTopics = topics
        .filter((t): t is Record<string, unknown> =>
          typeof t === "object" && t !== null,
        )
        .filter((t) => typeof t.name === "string" && t.name.length > 0)
        .map((t) => ({
          name: (t.name as string).slice(0, 100),
          messageCount: validatePositiveInt(t.messageCount, 1, 10000),
          trending: validateStrictBoolean(t.trending, false),
        }));

      // Validate and sanitize questions
      const sanitizedQuestions = questions
        .filter((q): q is Record<string, unknown> =>
          typeof q === "object" && q !== null,
        )
        .filter(
          (q) =>
            typeof q.text === "string" && q.text.length > 0 &&
            typeof q.author === "string" && q.author.length > 0 &&
            typeof q.channel === "string" && q.channel.length > 0,
        )
        .map((q) => ({
          text: (q.text as string).slice(0, 500),
          author: (q.author as string).slice(0, 50),
          channel: (q.channel as string).slice(0, 50),
          timestamp: typeof q.timestamp === "string" ? q.timestamp : undefined,
          answered: validateStrictBoolean(q.answered, false),
          suggestedAnswer:
            typeof q.suggestedAnswer === "string"
              ? q.suggestedAnswer.slice(0, 500)
              : undefined,
        }));

      // Validate and sanitize important issues — reject entries with unknown severity
      const sanitizedIssues = importantIssues
        .filter((i): i is Record<string, unknown> =>
          typeof i === "object" && i !== null,
        )
        .filter((i) => typeof i.description === "string" && i.description.length > 0)
        .filter((i) => VALID_SEVERITIES.has(i.severity as string))
        .map((i) => ({
          description: (i.description as string).slice(0, 300),
          severity: i.severity as "low" | "medium" | "high",
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
      lastError = error;

      // Non-retryable: timeout, bad request, invalid key, malformed response
      if (error instanceof GoogleGenerativeAIAbortError) {
        logger.error(SCOPE, `Gemini request timed out (attempt ${attempt}/${MAX_RETRIES})`);
        return null; // timeout won't improve on retry
      }
      if (error instanceof Error && error.message.includes("API key")) {
        logger.error(SCOPE, "Invalid Gemini API key");
        return null; // auth errors won't improve on retry
      }
      if (!isRetryableError(error)) {
        logger.error(SCOPE, `Gemini analysis failed with non-retryable error (attempt ${attempt}/${MAX_RETRIES})`, error);
        return null;
      }

      // Retryable: log and back off
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(SCOPE, `Temporary Gemini failure on attempt ${attempt}/${MAX_RETRIES}, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  // All retry attempts exhausted
  logger.error(SCOPE, `Gemini analysis failed after ${MAX_RETRIES} attempts, falling back to raw stats`, lastError);
  return null;
}

/**
 * Generate a health explanation from score metrics.
 *
 * Returns null on any failure.
 */
export async function generateHealthExplanation(
  scoreBreakdown: string,
): Promise<string | null> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
  const prompt = buildHealthPrompt(scoreBreakdown);

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(SCOPE, `Gemini health explanation request (attempt ${attempt}/${MAX_RETRIES})`);

      const result = await model.generateContent(prompt, {
        timeout: REQUEST_TIMEOUT_MS,
      });

      const text = result.response.text();
      if (!text) return null;

      const raw = parseJSON(text);

      const explanation = validateString(raw.explanation, 1000);
      if (explanation === null) {
        logger.error(SCOPE, "Health explanation missing 'explanation' field");
        return null;
      }

      return explanation;
    } catch (error) {
      lastError = error;

      if (error instanceof GoogleGenerativeAIAbortError) {
        logger.error(SCOPE, `Health explanation request timed out (attempt ${attempt}/${MAX_RETRIES})`);
        return null;
      }
      if (error instanceof Error && error.message.includes("API key")) {
        logger.error(SCOPE, "Invalid Gemini API key");
        return null;
      }
      if (!isRetryableError(error)) {
        logger.error(SCOPE, `Health explanation failed with non-retryable error (attempt ${attempt}/${MAX_RETRIES})`, error);
        return null;
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(SCOPE, `Temporary failure on health explanation attempt ${attempt}/${MAX_RETRIES}, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  logger.error(SCOPE, `Health explanation failed after ${MAX_RETRIES} attempts`, lastError);
  return null;
}

// ---------------------------------------------------------------------------
// Validation helpers — original CommunityPulse implementation.
// These enforce strict type checking for AI output fields without
// relying on external validation libraries.
// ---------------------------------------------------------------------------

/**
 * Validate that a value is a string and return it truncated to the
 * given max length. Returns null if the value is not a string or
 * is empty after trimming.
 */
function validateString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * Validate that a value is a strict boolean (actual `true` or `false`).
 * Returns the fallback for any non-boolean value.
 *
 * This prevents `Boolean("false")` from becoming `true` — only
 * actual boolean primitives are accepted.
 */
function validateStrictBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}

/**
 * Validate that a value is a finite positive integer within the
 * given range. Returns the fallback if validation fails.
 */
function validatePositiveInt(
  value: unknown,
  min: number,
  max: number,
): number {
  if (typeof value !== "number") return min;
  if (!Number.isFinite(value)) return min;
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}
