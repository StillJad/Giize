import "server-only";
import { redirect } from "next/navigation";
import { dashboardConfig } from "./config";
import { createDashboardToken, getSession } from "./session";

export class DashboardApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly route: string
  ) {
    super(`Dashboard API failed: ${status}`);
  }
}

export async function botApi<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSession();
  if (!session) redirect("/api/auth/login");

  const method = init?.method ?? "GET";
  const response = await fetch(`${dashboardConfig.botApiUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": init?.headers instanceof Headers
        ? init.headers.get("content-type") ?? "application/json"
        : "application/json",
      "x-dashboard-secret": dashboardConfig.internalSecret,
      "x-dashboard-token": createDashboardToken(session),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    console.error(`Dashboard API request failed status=${response.status} method=${method} route=${path}`);
    throw new DashboardApiError(response.status, path);
  }

  return response.json() as Promise<T>;
}

export async function getGuildContext() {
  return botApi<{ guild: { id: string; name: string; icon: string | null }; channels: { id: string; name: string }[]; roles: { id: string; name: string }[] }>("/guild");
}
