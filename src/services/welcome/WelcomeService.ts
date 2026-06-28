import { EmbedBuilder } from "discord.js";
import { Colors } from "../../config/colors.js";

export class WelcomeService {
  static create(memberName: string, avatar: string, image: string) {
    return new EmbedBuilder()
      .setColor(Colors.giize)
      .setTitle(`👋 Welcome ${memberName}!`)
      .setDescription(
`Welcome to **Giize Events**!

🎮 Event Server
🌎 Java + Bedrock
📢 Read the rules
🎭 Grab your roles

Have fun!`
      )
      .setThumbnail(avatar)
      .setImage(image)
      .setTimestamp();
  }
}