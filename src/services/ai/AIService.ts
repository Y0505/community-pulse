/**
 * AIService – Public interface for AI-powered analysis.
 *
 * Commands interact with this service rather than calling the Gemini
 * provider directly. This keeps the Discord layer decoupled from the
 * AI provider and makes it straightforward to swap providers later.
 */

import { analyzeCommunity, generateHealthExplanation } from "./GeminiProvider.js";
import type { GeminiAnalysisResponse } from "./types.js";

/**
 * Analyze community messages. Returns null if the AI is unavailable
 * or the response is malformed.
 */
export async function analyzeMessages(
  inputSummary: string,
): Promise<GeminiAnalysisResponse | null> {
  return analyzeCommunity(inputSummary);
}

/**
 * Generate a human-readable health explanation from score data.
 * Returns null on failure.
 */
export async function explainHealth(scoreBreakdown: string): Promise<string | null> {
  return generateHealthExplanation(scoreBreakdown);
}
