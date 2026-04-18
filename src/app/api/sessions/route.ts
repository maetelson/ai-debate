import { NextResponse } from "next/server";

import { listStoredSessions } from "@/lib/storage/app-storage";

export const runtime = "nodejs";

export async function GET() {
  const sessions = await listStoredSessions();
  return NextResponse.json({ sessions });
}
