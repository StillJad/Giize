import { NextRequest, NextResponse } from "next/server";
import { dashboardConfig } from "../../../../lib/config";
import { getSession } from "../../../../lib/session";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path } = await context.params;
  const targetPath = `/${path.join("/")}${request.nextUrl.search}`;
  const response = await fetch(`${dashboardConfig.botApiUrl}${targetPath}`, {
    method: request.method,
    headers: {
      "content-type": "application/json",
      "x-dashboard-secret": dashboardConfig.internalSecret,
      "x-dashboard-token": session.dashboardToken,
    },
    body: request.method === "GET" ? undefined : await request.text(),
  });

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
