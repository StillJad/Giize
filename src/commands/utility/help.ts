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
    const embed=glurpsEmbed().setTitle('Event Bot Help').setDescription('Open support tickets and apply for events using their panel buttons.').addFields({name:'Public commands',value:'`/verify minecraft_username platform` `/level [user]` `/leaderboard` `/help` `/ping` `/server` `/status` `/participants`'});
    if(admin) embed.addFields({name:'Events',value:'`/event` `/events` `/applications`'},{name:'Tickets',value:'`/panel` `/panel-edit` `/ticket` `/close` `/delete` `/reopen` `/pin` `/unpin`'},{name:'Management',value:'`/colorpicker` `/lobbymusic` `/levels` `/automod` `/cases` `/moderation` `/adminmod` `/channel` `/purge` `/forceverify` `/verification` `/verify-panel` `/unverify`'});

    await interaction.reply({ embeds: [embed], flags: 64 });
  }
};
