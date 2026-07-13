import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { dashboardConfig } from "../../../../../lib/config";
import { setSession } from "../../../../../lib/session";

type DiscordUser = {
  id: string;
  username: string;
  avatar: string | null;
};

type DiscordGuild = {
  id: string;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing OAuth code" }, { status: 400 });

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: dashboardConfig.clientId,
      client_secret: dashboardConfig.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: dashboardConfig.redirectUri,
    }),
  });

  if (!tokenResponse.ok) return NextResponse.json({ error: "OAuth token exchange failed" }, { status: 401 });
  const token = await tokenResponse.json() as { access_token: string };
  const headers = { authorization: `Bearer ${token.access_token}` };
  const [user, guilds] = await Promise.all([
    fetch("https://discord.com/api/users/@me", { headers }).then(res => res.json() as Promise<DiscordUser>),
    fetch("https://discord.com/api/users/@me/guilds", { headers }).then(res => res.json() as Promise<DiscordGuild[]>),
  ]);

  if (!guilds.some(guild => guild.id === dashboardConfig.guildId)) {
    return NextResponse.json({ error: "You are not a member of this server." }, { status: 403 });
  }

  const memberResponse = await fetch(`${dashboardConfig.botApiUrl}/auth/member`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-dashboard-secret": dashboardConfig.internalSecret,
    },
    body: JSON.stringify({ discordUserId: user.id }),
  });

  if (!memberResponse.ok) return NextResponse.json({ error: "You do not have dashboard access." }, { status: 403 });
  const member = await memberResponse.json() as {
    allowed: boolean;
    accessLevel: "administrator" | "developer" | "staff";
    token: string;
    guild: { id: string; name: string; icon: string | null };
  };

  if (!member.allowed) return NextResponse.json({ error: "You do not have dashboard access." }, { status: 403 });

  await setSession({
    discordUserId: user.id,
    username: user.username,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
    guildId: member.guild.id,
    guildName: member.guild.name,
    guildIcon: member.guild.icon,
    accessLevel: member.accessLevel,
    dashboardToken: member.token,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
  });

  redirect("/overview");
}
