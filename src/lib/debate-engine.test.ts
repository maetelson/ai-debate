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
        maxRounds: 5,
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

    expect(instruction).toContain(
      '주어진 아이디어에 대해 "지금 당장 만들 MVP"를 뽑는 것이 아니라'
    );
    expect(instruction).toContain("핵심 가설 표");
    expect(instruction).toContain("|---|---|---|---|");
    expect(instruction).toContain("|---|---|---|---|---|---|");
    expect(instruction).toContain("be/fe 2명이 2주 안에 검증할 실험을 정하라.");
  });

  it("switches to converge phase from round 3", () => {
    expect(getRoundPhase(2)).toBe("explore");
    expect(getRoundPhase(3)).toBe("converge");
  });

  it("does not stop before round 2 even with strong scores", () => {
    expect(
      shouldStopDebate(
        {
          round: 1,
          agreementScore: 92,
          goalAlignmentScore: 88,
          evidenceStrengthScore: 90,
          classificationAlignmentScore: 91,
          actionClassification: "revise",
          criticalUnresolvedRisks: [],
          currentPosition: "A strong early direction exists.",
          openDisputes: [],
          rationale: "The signals are strong but still too early.",
          shouldContinue: true,
        },
        1,
        5,
        80
      )
    ).toBeNull();
  });

  it("stops after round 2 when classification aligns and critical risks are minimal", () => {
    expect(
      shouldStopDebate(
        {
          round: 2,
          agreementScore: 84,
          goalAlignmentScore: 77,
          evidenceStrengthScore: 86,
          classificationAlignmentScore: 85,
          actionClassification: "proceed",
          criticalUnresolvedRisks: ["Pricing assumption needs a quick smoke test."],
          currentPosition: "The team is converging on a proceed decision.",
          openDisputes: ["Only one narrow risk remains."],
          rationale: "The next action category is aligned and remaining risk is bounded.",
          shouldContinue: false,
        },
        2,
        5,
        80
      )
    ).toBe("consensus_reached");
  });

  it("does not stop when action classification is not aligned enough", () => {
    expect(
      shouldStopDebate(
        {
          round: 3,
          agreementScore: 88,
          goalAlignmentScore: 82,
          evidenceStrengthScore: 83,
          classificationAlignmentScore: 63,
          actionClassification: "revise",
          criticalUnresolvedRisks: [],
          currentPosition: "The details are narrowing, but the action class is still split.",
          openDisputes: ["Proceed versus revise is still contested."],
          rationale: "Agreement is high, but not on the next action bucket.",
          shouldContinue: true,
        },
        3,
        5,
        80
      )
    ).toBeNull();
  });

  it("forces a decision at round 5 when consensus never arrives", () => {
    expect(
      shouldStopDebate(
        {
          round: 5,
          agreementScore: 61,
          goalAlignmentScore: 66,
          evidenceStrengthScore: 72,
          classificationAlignmentScore: 58,
          actionClassification: "park",
          criticalUnresolvedRisks: [
            "Distribution channel demand remains unclear.",
            "Acquisition cost assumptions are untested.",
          ],
          currentPosition: "The debate did not fully converge.",
          openDisputes: ["Proceed and revise both remain in play."],
          rationale: "Judge must now force the most useful next action.",
          shouldContinue: false,
        },
        5,
        5,
        80
      )
    ).toBe("max_rounds_reached");
  });
});
