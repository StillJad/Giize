import "dotenv/config";

export const config = {
  token: process.env.DISCORD_TOKEN ?? "",
  clientId: process.env.CLIENT_ID ?? "",
  guildId: process.env.GUILD_ID ?? "",
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID ?? "",
  welcomeImageUrl: process.env.WELCOME_IMAGE_URL ?? "https://i.imgur.com/4M34hi2.png",
  mcHost: process.env.MC_HOST ?? "Crafter.Giize.Events",
  mcPort: Number(process.env.MC_PORT ?? 50349)
};
