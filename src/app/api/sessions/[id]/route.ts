import { NextResponse } from "next/server";

import {
  deleteStoredSession,
  loadStoredSession,
  renameStoredSession,
} from "@/lib/storage/app-storage";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { title } = (await request.json()) as { title?: string };
    const result = await renameStoredSession(id, title ?? "");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Session update failed." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteStoredSession(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Session delete failed." },
      { status: 400 }
    );
  }
}
