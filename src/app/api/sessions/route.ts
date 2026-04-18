import { NextResponse } from "next/server";

import { listSessions } from "@/lib/persistence";

export const runtime = "nodejs";

export async function GET() {
  const sessions = await listSessions();
  return NextResponse.json({ sessions });
}
