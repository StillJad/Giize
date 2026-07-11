import type {
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  MessagePayload,
  RepliableInteraction,
} from "discord.js";

type ReplyOptions = string | MessagePayload | InteractionReplyOptions;
type EditOptions = string | MessagePayload | InteractionEditReplyOptions;

export async function safeReply(interaction: RepliableInteraction, options: ReplyOptions) {
  if (!interaction.deferred && !interaction.replied) {
    return interaction.reply(options);
  }

  return interaction.followUp(options);
}

export async function safeEdit(interaction: RepliableInteraction, options: EditOptions) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(options);
  }

  return interaction.reply(options as ReplyOptions);
}
