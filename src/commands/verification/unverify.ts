import { SlashCommandBuilder } from "discord.js";
import { config } from "../../config/config.js";
import { verificationService } from "../../services/verification/VerificationService.js";
import type { Command } from "../../types/Command.js";
import { caseService } from "../../services/moderation/CaseService.js";
import { glurpsEmbed } from "../../utils/embeds.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("unverify")
    .setDescription("Remove a member’s Minecraft verification.")
    .addUserOption(o=>o.setName("user").setDescription("Member to unverify; defaults to you"))
    .addStringOption(o=>o.setName("reason").setDescription("Reason for removal").setMaxLength(500))
    .addBooleanOption(o=>o.setName("force").setDescription("Allow removal while signed up for an active event")),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: 64,
      });
      return;
    }

    await interaction.deferReply({flags:64});
    const user = interaction.options.getUser("user") ?? interaction.user;
    const member = await interaction.guild!.members.fetch(user.id).catch(()=>null);
    if(!member){await interaction.editReply("That member is not in this server.");return;}
    const reason=interaction.options.getString("reason") ?? "Administrator removed verification";

    if (!interaction.options.getBoolean("force") && verificationService.hasActiveEventParticipation(interaction.guild!.id, member.id)) {
      await interaction.editReply({
        content: "This member cannot unverify while they are signed up for an active event. Use force:true to override; their event application will remain unchanged.",
      });
      return;
    }

    const previous=verificationService.getStoredAccounts(interaction.guild!.id,member.id);
    await verificationService.unverifyMember(interaction.guild!, member);
    caseService.record(interaction.guild!.id,member.id,interaction.user.id,"unverify",`${reason}. Previous: ${JSON.stringify(previous)}`);

    const logChannelId = config.verificationLogsChannelId;
    if (logChannelId) {
      const channel = await interaction.guild!.channels.fetch(logChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send({
          embeds: [
            glurpsEmbed()
              .setTitle("❌ Member Unverified")
              .addFields(
                { name: "Discord", value: `${member}`, inline: true },
                { name: "User ID", value: member.id, inline: true },
                { name: "Removed by", value: `${interaction.user}`, inline:true },
                { name: "Reason", value: reason }
              ),
          ],
        });
      }
    }

    await interaction.editReply({
      content: `✅ <@${member.id}> has been unverified.`,
      allowedMentions:{parse:[]},
    });
  },
};
