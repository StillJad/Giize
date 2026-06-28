import { Events, GuildMember } from "discord.js";
import { client } from "../client.js";
import { giizeEmbed } from "../utils/embeds.js";

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "verify_no") {
    await interaction.update({
      content: "❌ Verification cancelled.",
      embeds: [],
      components: [],
    });
    return;
  }

  if (!interaction.customId.startsWith("verify_yes:")) return;

  const username = interaction.customId.substring("verify_yes:".length);

  try {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "This button can only be used in a server.",
        flags: 64,
      });
      return;
    }

    const guild = interaction.guild!;

    const member = interaction.member as GuildMember;

    if (member.manageable) {
      await member.setNickname(username);
    }

    const roleId = process.env.VERIFIED_ROLE_ID;

    if (roleId) {
      const role = guild.roles.cache.get(roleId);

      if (role) {
        await member.roles.add(role, "Verified via /verify");
      }
    }

    const logChannelId = process.env.VERIFICATION_LOG_CHANNEL_ID;

    if (logChannelId) {
      const channel = guild.channels.cache.get(logChannelId);

      if (channel?.isTextBased()) {
        await channel.send({
          embeds: [
            giizeEmbed()
              .setTitle("✅ Member Verified")
              .addFields(
                {
                  name: "Discord",
                  value: `${member}`,
                  inline: true,
                },
                {
                  name: "Minecraft",
                  value: username,
                  inline: true,
                }
              )
              .setTimestamp(),
          ],
        });
      }
    }

    await interaction.update({
      content: `✅ Successfully verified as **${username}**.`,
      embeds: [],
      components: [],
    });
  } catch (err) {
    console.error(err);

    await interaction.reply({
      content:
        "❌ I couldn't change your nickname. Make sure my role is above yours and I have the **Manage Nicknames** permission.",
      flags: 64,
    });
  }
});