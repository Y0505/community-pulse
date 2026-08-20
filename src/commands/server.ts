/**
 * /server – Display information about the current Discord server.
 *
 * Renders a clean embed with key guild metadata.
 */

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import type { Command } from "../types/index.js";

const serverCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("Show information about this server."),

  async execute(context) {
    const { member, guildId } = context;
    const guild = member.guild;

    const createdTimestamp = guild.createdTimestamp;
    const owner = await guild.fetchOwner().catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setColor(0x5865F2)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: "Server ID", value: guildId, inline: true },
        {
          name: "Created",
          value: `<t:${Math.floor(createdTimestamp / 1000)}:R>`,
          inline: true,
        },
        {
          name: "Owner",
          value: owner?.user?.tag ?? "Unknown",
          inline: true,
        },
        {
          name: "Members",
          value: String(guild.memberCount),
          inline: true,
        },
        {
          name: "Channels",
          value: String(guild.channels.cache.size),
          inline: true,
        },
      )
      .setTimestamp();

    await context.reply({ embeds: [embed] });
  },
};

export default serverCommand;
