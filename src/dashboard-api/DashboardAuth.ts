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
  const result = verifyDashboardTokenDetailed(token);
  return result.ok ? result.payload : null;
}

export function verifyDashboardTokenDetailed(token: string):
  | { ok: true; payload: DashboardTokenPayload }
  | { ok: false; reason: "token missing" | "token expired" | "signature invalid" | "wrong guild" | "malformed token" } {
  if (!token) return { ok: false, reason: "token missing" };
  const [body, signature] = token.split(".");
  if (!body || !signature) return { ok: false, reason: "malformed token" };
  if (!safeEqual(signature, sign(body))) return { ok: false, reason: "signature invalid" };

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DashboardTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "token expired" };
    if (payload.guildId !== config.dashboardGuildId) return { ok: false, reason: "wrong guild" };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "malformed token" };
  }
}

export function canEditSettings(accessLevel: DashboardAccessLevel) {
  return accessLevel === "administrator" || accessLevel === "developer";
}
