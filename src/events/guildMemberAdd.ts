/**
 * guildMemberAdd – Sends a welcome message when a new member joins.
 *
 * Only fires for servers that have completed the /setup wizard. The message
 * is sent to the channel the administrator selected during setup.
 */

import {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type GuildMember,
} from "discord.js";
import type { BotEvent } from "../types/index.js";
import { guildConfigs, COMMUNITY_TYPE_EMOJI, COMMUNITY_TYPE_LABELS } from "../types/index.js";
import { logger } from "../utils/logger.js";

const guildMemberAddEvent: BotEvent = {
  name: Events.GuildMemberAdd,
  once: false,

  async execute(...args: unknown[]): Promise<void> {
    const member = args[0] as GuildMember;

    const config = guildConfigs.get(member.guild.id);
    if (!config || !config.isSetUp) return;

    const channel = member.guild.channels.cache.get(config.welcomeChannelId);
    if (!channel?.isTextBased()) {
      logger.warn(
        "GuildMemberAdd",
        `Welcome channel ${config.welcomeChannelId} not found or not text-based in guild ${member.guild.id}`,
      );
      return;
    }

    const communityEmoji = COMMUNITY_TYPE_EMOJI[config.communityType] ?? "🌐";
    const communityLabel = COMMUNITY_TYPE_LABELS[config.communityType] ?? "Community";

    const embed = new EmbedBuilder()
      .setTitle(`${communityEmoji} Welcome to the community!`)
      .setDescription(
        `Hey ${member}, glad you're here!\n\n` +
          "You've just joined a **" + communityLabel + "** community. " +
          "Here's how to get started:",
      )
      .addFields(
        {
          name: "🚀 Getting Started",
          value: "Check out the channels and introduce yourself.",
          inline: true,
        },
        {
          name: "📚 Resources",
          value: "Look for pinned messages in each channel for useful links.",
          inline: true,
        },
        {
          name: "❓ Ask a Question",
          value: "No question is too small — just ask!",
          inline: true,
        },
      )
      .setColor(0x57F287)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setFooter({
        text: `Member #${member.guild.memberCount} · ${member.guild.name}`,
      })
      .setTimestamp();

    // Community description as a second embed if available
    const descriptionEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setDescription(
        `> ${config.communityDescription.slice(0, 200)}` +
          (config.communityDescription.length > 200 ? "…" : ""),
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`welcome_rules_${member.guild.id}`)
        .setLabel("📋 Rules")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`welcome_chat_${member.guild.id}`)
        .setLabel("💬 Introduce Yourself")
        .setStyle(ButtonStyle.Primary),
    );

    try {
      await channel.send({
        content: `<@${member.id}>`,
        embeds: [embed, descriptionEmbed],
        components: [buttons],
      });
      logger.info(
        "GuildMemberAdd",
        `Sent welcome message to ${member.user.tag} in guild ${member.guild.id}`,
      );
    } catch (error) {
      logger.error(
        "GuildMemberAdd",
        `Failed to send welcome message in guild ${member.guild.id}`,
        error,
      );
    }
  },
};

export default guildMemberAddEvent;
