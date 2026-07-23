import { EmbedBuilder } from "discord.js";
import { Colors } from "../config/colors.js";

export const giizeFooter = "Glurps Bot";

export function giizeEmbed() {
  return new EmbedBuilder()
    .setColor(Colors.giize)
    .setFooter({ text: giizeFooter })
    .setTimestamp();
}
