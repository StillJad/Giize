import { EmbedBuilder } from "discord.js";
import { Colors } from "../config/colors.js";

export const giizeFooter = "Event Bot";

export function glurpsEmbed() {
  return new EmbedBuilder()
    .setColor(Colors.giize)
    .setFooter({ text: giizeFooter })
    .setTimestamp();
}
