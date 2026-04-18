import { describe, expect, it } from "vitest";

import {
  buildAgentPrompt,
  buildDebateBrief,
  buildEffectiveInstruction,
  getRoundPhase,
  shouldStopDebate,
} from "@/lib/debate-engine";
import { createDefaultAgents, DEFAULT_MODEL } from "@/lib/defaults";
import { ParsedDocument } from "@/lib/types";

const agents = createDefaultAgents();
const documents: ParsedDocument[] = [
  {
    id: "doc-1",
    name: "plan.txt",
    mimeType: "text/plain",
    content: "Evidence lives here.",
    summary: "The document recommends a cautious rollout.",
    chunks: [
      {
        id: "doc-1-chunk-0",
        documentId: "doc-1",
        index: 0,
        text: "The document recommends a cautious rollout.",
      },
    ],
  },
];

describe("debate engine helpers", () => {
  it("includes persona and tone in the agent prompt", () => {
    const brief = buildDebateBrief(
      {
        title: "Rollout decision",
        instruction: "Choose a rollout plan.",
        goal: "문서 근거만으로 가장 안전한 전략 1개를 고른다.",
        consensusThreshold: 80,
        maxRounds: 12,
        model: DEFAULT_MODEL,
        agents,
      },
      documents
    );

    const prompt = buildAgentPrompt({
      agent: agents[1]!,
      brief,
      documents,
      messages: [],
      round: 1,
      phase: "explore",
    });

    expect(prompt).toContain(agents[1]!.persona);
    expect(prompt).toContain(agents[1]!.tone!);
    expect(prompt).toContain("doc-1-chunk-0");
    expect(prompt).toContain("기능 나열 금지");
    expect(prompt).toContain("Choose a rollout plan.");
  });

  it("always prepends the default debate framework", () => {
    const instruction = buildEffectiveInstruction("be/fe 2명이 2주 안에 검증할 실험을 정하라.");

    expect(instruction).toContain('주어진 아이디어에 대해 "지금 당장 만들 MVP"를 뽑는 것이 아니라');
    expect(instruction).toContain("핵심 가설 표");
    expect(instruction).toContain("be/fe 2명이 2주 안에 검증할 실험을 정하라.");
  });

  it("switches to converge phase from round 8", () => {
    expect(getRoundPhase(7)).toBe("explore");
    expect(getRoundPhase(8)).toBe("converge");
  });

  it("stops only when agreement and goal alignment both pass", () => {
    expect(
      shouldStopDebate(
        {
          round: 5,
          agreementScore: 81,
          goalAlignmentScore: 69,
          evidenceStrengthScore: 82,
          currentPosition: "Not enough fit yet.",
          openDisputes: ["Alignment is still weak."],
          rationale: "Goal fit is too low.",
          shouldContinue: true,
        },
        5,
        12,
        80
      )
    ).toBeNull();

    expect(
      shouldStopDebate(
        {
          round: 6,
          agreementScore: 82,
          goalAlignmentScore: 78,
          evidenceStrengthScore: 85,
          currentPosition: "Consensus is strong.",
          openDisputes: [],
          rationale: "The core conclusion is stable.",
          shouldContinue: false,
        },
        6,
        12,
        80
      )
    ).toBe("consensus_reached");
  });

  it("stops at hard limit when consensus never arrives", () => {
    expect(
      shouldStopDebate(
        {
          round: 12,
          agreementScore: 61,
          goalAlignmentScore: 63,
          evidenceStrengthScore: 70,
          currentPosition: "Still unresolved.",
          openDisputes: ["Two plans remain."],
          rationale: "The debate is stalled.",
          shouldContinue: true,
        },
        12,
        12,
        80
      )
    ).toBe("max_rounds_reached");
  });
});
