export const dashboardConfig = {
  clientId: process.env.DISCORD_CLIENT_ID ?? "",
  clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  redirectUri: process.env.DISCORD_REDIRECT_URI ?? "http://localhost:3000/api/auth/callback/discord",
  sessionSecret: process.env.DASHBOARD_SESSION_SECRET ?? "",
  internalSecret: process.env.DASHBOARD_INTERNAL_SECRET ?? "",
  guildId: process.env.DASHBOARD_GUILD_ID ?? "1513902863657603203",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  publicUrl: process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000",
  discordInviteUrl: process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "",
  minecraftAddress: process.env.NEXT_PUBLIC_MINECRAFT_ADDRESS ?? "glurps.net",
  botApiUrl: process.env.DASHBOARD_BOT_API_URL ?? "http://giize-bot:3001",
  nodeEnv: process.env.NODE_ENV ?? "development",
};
