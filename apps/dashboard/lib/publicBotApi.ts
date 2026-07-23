import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { dashboardConfig } from "./config";

const publicRateLimits = new Map<string, { count: number; resetsAt: number }>();

export async function publicBotApi(request: NextRequest, path: string) {
  if (!publicRateLimit(request)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const response = await fetch(`${dashboardConfig.botApiUrl}${path}`, {
    cache: "no-store",
    headers: {
      "x-dashboard-secret": dashboardConfig.internalSecret,
    },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

function publicRateLimit(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || request.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  const current = publicRateLimits.get(key);

  if (!current || current.resetsAt < now) {
    publicRateLimits.set(key, { count: 1, resetsAt: now + 60_000 });
    return true;
  }

  current.count += 1;
  return current.count <= 60;
}
