import { redirect } from "next/navigation";
import { dashboardConfig } from "../../../../lib/config";

export function GET() {
  const params = new URLSearchParams({
    client_id: dashboardConfig.clientId,
    redirect_uri: dashboardConfig.redirectUri,
    response_type: "code",
    scope: "identify guilds",
  });

  redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
}
