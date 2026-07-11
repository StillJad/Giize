import { SlashCommandBuilder, GuildMember } from "discord.js";
import { config } from "../../config/config.js";
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
    const roleId = config.verifyRoleId;

    if (roleId) {
      const role = interaction.guild!.roles.cache.get(roleId);

      if (role && member.roles.cache.has(roleId)) {
        await member.roles.remove(role, "Unverified via /unverify");
      }
    }

    if (member.manageable) {
      await member.setNickname(null, "Unverified via /unverify").catch(() => {});
    }

    const logChannelId = config.verificationLogsChannelId;

    if (logChannelId) {
      const channel = interaction.guild!.channels.cache.get(logChannelId);

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
