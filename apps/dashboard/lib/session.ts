import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { dashboardConfig } from "./config";

export type DashboardSession = {
  discordUserId: string;
  username: string;
  avatar: string | null;
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  accessLevel: "administrator" | "developer" | "staff";
  dashboardToken: string;
  exp: number;
};

const cookieName = "giize_dashboard_session";

function sign(value: string) {
  return createHmac("sha256", dashboardConfig.sessionSecret).update(value).digest("base64url");
}

export function encodeSession(session: DashboardSession) {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(value: string | undefined): DashboardSession | null {
  if (!value || !dashboardConfig.sessionSecret) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DashboardSession;
    return session.exp > Math.floor(Date.now() / 1000) ? session : null;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(cookieName)?.value);
}

export async function setSession(session: DashboardSession) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, encodeSession(session), {
    httpOnly: true,
    secure: dashboardConfig.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}
