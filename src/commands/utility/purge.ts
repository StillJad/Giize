import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { purgeService } from "../../services/purge/PurgeService.js";
import type { Command } from "../../types/Command.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Preview and delete matching messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option.setName("amount").setDescription("Number of matching messages to delete.").setRequired(true).setMinValue(1).setMaxValue(1000)
    )
    .addUserOption(option =>
      option.setName("user").setDescription("Only delete messages from this user.").setRequired(false)
    )
    .addStringOption(option =>
      option.setName("contains").setDescription("Only delete messages containing this text.").setRequired(false).setMaxLength(200)
    )
    .addStringOption(option =>
      option.setName("startswith").setDescription("Only delete messages starting with this text.").setRequired(false).setMaxLength(200)
    )
    .addStringOption(option =>
      option.setName("endswith").setDescription("Only delete messages ending with this text.").setRequired(false).setMaxLength(200)
    )
    .addStringOption(option =>
      option.setName("excludes").setDescription("Only delete messages not containing this text.").setRequired(false).setMaxLength(200)
    )
    .addBooleanOption(option => option.setName("bots").setDescription("Only delete bot messages.").setRequired(false))
    .addBooleanOption(option => option.setName("embeds").setDescription("Only delete messages with embeds.").setRequired(false))
    .addBooleanOption(option => option.setName("uploads").setDescription("Only delete messages with uploads.").setRequired(false))
    .addBooleanOption(option => option.setName("links").setDescription("Only delete messages with links.").setRequired(false))
    .addBooleanOption(option => option.setName("invites").setDescription("Only delete messages with Discord invites.").setRequired(false))
    .addBooleanOption(option => option.setName("stickers").setDescription("Only delete messages with stickers.").setRequired(false))
    .addBooleanOption(option => option.setName("gifs").setDescription("Only delete GIF messages.").setRequired(false))
    .addBooleanOption(option => option.setName("polls").setDescription("Only delete poll messages.").setRequired(false))
    .addBooleanOption(option => option.setName("voice_notes").setDescription("Only delete voice note messages.").setRequired(false))
    .addBooleanOption(option => option.setName("system").setDescription("Only delete Discord system messages.").setRequired(false))
    .addBooleanOption(option => option.setName("commands").setDescription("Only delete command invocation messages.").setRequired(false))
    .addBooleanOption(option => option.setName("any").setDescription("Match everything and allow purge inside ticket channels.").setRequired(false)),

  async execute(interaction) {
    await purgeService.preview(interaction, {
      amount: interaction.options.getInteger("amount", true),
      user: interaction.options.getUser("user"),
      contains: interaction.options.getString("contains"),
      startswith: interaction.options.getString("startswith"),
      endswith: interaction.options.getString("endswith"),
      excludes: interaction.options.getString("excludes"),
      bots: interaction.options.getBoolean("bots"),
      embeds: interaction.options.getBoolean("embeds"),
      uploads: interaction.options.getBoolean("uploads"),
      links: interaction.options.getBoolean("links"),
      invites: interaction.options.getBoolean("invites"),
      stickers: interaction.options.getBoolean("stickers"),
      gifs: interaction.options.getBoolean("gifs"),
      polls: interaction.options.getBoolean("polls"),
      voiceNotes: interaction.options.getBoolean("voice_notes"),
      system: interaction.options.getBoolean("system"),
      commands: interaction.options.getBoolean("commands"),
      any: interaction.options.getBoolean("any"),
    });
  },
};
