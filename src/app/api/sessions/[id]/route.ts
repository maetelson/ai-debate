import { NextResponse } from "next/server";

import { loadSession } from "@/lib/persistence";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await loadSession(id);
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
}
