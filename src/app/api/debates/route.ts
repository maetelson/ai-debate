import { NextResponse } from "next/server";

import { runDebate } from "@/lib/debate-engine";
import { DEFAULT_CONSENSUS_THRESHOLD, DEFAULT_MAX_ROUNDS, DEFAULT_MODEL } from "@/lib/defaults";
import { AgentConfig } from "@/lib/types";
import { safeJsonParse } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (files.length === 0) {
    return NextResponse.json({ error: "At least one document is required." }, { status: 400 });
  }

  const input = {
    title: String(formData.get("title") || ""),
    instruction: String(formData.get("instruction") || ""),
    goal: String(formData.get("goal") || ""),
    consensusThreshold: Number(formData.get("consensusThreshold") || DEFAULT_CONSENSUS_THRESHOLD),
    maxRounds: Number(formData.get("maxRounds") || DEFAULT_MAX_ROUNDS),
    model: String(formData.get("model") || DEFAULT_MODEL),
    apiKey: String(formData.get("apiKey") || ""),
    agents: safeJsonParse<AgentConfig[]>(String(formData.get("agents") || "[]"), []),
  };

  if (!input.goal.trim()) {
    return NextResponse.json({ error: "goal required" }, { status: 400 });
  }

  if (!input.title.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  if (!input.instruction.trim()) {
    return NextResponse.json({ error: "instruction required" }, { status: 400 });
  }

  if (!Array.isArray(input.agents) || input.agents.length < 2) {
    return NextResponse.json(
      { error: "At least two agents are required." },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const push = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      void (async () => {
        try {
          await runDebate({
            input,
            files,
            onEvent: async (event) => {
              push(event);
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "An unknown debate error occurred.";
          push({ type: "debate.failed", message });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
