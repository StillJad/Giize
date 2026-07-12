import { ChannelType, SlashCommandBuilder, type Role, type TextChannel } from "discord.js";
import { autoModService, type MatchType } from "../../services/automod/AutoModService.js";
import type { Command } from "../../types/Command.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure Giize AutoMod.")
    .addSubcommand(subcommand =>
      subcommand
        .setName("status")
        .setDescription("Show the current AutoMod settings.")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("enable")
        .setDescription("Enable AutoMod for this server.")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("disable")
        .setDescription("Disable AutoMod without deleting settings.")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("configure")
        .setDescription("Update AutoMod settings.")
        .addBooleanOption(option =>
          option.setName("spam").setDescription("Enable spam and flooding detection.").setRequired(false)
        )
        .addBooleanOption(option =>
          option.setName("duplicate_messages").setDescription("Enable repeated duplicate message detection.").setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName("mention_limit").setDescription("Maximum mentions per message.").setMinValue(0).setMaxValue(20).setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName("emoji_limit").setDescription("Maximum emojis per message.").setMinValue(0).setMaxValue(50).setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName("caps_percentage").setDescription("Maximum uppercase percentage.").setMinValue(0).setMaxValue(100).setRequired(false)
        )
        .addBooleanOption(option =>
          option.setName("invite_links").setDescription("Block external Discord invite links.").setRequired(false)
        )
        .addBooleanOption(option =>
          option.setName("external_links").setDescription("Block external HTTP and HTTPS links.").setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName("timeout_minutes").setDescription("Timeout duration after repeated violations.").setMinValue(0).setMaxValue(1440).setRequired(false)
        )
        .addChannelOption(option =>
          option
            .setName("log_channel")
            .setDescription("Channel where AutoMod actions are logged.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addRoleOption(option =>
          option.setName("exempt_role").setDescription("Role exempt from AutoMod.").setRequired(false)
        )
        .addChannelOption(option =>
          option
            .setName("exempt_channel")
            .setDescription("Channel exempt from AutoMod.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommandGroup(group =>
      group
        .setName("word")
        .setDescription("Manage AutoMod banned words.")
        .addSubcommand(subcommand =>
          subcommand
            .setName("add")
            .setDescription("Add a banned word.")
            .addStringOption(option =>
              option.setName("word").setDescription("Word to block.").setRequired(true).setMaxLength(100)
            )
            .addStringOption(option =>
              option
                .setName("match_type")
                .setDescription("How the word should be matched.")
                .addChoices(
                  { name: "Exact", value: "exact" },
                  { name: "Contains", value: "contains" }
                )
                .setRequired(true)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName("remove")
            .setDescription("Remove a banned word.")
            .addStringOption(option =>
              option.setName("word").setDescription("Word to remove.").setRequired(true).setMaxLength(100)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName("list")
            .setDescription("List banned words.")
        )
    )
    .addSubcommandGroup(group =>
      group
        .setName("domain")
        .setDescription("Manage AutoMod allowed domains.")
        .addSubcommand(subcommand =>
          subcommand
            .setName("allow")
            .setDescription("Allow an external link domain.")
            .addStringOption(option =>
              option.setName("domain").setDescription("Domain to allow.").setRequired(true).setMaxLength(200)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName("remove")
            .setDescription("Remove an allowed domain.")
            .addStringOption(option =>
              option.setName("domain").setDescription("Domain to remove.").setRequired(true).setMaxLength(200)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName("list")
            .setDescription("List allowed domains.")
        )
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (!group && subcommand === "status") {
      await autoModService.status(interaction);
      return;
    }

    if (!group && subcommand === "enable") {
      await autoModService.enable(interaction);
      return;
    }

    if (!group && subcommand === "disable") {
      await autoModService.disable(interaction);
      return;
    }

    if (!group && subcommand === "configure") {
      await autoModService.configure(interaction, {
        spam: interaction.options.getBoolean("spam"),
        duplicateMessages: interaction.options.getBoolean("duplicate_messages"),
        mentionLimit: interaction.options.getInteger("mention_limit"),
        emojiLimit: interaction.options.getInteger("emoji_limit"),
        capsPercentage: interaction.options.getInteger("caps_percentage"),
        inviteLinks: interaction.options.getBoolean("invite_links"),
        externalLinks: interaction.options.getBoolean("external_links"),
        timeoutMinutes: interaction.options.getInteger("timeout_minutes"),
        logChannel: interaction.options.getChannel("log_channel") as TextChannel | null,
        exemptRole: interaction.options.getRole("exempt_role") as Role | null,
        exemptChannel: interaction.options.getChannel("exempt_channel") as TextChannel | null,
      });
      return;
    }

    if (group === "word" && subcommand === "add") {
      await autoModService.addWord(
        interaction,
        interaction.options.getString("word", true),
        interaction.options.getString("match_type", true) as MatchType
      );
      return;
    }

    if (group === "word" && subcommand === "remove") {
      await autoModService.removeWord(interaction, interaction.options.getString("word", true));
      return;
    }

    if (group === "word" && subcommand === "list") {
      await autoModService.listWords(interaction);
      return;
    }

    if (group === "domain" && subcommand === "allow") {
      await autoModService.allowDomain(interaction, interaction.options.getString("domain", true));
      return;
    }

    if (group === "domain" && subcommand === "remove") {
      await autoModService.removeDomain(interaction, interaction.options.getString("domain", true));
      return;
    }

    if (group === "domain" && subcommand === "list") {
      await autoModService.listDomains(interaction);
    }
  },
};
