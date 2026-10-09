import { ChannelType, SlashCommandBuilder, type TextChannel } from "discord.js";
import { autoModService } from "../../services/automod/AutoModService.js";
import type { Command } from "../../types/Command.js";

export const command: Command = {
  data: new SlashCommandBuilder().setName("automod").setDescription("Manage automatic moderation.")
    .addSubcommand(s => s.setName("status").setDescription("Show active filters and settings."))
    .addSubcommand(s => s.setName("enable").setDescription("Turn AutoMod on."))
    .addSubcommand(s => s.setName("disable").setDescription("Turn AutoMod off."))
    .addSubcommand(s => s.setName("configure").setDescription("Change filters, limits, and logging.")
      .addBooleanOption(o => o.setName("spam").setDescription("Filter rapid message spam."))
      .addBooleanOption(o => o.setName("duplicates").setDescription("Filter repeated messages."))
      .addBooleanOption(o => o.setName("invites").setDescription("Filter other servers' invites."))
      .addBooleanOption(o => o.setName("links").setDescription("Allow only approved domains."))
      .addIntegerOption(o => o.setName("mention_limit").setDescription("Maximum mentions per message.").setMinValue(1).setMaxValue(100))
      .addIntegerOption(o => o.setName("emoji_limit").setDescription("Maximum emojis per message.").setMinValue(1).setMaxValue(100))
      .addIntegerOption(o => o.setName("timeout_minutes").setDescription("Timeout duration; 0 disables timeouts.").setMinValue(0).setMaxValue(40320))
      .addChannelOption(o => o.setName("logs").setDescription("AutoMod log channel.").addChannelTypes(ChannelType.GuildText))
      .addRoleOption(o => o.setName("exempt_role").setDescription("Role exempt from filtering."))
      .addChannelOption(o => o.setName("exempt_channel").setDescription("Channel exempt from filtering.").addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName("word-add").setDescription("Block a word or phrase.")
      .addStringOption(o => o.setName("word").setDescription("Word or phrase.").setRequired(true).setMaxLength(100))
      .addStringOption(o => o.setName("match").setDescription("How to match.").addChoices({name:"Exact word",value:"exact"},{name:"Contains",value:"contains"})))
    .addSubcommand(s => s.setName("word-remove").setDescription("Remove a blocked word.")
      .addStringOption(o => o.setName("word").setDescription("Word or phrase.").setRequired(true)))
    .addSubcommand(s => s.setName("words").setDescription("List blocked words."))
    .addSubcommand(s => s.setName("domain-add").setDescription("Allow a domain through link filtering.")
      .addStringOption(o => o.setName("domain").setDescription("Domain, e.g. youtube.com.").setRequired(true)))
    .addSubcommand(s => s.setName("domain-remove").setDescription("Remove an approved domain.")
      .addStringOption(o => o.setName("domain").setDescription("Domain.").setRequired(true)))
    .addSubcommand(s => s.setName("domains").setDescription("List approved domains.")),
  async execute(interaction) {
    const options = interaction.options;
    switch (options.getSubcommand()) {
      case "status": return autoModService.status(interaction);
      case "enable": return autoModService.enable(interaction);
      case "disable": return autoModService.disable(interaction);
      case "configure": return autoModService.configure(interaction, {
        spam: options.getBoolean("spam"), duplicateMessages: options.getBoolean("duplicates"),
        inviteLinks: options.getBoolean("invites"), externalLinks: options.getBoolean("links"),
        mentionLimit: options.getInteger("mention_limit"), emojiLimit: options.getInteger("emoji_limit"),
        timeoutMinutes: options.getInteger("timeout_minutes"), logChannel: options.getChannel("logs") as TextChannel | null,
        exemptRole: options.getRole("exempt_role") as import("discord.js").Role | null,
        exemptChannel: options.getChannel("exempt_channel") as TextChannel | null,
      });
      case "word-add": return autoModService.addWord(interaction, options.getString("word",true), options.getString("match") === "contains" ? "contains" : "exact");
      case "word-remove": return autoModService.removeWord(interaction, options.getString("word",true));
      case "words": return autoModService.listWords(interaction);
      case "domain-add": return autoModService.allowDomain(interaction, options.getString("domain",true));
      case "domain-remove": return autoModService.removeDomain(interaction, options.getString("domain",true));
      case "domains": return autoModService.listDomains(interaction);
    }
  },
};
