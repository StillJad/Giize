import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types/Command.js";
import { glurpsEmbed } from "../../utils/embeds.js";
import { hasStaffRole, isAdministrator } from "../../utils/permissions.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows Event Bot commands."),
  async execute(interaction) {
    const admin = isAdministrator(interaction.member);
    const staff = hasStaffRole(interaction.member);
    const management = admin || staff;
    const eventCommands = admin ? "`/events list` `/participants` `/event`" : "`/events list` `/participants`";
    const ticketCommands = [
      "`/ticket open`",
      staff || admin ? "`/ticketstaff`" : "",
      admin ? "`/ticketpanel send`" : "",
    ].filter(Boolean).join(" ");
    const moderationCommands = [
      management ? "`/moderation`" : "",
      admin ? "`/adminmod` `/channel` `/purge`" : "",
    ].filter(Boolean).join(" ");

    const embed = glurpsEmbed()
      .setTitle("Event Bot Help")
      .setDescription("Your Minecraft event server assistant.")
      .addFields(
        { name: "General", value: "`/help` `/ping`" },
        { name: "Minecraft", value: "`/server` `/status`" },
        { name: "Verification", value: "`/verify` `/unverify`" },
        { name: "Tickets", value: ticketCommands },
        { name: "Events", value: eventCommands },
        { name: "Moderation", value: moderationCommands || "Available to staff only." },
        { name: "Management", value: "`/automod` `/cases` `/applications` `/levels`" },
        { name: "Support Tickets", value: "`/panel id:support` · Open Ticket manages claiming, reopening, priorities, transcripts and inactivity closing." }
      );

    await interaction.reply({ embeds: [embed], flags: 64 });
  }
};
