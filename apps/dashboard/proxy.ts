import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";

  if (host === "www.glurps.net") {
    const url = request.nextUrl.clone();
    url.hostname = "glurps.net";
    return NextResponse.redirect(url, 308);
  }

  if (host === "dashboard.glurps.net" && request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
