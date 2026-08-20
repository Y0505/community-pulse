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

export const env = {
  DISCORD_TOKEN: requireEnv("DISCORD_TOKEN"),
  DISCORD_CLIENT_ID: requireEnv("DISCORD_CLIENT_ID"),
  DISCORD_GUILD_ID: process.env["DISCORD_GUILD_ID"] ?? "",
} as const;
