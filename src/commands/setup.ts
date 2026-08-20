/**
 * /setup – Interactive onboarding wizard.
 *
 * Guides an administrator through a multi-step flow to configure their
 * server with CommunityPulse. Uses buttons, select menus, and modals for
 * a polished, SaaS-like experience.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  type TextChannel,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import type { Command, CommunityType, SetupState } from "../types/index.js";
import {
  COMMUNITY_TYPE_LABELS,
  COMMUNITY_TYPE_EMOJI,
  guildConfigs,
  activeSetupSessions,
  setupSessionKey,
} from "../types/index.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCOPE = "Setup";

function stopSession(state: SetupState): void {
  state.cleanup?.();
  activeSetupSessions.delete(setupSessionKey(state.guildId, state.userId));
}

/** Create the introductory embed with start / cancel buttons. */
function buildIntroEmbed(): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<ButtonBuilder>;
} {
  const embed = new EmbedBuilder()
    .setTitle("👋 Welcome to CommunityPulse")
    .setDescription(
      "Let's set up your community in less than a minute.\n\n" +
        "CommunityPulse will help you understand conversations, " +
        "onboard members, and automate repetitive community tasks.",
    )
    .setColor(0x5865F2)
    .setFooter({ text: "This setup is only visible to administrators." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("setup_start")
      .setLabel("Start Setup")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("setup_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, row };
}

/** Build the community-type select menu embed. */
function buildTypeSelectEmbed(): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<StringSelectMenuBuilder>;
} {
  const embed = new EmbedBuilder()
    .setTitle("Step 1 · Community Type")
    .setDescription(
      "Select the option that best describes your community.",
    )
    .setColor(0x5865F2);

  const options = (Object.keys(COMMUNITY_TYPE_LABELS) as CommunityType[]).map(
    (key) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(COMMUNITY_TYPE_LABELS[key]!)
        .setValue(key)
        .setEmoji(COMMUNITY_TYPE_EMOJI[key]!),
  );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("setup_select_type")
      .setPlaceholder("Choose a community type…")
      .addOptions(options),
  );

  return { embed, row };
}

/** Build the channel-select embed. */
function buildChannelSelectEmbed(): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<StringSelectMenuBuilder>;
} {
  const embed = new EmbedBuilder()
    .setTitle("Step 2 · Welcome Channel")
    .setDescription(
      "Pick the channel where new members will receive a welcome message.",
    )
    .setColor(0x5865F2);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("setup_select_channel")
      .setPlaceholder("Select a channel…"),
  );

  return { embed, row };
}

/** Show a modal asking for the community description. */
function buildDescriptionModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("setup_enter_description")
    .setTitle("Community Description")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description_input")
          .setLabel("Short community description or rules")
          .setPlaceholder(
            "e.g. Be respectful, share knowledge, and have fun.",
          )
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(500),
      ),
    );
}

/** Build the review embed before saving. */
function buildReviewEmbed(state: SetupState): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<ButtonBuilder>;
} {
  const typeLabel =
    state.communityType
      ? `${COMMUNITY_TYPE_EMOJI[state.communityType]} ${COMMUNITY_TYPE_LABELS[state.communityType]}`
      : "Not set";

  const embed = new EmbedBuilder()
    .setTitle("Step 4 · Review & Confirm")
    .setDescription("Please review your configuration below.")
    .addFields(
      { name: "Community Type", value: typeLabel, inline: true },
      { name: "Welcome Channel", value: `<#${state.welcomeChannelId}>`, inline: true },
      { name: "Description", value: state.communityDescription ?? "—" },
    )
    .setColor(0x5865F2);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("setup_confirm")
      .setLabel("Save & Activate")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("setup_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  return { embed, row };
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

const setupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure CommunityPulse for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(context) {
    const { member, guildId } = context;
    const key = setupSessionKey(guildId, member.id);

    // Prevent duplicate sessions
    if (activeSetupSessions.has(key)) {
      await context.ephemeralReply({
        content: "⚠️ You already have an active setup session.",
      });
      return;
    }

    const { embed, row } = buildIntroEmbed();

    // Find a suitable text channel for the setup state
    const fallbackChannel = member.guild.channels.cache.find(
      (ch): ch is TextChannel =>
        ch.type === ChannelType.GuildText &&
        ch.permissionsFor(member.id)?.has(PermissionFlagsBits.SendMessages) === true,
    ) ?? member.guild.channels.cache.first() as TextChannel;

    const state: SetupState = {
      guildId,
      userId: member.id,
      step: "intro",
      textChannel: fallbackChannel,
    };
    activeSetupSessions.set(key, state);

    const message = await context.ephemeralReply({
      embeds: [embed],
      components: [row],
    });

    if (message) {
      state.message = message;
    }
  },
};

// ---------------------------------------------------------------------------
// Component interaction handlers – exported for the interactionCreate event
// ---------------------------------------------------------------------------

/** Handle button / select / modal interactions related to setup. */
export async function handleSetupInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
): Promise<void> {
  const { customId, user } = interaction;
  const guildId = interaction.guildId;
  if (!guildId) return;

  const key = setupSessionKey(guildId, user.id);
  const state = activeSetupSessions.get(key);

  // --- Intro buttons ---
  if (customId === "setup_start") {
    if (!state) return;
    if (!interaction.isButton()) return;
    state.step = "select_type";

    const { embed, row } = buildTypeSelectEmbed();
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  if (customId === "setup_cancel") {
    if (state) stopSession(state);
    if (!interaction.isButton()) return;
    await interaction.update({
      content: "Setup cancelled.",
      embeds: [],
      components: [],
    });
    return;
  }

  // --- Community type select ---
  if (customId === "setup_select_type") {
    if (!state) return;
    if (!interaction.isStringSelectMenu()) return;
    state.communityType = interaction.values[0] as CommunityType;
    state.step = "select_channel";

    const { embed, row } = buildChannelSelectEmbed();
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  // --- Channel select ---
  if (customId === "setup_select_channel") {
    if (!state) return;
    if (!interaction.isStringSelectMenu()) return;
    state.welcomeChannelId = interaction.values[0]!;
    state.step = "enter_description";

    const modal = buildDescriptionModal();
    await interaction.showModal(modal);
    return;
  }

  // --- Modal submit (description) ---
  if (customId === "setup_enter_description") {
    if (!state) return;
    if (!interaction.isModalSubmit()) return;

    const descInput = interaction.fields.getTextInputValue("description_input");
    state.communityDescription = descInput;
    state.step = "review";

    const { embed, row } = buildReviewEmbed(state);
    // Modals can't use update(), use reply with ephemeral instead
    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
    return;
  }

  // --- Review – confirm ---
  if (customId === "setup_confirm") {
    if (!state) return;
    if (!interaction.isButton()) return;

    guildConfigs.set(guildId, {
      guildId,
      communityType: state.communityType!,
      welcomeChannelId: state.welcomeChannelId!,
      communityDescription: state.communityDescription!,
      isSetUp: true,
    });

    stopSession(state);

    const embed = new EmbedBuilder()
      .setTitle("✅ Setup Complete")
      .setDescription(
        "CommunityPulse is now configured for this server.\n\n" +
          "New members will receive a welcome message in " +
          `<#${state.welcomeChannelId}>.`,
      )
      .setColor(0x57f287)
      .setTimestamp();

    await interaction.update({
      embeds: [embed],
      components: [],
    });

    logger.info(SCOPE, `Setup completed for guild ${guildId}`);
    return;
  }
}

export default setupCommand;
