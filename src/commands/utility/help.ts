import { GuildMember, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { config } from "../../config/config.js";
import type { Command } from "../../types/Command.js";
import { giizeEmbed } from "../../utils/embeds.js";

const developerRoleId = "1518110330377736323";

function canManage(member: unknown) {
  return member instanceof GuildMember && (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.roles.cache.has(config.staffRoleId) ||
    member.roles.cache.has(developerRoleId)
  );
}

function canUseAutoMod(member: unknown) {
  return member instanceof GuildMember && (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.roles.cache.has(developerRoleId)
  );
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows Giize Bot commands."),
  async execute(interaction) {
    const management = canManage(interaction.member);
    const autoMod = canUseAutoMod(interaction.member);

    const embed = giizeEmbed()
      .setTitle("Giize Bot Help")
      .setDescription("Your Minecraft event server assistant.")
      .addFields(
        { name: "General", value: "`/help` `/ping`" },
        { name: "Minecraft", value: "`/server` `/status`" },
        { name: "Verification", value: "`/verify` `/unverify`" },
        { name: "Tickets", value: management ? "`/ticket open` `/ticketstaff` `/ticketpanel send`" : "`/ticket open`" },
        { name: "Events", value: management ? "`/event` `/participants`" : "`/event list` `/participants`" },
        { name: "Moderation", value: management ? "`/moderation` `/channel` `/purge`" : "Available to staff only." },
        { name: "AutoMod", value: autoMod ? "`/automod status` `/automod enable` `/automod disable` `/automod configure`" : "Available to administrators and developers." },
        { name: "Welcome", value: interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ? "`/welcome setup` `/welcome preview` `/welcome enable` `/welcome disable` `/welcome refresh`" : "`/welcome preview`" }
      );

    await interaction.reply({ embeds: [embed], flags: 64 });
  }
};
