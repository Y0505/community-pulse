/**
 * Environment configuration.
 *
 * Validates required variables at startup and exports them as typed constants.
 * Secrets are never logged.
 */

import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue = ""): string {
  return process.env[name]?.trim() ?? defaultValue;
}

export const env = {
  DISCORD_TOKEN: requireEnv("DISCORD_TOKEN"),
  DISCORD_CLIENT_ID: requireEnv("DISCORD_CLIENT_ID"),
  DISCORD_GUILD_ID: optionalEnv("DISCORD_GUILD_ID"),
  GEMINI_API_KEY: optionalEnv("GEMINI_API_KEY"),
  COMMUNITY_ANALYSIS_HOURS: parseInt(optionalEnv("COMMUNITY_ANALYSIS_HOURS", "24"), 10),
} as const;

/** Validate that the Gemini API key is present. Called by AI commands at runtime. */
export function requireGeminiKey(): string {
  if (!env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not configured. " +
        "AI-powered commands require a valid Gemini API key. " +
        "Add GEMINI_API_KEY to your .env file.",
    );
  }
  return env.GEMINI_API_KEY;
}

/** Validate that COMMUNITY_ANALYSIS_HOURS is a reasonable positive integer. */
export function getAnalysisHours(): number {
  const hours = env.COMMUNITY_ANALYSIS_HOURS;
  if (Number.isNaN(hours) || hours < 1 || hours > 168) {
    return 24;
  }
  return hours;
}
