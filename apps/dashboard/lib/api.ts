import "server-only";
import { redirect } from "next/navigation";
import { dashboardConfig } from "./config";
import { getSession } from "./session";

export async function botApi<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSession();
  if (!session) redirect("/api/auth/login");

  const response = await fetch(`${dashboardConfig.botApiUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-dashboard-secret": dashboardConfig.internalSecret,
      "x-dashboard-token": session.dashboardToken,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Dashboard API failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getGuildContext() {
  return botApi<{ guild: { id: string; name: string; icon: string | null }; channels: { id: string; name: string }[]; roles: { id: string; name: string }[] }>("/guild");
}
