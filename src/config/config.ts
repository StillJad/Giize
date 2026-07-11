import "dotenv/config";

export const config = {
  token: process.env.DISCORD_TOKEN ?? "",
  clientId: process.env.CLIENT_ID ?? "",
  guildId: process.env.GUILD_ID ?? "",
  staffRoleId: process.env.STAFF_ROLE_ID ?? "1513916326400495838",
  verifyRoleId: process.env.VERIFY_ROLE_ID ?? process.env.VERIFIED_ROLE_ID ?? "",
  ticketCategoryId: process.env.TICKET_CATEGORY_ID ?? "1521169950079975595",
  ticketLogsChannelId: process.env.TICKET_LOGS_CHANNEL_ID ?? "1517296636135477511",
  eventLogsChannelId: process.env.EVENT_LOGS_CHANNEL_ID ?? "1521201830510592050",
  verificationLogsChannelId: process.env.VERIFICATION_LOG_CHANNEL_ID ?? "",
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID ?? "1513917724424798400",
  welcomeBannerUrl: process.env.WELCOME_BANNER_URL ?? process.env.WELCOME_IMAGE_URL ?? "https://i.imgur.com/4M34hi2.png",
  welcomeRoleId: process.env.WELCOME_ROLE_ID ?? "",
  rulesChannelId: process.env.RULES_CHANNEL_ID ?? "",
  aboutChannelId: process.env.ABOUT_CHANNEL_ID ?? "",
  rolesChannelId: process.env.ROLES_CHANNEL_ID ?? "",
  bedrockChannelId: process.env.BEDROCK_CHANNEL_ID ?? "",
  announcementsChannelId: process.env.ANNOUNCEMENTS_CHANNEL_ID ?? "",
  ipChannelId: process.env.IP_CHANNEL_ID ?? "",
  mcHost: process.env.SERVER_IP ?? process.env.MC_HOST ?? "Crafter.Giize.Events",
  mcPort: Number(process.env.SERVER_PORT ?? process.env.MC_PORT ?? 50349)
};
