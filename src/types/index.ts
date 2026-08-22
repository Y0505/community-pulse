/**
 * Shared type definitions for CommunityPulse.
 */

import type {
  ActionRowBuilder,
  ButtonBuilder,
  GuildMember,
  Message,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";

/** A slash command that the bot can register and execute. */
export interface Command {
  /** The slash command definition sent to the Discord API. */
  data: SlashCommandBuilder;
  /** Execute the command when a member invokes it. */
  execute: (context: CommandContext) => Promise<void>;
}

/** Runtime context passed to every command handler. */
export interface CommandContext {
  /** The guild member who invoked the command. */
  member: GuildMember;
  /** The guild ID where the command was invoked. */
  guildId: string;
  /** Defer the reply for long-running operations (shows 'thinking…'). */
  deferReply: (ephemeral?: boolean) => Promise<void>;
  /** Reply helpers for the interaction. */
  reply: (options: InteractionReplyOptions) => Promise<Message | void>;
  /** Edit the original deferred reply. */
  editReply: (options: InteractionEditReplyOptions) => Promise<Message | void>;
  /** Send an ephemeral reply that only the invoker can see. */
  ephemeralReply: (options: InteractionReplyOptions) => Promise<Message | void>;
}

/** Normalised options for a command reply. */
export interface InteractionReplyOptions {
  content?: string;
  embeds?: import("discord.js").EmbedBuilder[];
  components?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
  ephemeral?: boolean;
}

/** Normalised options for editing a deferred reply. */
export interface InteractionEditReplyOptions {
  content?: string;
  embeds?: import("discord.js").EmbedBuilder[];
  components?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

/** Serializable guild configuration stored per server. */
export interface GuildConfig {
  guildId: string;
  communityType: CommunityType;
  welcomeChannelId: string;
  communityDescription: string;
  isSetUp: boolean;
}

/** Supported community archetypes. */
export type CommunityType =
  | "saas"
  | "developer"
  | "gaming"
  | "education"
  | "creator"
  | "web3"
  | "other";

/** Pretty labels for community types shown in Discord UI. */
export const COMMUNITY_TYPE_LABELS: Record<CommunityType, string> = {
  saas: "SaaS / Startup",
  developer: "Developer",
  gaming: "Gaming",
  education: "Education",
  creator: "Creator",
  web3: "Web3",
  other: "Other",
};

/** Emoji icons for each community type. */
export const COMMUNITY_TYPE_EMOJI: Record<CommunityType, string> = {
  saas: "🚀",
  developer: "💻",
  gaming: "🎮",
  education: "📚",
  creator: "🎨",
  web3: "🔗",
  other: "🌐",
};

/** In-memory cache of guild configurations keyed by guild ID. */
export const guildConfigs = new Map<string, GuildConfig>();

// ---------------------------------------------------------------------------
// Setup-flow state tracking
// ---------------------------------------------------------------------------

/** The steps inside the interactive setup wizard. */
export type SetupStep =
  | "intro"
  | "select_type"
  | "select_channel"
  | "enter_description"
  | "review"
  | "complete";

/** Tracks a user's progress through the multi-step setup wizard. */
export interface SetupState {
  guildId: string;
  userId: string;
  step: SetupStep;
  communityType?: CommunityType;
  welcomeChannelId?: string;
  communityDescription?: string;
  message?: Message;
  /** References the channel the setup was triggered from. */
  textChannel: TextChannel;
  /** Cleanup callbacks to remove old components. */
  cleanup?: () => void;
}

/** Active setup sessions keyed by "guildId:userId". */
export const activeSetupSessions = new Map<string, SetupState>();

/** Helper to build the session key for setup tracking. */
export function setupSessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

/** Event handler definition. */
export interface BotEvent {
  name: string;
  once?: boolean;
  execute: (...args: unknown[]) => Promise<void>;
}

export type { TextChannel, GuildMember, Message };
