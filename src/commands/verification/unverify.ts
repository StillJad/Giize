import { SlashCommandBuilder, GuildMember } from "discord.js";
import { config } from "../../config/config.js";
import { verificationService } from "../../services/verification/VerificationService.js";
import type { Command } from "../../types/Command.js";
import { giizeEmbed } from "../../utils/embeds.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("unverify")
    .setDescription("Remove your verification."),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: 64,
      });
      return;
    }

    const member = interaction.member as GuildMember;

    if (verificationService.hasActiveEventParticipation(interaction.guild!.id, member.id)) {
      await interaction.reply({
        content: "You cannot unverify while you are signed up for an active event. You can unverify after the event ends.",
        flags: 64,
      });
      return;
    }

    await verificationService.unverifyMember(interaction.guild!, member);

    const logChannelId = config.verificationLogsChannelId;
    if (logChannelId) {
      const channel = await interaction.guild!.channels.fetch(logChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send({
          embeds: [
            giizeEmbed()
              .setTitle("❌ Member Unverified")
              .addFields(
                { name: "Discord", value: `${member}`, inline: true },
                { name: "User ID", value: member.id, inline: true }
              ),
          ],
        });
      }
    }

    await interaction.reply({
      content: "✅ You have been unverified.",
      flags: 64,
    });
  },
};
