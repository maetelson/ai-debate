import { describe, expect, it } from "vitest";

import { mergeSessionSummaries } from "@/lib/storage/bridge-client";
import { SessionSummary } from "@/lib/types";

describe("mergeSessionSummaries", () => {
  it("keeps the most recent copy when local and remote overlap", () => {
    const local: SessionSummary[] = [
      {
        id: "session-1",
        createdAt: "2026-04-18T00:00:00.000Z",
        updatedAt: "2026-04-18T01:00:00.000Z",
        status: "running",
        title: "Local copy",
        goal: "Goal",
        instruction: "Instruction",
        messageCount: 2,
        agreementScore: 40,
      },
    ];

    const remote: SessionSummary[] = [
      {
        id: "session-1",
        createdAt: "2026-04-18T00:00:00.000Z",
        updatedAt: "2026-04-18T02:00:00.000Z",
        status: "completed",
        title: "Remote copy",
        goal: "Goal",
        instruction: "Instruction",
        messageCount: 5,
        agreementScore: 82,
      },
    ];

    const merged = mergeSessionSummaries(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.title).toBe("Remote copy");
    expect(merged[0]?.agreementScore).toBe(82);
  });
});
