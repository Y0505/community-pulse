/**
 * interactionCreate – Routes all slash-command and component interactions.
 */

import {
  Events,
  Collection,
  type ChatInputCommandInteraction,
  type Interaction,
  type GuildMember,
  type Message,
} from "discord.js";
import type { BotEvent, Command, CommandContext } from "../types/index.js";
import { handleSetupInteraction } from "../commands/setup.js";
import { logger } from "../utils/logger.js";

/** Lazily populated command registry, keyed by command name. */
let commands: Collection<string, Command>;

function getCommands(): Collection<string, Command> {
  if (commands) return commands;

  // Dynamic import is fine at module scope in ESM
  commands = new Collection<string, Command>();
  return commands;
}

// Accept commands from the command registry (loaded at startup).
export function registerCommands(cmds: Command[]): void {
  commands = new Collection<string, Command>();
  for (const cmd of cmds) {
    commands.set(cmd.data.name, cmd);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap an interaction into our typed CommandContext shape. */
function buildContext(interaction: ChatInputCommandInteraction): CommandContext {
  const member = interaction.member as GuildMember;

  return {
    member,
    guildId: interaction.guildId ?? "",

    async deferReply(ephemeral = false): Promise<void> {
      await interaction.deferReply({ ephemeral });
    },

    async reply(options: {
      content?: string;
      embeds?: import("discord.js").EmbedBuilder[];
      components?: import("discord.js").ActionRowBuilder<
        import("discord.js").ButtonBuilder | import("discord.js").StringSelectMenuBuilder
      >[];
    }): Promise<Message | void> {
      return interaction.reply({
        content: options.content,
        embeds: options.embeds,
        components: options.components,
      }) as unknown as Message;
    },

    async editReply(options: {
      content?: string;
      embeds?: import("discord.js").EmbedBuilder[];
      components?: import("discord.js").ActionRowBuilder<
        import("discord.js").ButtonBuilder | import("discord.js").StringSelectMenuBuilder
      >[];
    }): Promise<Message | void> {
      return interaction.editReply({
        content: options.content,
        embeds: options.embeds,
        components: options.components,
      }) as unknown as Message;
    },

    async ephemeralReply(options: {
      content?: string;
      embeds?: import("discord.js").EmbedBuilder[];
      components?: import("discord.js").ActionRowBuilder<
        import("discord.js").ButtonBuilder | import("discord.js").StringSelectMenuBuilder
      >[];
    }): Promise<Message | void> {
      return interaction.reply({
        content: options.content,
        embeds: options.embeds,
        components: options.components,
        ephemeral: true,
      }) as unknown as Message;
    },
  };
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

const interactionCreateEvent: BotEvent = {
  name: Events.InteractionCreate,
  once: false,

  async execute(...args: unknown[]): Promise<void> {
    const interaction = args[0] as Interaction;

    // ---- Slash commands ----
    if (interaction.isChatInputCommand()) {
      const cmd = getCommands().get(interaction.commandName);
      if (!cmd) {
        logger.warn("InteractionCreate", `Unknown command: ${interaction.commandName}`);
        return;
      }

      try {
        const ctx = buildContext(interaction);
        await cmd.execute(ctx);
      } catch (error) {
        logger.error("InteractionCreate", `Error executing /${interaction.commandName}`, error);

        const replyPayload = {
          content: "⚠️ Something went wrong while running this command.",
          ephemeral: true as const,
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyPayload).catch(() => undefined);
        } else {
          await interaction.reply(replyPayload).catch(() => undefined);
        }
      }
      return;
    }

    // ---- Button, select menu, modal interactions ----
    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isModalSubmit()
    ) {
      // Route setup-related component interactions
      if (interaction.customId.startsWith("setup_")) {
        try {
          await handleSetupInteraction(interaction);
        } catch (error) {
          logger.error("InteractionCreate", `Setup interaction error: ${interaction.customId}`, error);

          const payload = {
            content: "⚠️ An error occurred during setup. Please try again.",
          };

          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ ...payload, ephemeral: true }).catch(() => undefined);
          } else if (interaction.isModalSubmit()) {
            await interaction.reply({ ...payload, ephemeral: true }).catch(() => undefined);
          } else {
            await interaction.update(payload).catch(() => undefined);
          }
        }
      }
      return;
    }
  },
};

export default interactionCreateEvent;
