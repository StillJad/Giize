import { EmbedBuilder } from "discord.js";
import { Colors } from "../config/colors.js";

export function giizeEmbed() {
  return new EmbedBuilder().setColor(Colors.giize).setTimestamp();
}
