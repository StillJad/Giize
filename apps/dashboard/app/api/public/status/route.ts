import { NextRequest } from "next/server";
import { publicBotApi } from "../../../../lib/publicBotApi";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return publicBotApi(request, "/public/status");
}
