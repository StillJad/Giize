import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config/config.js";

export type DashboardAccessLevel = "administrator" | "developer" | "staff";

export type DashboardTokenPayload = {
  discordUserId: string;
  guildId: string;
  accessLevel: DashboardAccessLevel;
  exp: number;
};

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", config.dashboardInternalSecret).update(value).digest("base64url");
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function signDashboardToken(payload: Omit<DashboardTokenPayload, "exp">, ttlSeconds = 900) {
  const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${body}.${sign(body)}`;
}

export function verifyDashboardToken(token: string): DashboardTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature || !safeEqual(signature, sign(body))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DashboardTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.guildId !== config.dashboardGuildId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function canEditSettings(accessLevel: DashboardAccessLevel) {
  return accessLevel === "administrator" || accessLevel === "developer";
}
