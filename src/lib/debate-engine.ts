import { nanoid } from "nanoid";

import {
  DEFAULT_MAX_ROUNDS,
  DEFAULT_CONSENSUS_THRESHOLD,
} from "@/lib/defaults";
import { parseUploadedFile } from "@/lib/document-parser";
import { createOpenAIClient } from "@/lib/openai";
import {
  saveSessionCompleted,
  saveSessionFailed,
  saveSessionMessage,
  saveSessionSnapshot,
  saveSessionStarted,
} from "@/lib/storage/app-storage";
import {
  AgentConfig,
  ConsensusSnapshot,
  DebateBrief,
  DebateInput,
  DebateMessage,
  DebateSession,
  DebateStreamEvent,
  FinalReport,
  ParsedDocument,
  StreamingMessage,
} from "@/lib/types";
import { clamp, safeJsonParse, truncate } from "@/lib/utils";

type RunDebateArgs = {
  input: DebateInput;
  files: File[];
  onEvent: (event: DebateStreamEvent) => Promise<void> | void;
};

type ActionClassification = ConsensusSnapshot["actionClassification"];

const DEFAULT_DEBATE_FRAMEWORK = `
목표:
주어진 아이디어에 대해 "지금 당장 만들 MVP"를 뽑는 것이 아니라,
가장 핵심적인 사업 가설을 검증하기 위한 최적의 다음 행동을 결정한다.

절대 규칙:
1. 기능 나열 금지. 먼저 핵심 가설부터 정의할 것.
2. 대안은 최대 3개만 다룰 것.
3. 각 대안마다 다음 5가지를 반드시 적을 것:
   - 검증하려는 가설
   - 왜 지금 중요한지
   - 가장 싼 실험 방법
   - 성공 기준
   - 실패 시 무엇을 버릴지
4. 이미 쓴 시간/노력/애착은 판단 근거에서 제외할 것.
5. "둘 다 가능", "상황에 따라 다름", "추가 정보가 필요함"으로 끝내지 말 것.
6. 합의가 안 되면 더 토론하지 말고, 남은 핵심 불확실성 1개와 그걸 검증할 실험 1개만 남길 것.

평가 기준:
- Learning Speed: 얼마나 빨리 중요한 것을 배울 수 있는가
- Assumption Risk: 가장 치명적인 가설을 실제로 건드리는가
- Feasibility: 2주 내 검증 가능한가
- Evidence Quality: 주장 근거가 명확한가
- Decision Usefulness: 지금 팀이 바로 행동할 수 있는가

종료 규칙:
- 합의 점수는 참고 신호일 뿐, 유일한 종료 기준이 아니다.
- 토론은 최대 5라운드까지만 진행한다.
- 합의는 세부안 동일성이 아니라 다음 행동 분류(proceed / revise / park / kill)의 동일성으로 측정한다.
- 2라운드 이후 agreement score가 기준 이상이고 치명적 미해결 리스크가 1개 이하이면 종료할 수 있다.
- 최대 라운드 종료 시에도 기준 미달이면 추가 토론을 금지하고 Judge가 proceed / revise / park / kill 중 하나를 강제 판정한다.
- Judge는 다수결이 아니라 학습 속도와 리스크 축소 관점에서 판정한다.

토론 절차:
Round 1. 각 Debater는 서로의 답을 보지 않고 독립적으로 아래를 작성한다.
- 문제 정의 1문장
- 핵심 가설 3개
- 우선 검증할 가설 1개
- 제안 대안 2개
- 추천안 1개

Round 2. 서로의 답을 본 뒤 상대 논리의 약점만 공격한다.
- 상대가 놓친 치명적 가정
- 허위 낙관 또는 과도한 보수성
- 무엇을 만들면 안 되는지

Round 3. Judge가 판정한다.
Judge는 아래 규칙을 따른다.
- "누가 더 설득력 있었는지"가 아니라 "어느 선택이 가장 빨리 불확실성을 줄이는지"로 판단할 것.
- 행동 분류(proceed / revise / park / kill)가 같은 방향으로 수렴하는지 판단할 것.
- 2라운드 이후 agreement score가 기준 이상이고 치명적 미해결 리스크가 1개 이하이면 합의로 종료할 것.
- 5라운드가 끝날 때까지 기준 미달이면 추가 토론 없이 행동 분류 1개를 강제 확정할 것.
- 최종 결과를 proceed / revise / park / kill 중 하나로만 판정할 것.

최종 출력 형식:
1. 현재 논의 중인 아이디어 한 줄 정의
2. 핵심 가설 표
   | 가설 | 중요도 | 불확실성 | 우선순위 |
   |---|---|---|---|
3. 대안 비교 표
   | 대안 | 검증 가설 | 실험 방식 | 성공 기준 | 실패 시 버릴 것 | 총평 |
   |---|---|---|---|---|---|
4. 최종 판정
   - 결정: proceed / revise / park / kill
   - 이유: 3문장 이내
5. Decision Memo
   - 지금 당장 할 일 1개
   - 하지 말아야 할 일 1개
   - 다음에 다시 논의할 조건 1개

표 작성 규칙:
- 표는 반드시 markdown table로 작성할 것.
- 헤더 바로 다음 줄에 "|---|---|" 형태의 구분선 행을 반드시 포함할 것.
- 표를 일반 문단이나 목록으로 대체하지 말 것.
`.trim();

export function buildEffectiveInstruction(inputInstruction: string) {
  const trimmedInstruction = inputInstruction.trim();

  return [
    DEFAULT_DEBATE_FRAMEWORK,
    "입력 아이디어:",
    trimmedInstruction || "사용자가 별도 아이디어 설명을 제공하지 않았다.",
  ].join("\n\n");
}

function normalizeActionClassification(value: unknown): ActionClassification {
  if (value === "proceed" || value === "revise" || value === "park" || value === "kill") {
    return value;
  }

  return "revise";
}

export function normalizeAgents(agents: AgentConfig[]) {
  const moderatorIndex = agents.findIndex((agent) =>
    /moderator|judge|arbiter/i.test(`${agent.role} ${agent.name}`)
  );
  const resolvedModeratorIndex = moderatorIndex >= 0 ? moderatorIndex : agents.length - 1;

  return {
    moderator: agents[resolvedModeratorIndex],
    debaters: agents.filter((_, index) => index !== resolvedModeratorIndex),
  };
}

export function buildDebateBrief(input: DebateInput, documents: ParsedDocument[]): DebateBrief {
  return {
    goal: input.goal.trim(),
    instruction: buildEffectiveInstruction(input.instruction),
    successCriteria: [
      "문서에서 직접 확인 가능한 근거를 반드시 인용한다.",
      "토론 목표에 맞는 하나의 결론 또는 명확한 선택지를 수렴한다.",
      "치명적인 반론이 남아 있으면 그대로 기록한다.",
      "실행 가능성 또는 의사결정 가치가 드러나는 수준으로 정리한다.",
    ],
    documentConstraints: [
      "문서에 없는 사실을 단정하지 않는다.",
      "근거가 부족하면 부족하다고 인정한다.",
      `총 ${documents.length}개 문서와 선택된 chunk만 근거로 사용한다.`,
    ],
    agentRoster: input.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      objective: agent.objective || `${agent.role} 관점에서 목표 달성 가능성을 검토한다.`,
      persona: agent.persona,
      tone: agent.tone || "명확하고 일관된 말투",
      debateStyle: agent.debateStyle || "문서 근거를 인용하며 자신의 입장을 설득력 있게 전개한다.",
    })),
  };
}

export function getRoundPhase(round: number) {
  return round >= 3 ? "converge" : "explore";
}

export function shouldStopDebate(
  snapshot: ConsensusSnapshot,
  round: number,
  maxRounds: number,
  threshold: number
) {
  if (
    round >= 2 &&
    snapshot.agreementScore >= threshold &&
    snapshot.classificationAlignmentScore >= threshold &&
    snapshot.criticalUnresolvedRisks.length <= 1
  ) {
    return "consensus_reached" as const;
  }

  if (round >= maxRounds) {
    return "max_rounds_reached" as const;
  }

  return null;
}

export function buildAgentPrompt(args: {
  agent: AgentConfig;
  brief: DebateBrief;
  documents: ParsedDocument[];
  messages: DebateMessage[];
  round: number;
  phase: "explore" | "converge";
}) {
  const { agent, brief, documents, messages, round, phase } = args;
  const documentDigest = documents
    .map(
      (document) =>
        `Document: ${document.name}\nSummary: ${document.summary}\nKey chunks:\n${document.chunks
          .slice(0, 3)
          .map((chunk) => `- [${chunk.id}] ${truncate(chunk.text, 280)}`)
          .join("\n")}`
    )
    .join("\n\n");

  const priorTurns = messages
    .slice(-6)
    .map((message) => `${message.agentName} (round ${message.round}): ${message.content}`)
    .join("\n");

  return `
You are ${agent.name}.
Role: ${agent.role}
Persona: ${agent.persona}
Tone: ${agent.tone || "Clear and focused"}
Debate style: ${agent.debateStyle || "Ground every claim in the provided documents."}
Objective: ${
    agent.objective || `${agent.role} 관점에서 목표와 instruction을 가장 잘 달성하도록 주장한다.`
  }

Debate goal:
${brief.goal}

Instruction:
${brief.instruction}

Success criteria:
${brief.successCriteria.map((item) => `- ${item}`).join("\n")}

Document constraints:
${brief.documentConstraints.map((item) => `- ${item}`).join("\n")}

Current round: ${round}
Phase: ${phase === "converge" ? "Converge toward one actionable conclusion." : "Explore and challenge aggressively."}

Recent debate context:
${priorTurns || "No prior turns yet."}

Document digest:
${documentDigest}

Response rules:
- Write 1 short but substantial message.
- Use the persona and tone consistently.
- Cite chunk ids like [doc-chunk-1] when making evidence-backed claims.
- Avoid repeating prior points unless you are sharpening them.
- If evidence is weak, say so explicitly.
`.trim();
}

function buildModeratorPrompt(args: {
  moderator: AgentConfig;
  brief: DebateBrief;
  documents: ParsedDocument[];
  messages: DebateMessage[];
  round: number;
}) {
  const { moderator, brief, documents, messages, round } = args;
  const context = messages
    .slice(-8)
    .map((message) => `${message.agentName}: ${message.content}`)
    .join("\n");

  const summaries = documents
    .map((document) => `- ${document.name}: ${document.summary}`)
    .join("\n");

  return `
You are ${moderator.name}, the moderator and consensus scorer.
Role: ${moderator.role}
Persona: ${moderator.persona}
Tone: ${moderator.tone || "Neutral and structured"}
Debate style: ${moderator.debateStyle || "Assess the discussion against the goal and available evidence."}

Goal:
${brief.goal}

Instruction:
${brief.instruction}

Round:
${round}

Document summaries:
${summaries}

Recent discussion:
${context}

Score the debate based on:
- goal fit
- evidence strength
- whether one next action classification is emerging
- whether remaining objections are minor or critical
- whether the best decision reduces uncertainty fastest

You are a Judge, not a vote counter.
Do not use majority-rule logic.
Prioritize learning speed and risk reduction.
Choose one action classification only: proceed, revise, park, or kill.
List only truly critical unresolved risks.
Keep the assessment strict. Do not inflate scores without evidence.
`.trim();
}

async function streamFreeformTurn(args: {
  apiKey?: string;
  model: string;
  prompt: string;
  onStart: (message: StreamingMessage) => Promise<void> | void;
  onDelta: (messageId: string, delta: string) => Promise<void> | void;
  agent: AgentConfig;
  round: number;
}) {
  const client = createOpenAIClient(args.apiKey);
  const streamingMessage: StreamingMessage = {
    id: nanoid(),
    agentId: args.agent.id,
    agentName: args.agent.name,
    role: args.agent.role,
    round: args.round,
    content: "",
    createdAt: new Date().toISOString(),
    status: "thinking",
  };

  await args.onStart(streamingMessage);
  const stream = await client.chat.completions.create({
    model: args.model,
    stream: true,
    messages: [{ role: "user", content: args.prompt }],
  });

  let content = "";

  for await (const event of stream) {
    const delta = event.choices[0]?.delta?.content;
    if (delta) {
      content += delta;
      await args.onDelta(streamingMessage.id, delta);
    }
  }
  return content.trim();
}

async function generateModeratorAssessment(args: {
  apiKey?: string;
  model: string;
  prompt: string;
}) {
  const client = createOpenAIClient(args.apiKey);
  const response = await client.responses.create({
    model: args.model,
    input: args.prompt,
    text: {
      format: {
        type: "json_schema",
        name: "debate_assessment",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            agreement_score: { type: "number" },
            goal_alignment_score: { type: "number" },
            evidence_strength_score: { type: "number" },
            classification_alignment_score: { type: "number" },
            action_classification: {
              type: "string",
              enum: ["proceed", "revise", "park", "kill"],
            },
            critical_unresolved_risks: {
              type: "array",
              items: { type: "string" },
            },
            current_position: { type: "string" },
            rationale: { type: "string" },
            open_disputes: {
              type: "array",
              items: { type: "string" },
            },
            should_continue: { type: "boolean" },
          },
          required: [
            "agreement_score",
            "goal_alignment_score",
            "evidence_strength_score",
            "classification_alignment_score",
            "action_classification",
            "critical_unresolved_risks",
            "current_position",
            "rationale",
            "open_disputes",
            "should_continue",
          ],
        },
      },
    },
  });

  return safeJsonParse(response.output_text, {
    agreement_score: 0,
    goal_alignment_score: 0,
    evidence_strength_score: 0,
    classification_alignment_score: 0,
    action_classification: "revise",
    critical_unresolved_risks: ["Judge response could not be parsed."],
    current_position: "Structured response parsing failed.",
    rationale: "The model returned an unreadable JSON payload.",
    open_disputes: ["Moderator response could not be parsed."],
    should_continue: true,
  });
}

async function generateFinalReport(args: {
  apiKey?: string;
  model: string;
  brief: DebateBrief;
  messages: DebateMessage[];
  snapshot: ConsensusSnapshot;
  finishReason: FinalReport["finishReason"];
}) {
  const client = createOpenAIClient(args.apiKey);
  const response = await client.responses.create({
    model: args.model,
    input: `
Create the final report for this debate.

Goal:
${args.brief.goal}

Instruction:
${args.brief.instruction}

Final moderator position:
${args.snapshot.currentPosition}

Rationale:
${args.snapshot.rationale}

Recent messages:
${args.messages
  .slice(-10)
  .map((message) => `- ${message.agentName}: ${message.content}`)
  .join("\n")}

Return finalAnswer as GitHub-flavored Markdown grounded in the debate.
If the instruction asks for tables, you must include valid markdown tables with header rows and separator rows.
Do not collapse required tables into bullet points or prose.
Preserve the requested final output structure exactly when possible.
Use the same final decision label as the Judge classification.
`.trim(),
    text: {
      format: {
        type: "json_schema",
        name: "final_report",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            finalAnswer: { type: "string" },
            decision: {
              type: "string",
              enum: ["proceed", "revise", "park", "kill"],
            },
            keyEvidence: { type: "array", items: { type: "string" } },
            remainingDisputes: { type: "array", items: { type: "string" } },
          },
          required: ["finalAnswer", "decision", "keyEvidence", "remainingDisputes"],
        },
      },
    },
  });

  const parsed = safeJsonParse(response.output_text, {
    finalAnswer: args.snapshot.currentPosition,
    decision: args.snapshot.actionClassification,
    keyEvidence: [],
    remainingDisputes: args.snapshot.openDisputes,
  });

  return {
    finalAnswer: parsed.finalAnswer,
    agreementScore: args.snapshot.agreementScore,
    goalAlignmentScore: args.snapshot.goalAlignmentScore,
    decision: normalizeActionClassification(parsed.decision),
    keyEvidence: parsed.keyEvidence,
    remainingDisputes: parsed.remainingDisputes,
    roundCount: args.snapshot.round,
    finishReason: args.finishReason,
  } satisfies FinalReport;
}

function createMessage(agent: AgentConfig, round: number, content: string): DebateMessage {
  const references = Array.from(content.matchAll(/\[([^\]]+)\]/g)).map((match) => match[1]);

  return {
    id: nanoid(),
    agentId: agent.id,
    agentName: agent.name,
    role: agent.role,
    round,
    content,
    references,
    personaSummary: truncate(
      [agent.persona, agent.tone, agent.debateStyle].filter(Boolean).join(" / "),
      120
    ),
    createdAt: new Date().toISOString(),
  };
}

export async function runDebate({ input, files, onEvent }: RunDebateArgs) {
  if (!input.goal.trim()) {
    throw new Error("goal required");
  }

  const session: DebateSession = {
    id: nanoid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "running",
    input: {
      title: input.title,
      instruction: input.instruction,
      goal: input.goal,
      consensusThreshold: clamp(input.consensusThreshold || DEFAULT_CONSENSUS_THRESHOLD, 50, 95),
      maxRounds: DEFAULT_MAX_ROUNDS,
      model: input.model,
      agents: input.agents,
    },
    documents: [],
    messages: [],
    snapshots: [],
  };

  try {
    const documents = await Promise.all(files.map((file) => parseUploadedFile(file)));
    const brief = buildDebateBrief(input, documents);
    session.documents = documents;

    await saveSessionStarted(session);
    await onEvent({ type: "session.created", session });
    await onEvent({ type: "document.parsed", documents });
    await onEvent({ type: "brief.generated", brief });

    const { debaters, moderator } = normalizeAgents(input.agents);
    if (!moderator || debaters.length === 0) {
      throw new Error("At least two agents are required, including one moderator.");
    }

    let finishReason: FinalReport["finishReason"] | null = null;

    for (let round = 1; round <= session.input.maxRounds; round += 1) {
      const phase = getRoundPhase(round);
      await onEvent({ type: "round.started", round, phase });

      for (const agent of debaters) {
        const prompt = buildAgentPrompt({
          agent,
          brief,
          documents,
          messages: session.messages,
          round,
          phase,
        });
        const content = await streamFreeformTurn({
          apiKey: input.apiKey,
          model: input.model,
          prompt,
          agent,
          round,
          onStart: (message) => onEvent({ type: "message.started", message }),
          onDelta: (messageId, delta) => onEvent({ type: "message.delta", messageId, delta }),
        });
        const message = createMessage(agent, round, content);
        session.messages.push(message);
        session.updatedAt = new Date().toISOString();
        await saveSessionMessage(session, message);
        await onEvent({ type: "message.completed", message });
      }

      const moderatorStreamingMessage: StreamingMessage = {
        id: nanoid(),
        agentId: moderator.id,
        agentName: moderator.name,
        role: moderator.role,
        round,
        content: "",
        createdAt: new Date().toISOString(),
        status: "thinking",
      };
      await onEvent({ type: "message.started", message: moderatorStreamingMessage });

      const moderatorContent = await generateModeratorAssessment({
        apiKey: input.apiKey,
        model: input.model,
        prompt: buildModeratorPrompt({
          moderator,
          brief,
          documents,
          messages: session.messages,
          round,
        }),
      });

      const moderatorMessage = createMessage(
        moderator,
        round,
        `${moderatorContent.current_position}\n\nReasoning: ${moderatorContent.rationale}`
      );
      const snapshot: ConsensusSnapshot = {
        round,
        agreementScore: clamp(Math.round(moderatorContent.agreement_score), 0, 100),
        goalAlignmentScore: clamp(Math.round(moderatorContent.goal_alignment_score), 0, 100),
        evidenceStrengthScore: clamp(Math.round(moderatorContent.evidence_strength_score), 0, 100),
        classificationAlignmentScore: clamp(
          Math.round(moderatorContent.classification_alignment_score),
          0,
          100
        ),
        actionClassification: normalizeActionClassification(
          moderatorContent.action_classification
        ),
        criticalUnresolvedRisks: moderatorContent.critical_unresolved_risks,
        currentPosition: moderatorContent.current_position,
        openDisputes: moderatorContent.open_disputes,
        rationale: moderatorContent.rationale,
        shouldContinue: true,
      };

      finishReason = shouldStopDebate(
        snapshot,
        round,
        session.input.maxRounds,
        session.input.consensusThreshold
      );
      snapshot.shouldContinue = !finishReason;

      session.messages.push(moderatorMessage);
      session.snapshots.push(snapshot);
      session.updatedAt = new Date().toISOString();

      await saveSessionMessage(session, moderatorMessage);
      await saveSessionSnapshot(session, snapshot);
      await onEvent({ type: "message.completed", message: moderatorMessage });
      await onEvent({ type: "consensus.updated", snapshot });

      if (finishReason) {
        finishReason = finishReason ?? "max_rounds_reached";
        break;
      }
    }

    const latestSnapshot = session.snapshots.at(-1);
    if (!latestSnapshot) {
      throw new Error("The debate ended before the moderator produced an assessment.");
    }

    session.finalReport = await generateFinalReport({
      apiKey: input.apiKey,
      model: input.model,
      brief,
      messages: session.messages,
      snapshot: latestSnapshot,
      finishReason: finishReason ?? "max_rounds_reached",
    });
    session.status = "completed";
    session.updatedAt = new Date().toISOString();
    await saveSessionCompleted(session);
    await onEvent({ type: "debate.completed", session });

    return session;
  } catch (error) {
    session.status = "failed";
    session.error = error instanceof Error ? error.message : "Unknown debate error.";
    session.updatedAt = new Date().toISOString();
    await saveSessionFailed(session, session.error);
    throw error;
  }
}
