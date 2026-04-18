import { NextResponse } from "next/server";

import { loadStoredSession } from "@/lib/storage/app-storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await loadStoredSession(id);
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
}
