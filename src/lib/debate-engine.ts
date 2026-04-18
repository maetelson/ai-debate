import { nanoid } from "nanoid";

import {
  DEFAULT_MAX_ROUNDS,
  DEFAULT_SOFT_LIMIT,
  DEFAULT_CONSENSUS_THRESHOLD,
} from "@/lib/defaults";
import { parseUploadedFile } from "@/lib/document-parser";
import { createOpenAIClient } from "@/lib/openai";
import { saveSession } from "@/lib/persistence";
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

const MIN_GOAL_ALIGNMENT = 70;

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
    instruction: input.instruction.trim(),
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
  return round >= DEFAULT_SOFT_LIMIT ? "converge" : "explore";
}

export function shouldStopDebate(
  snapshot: ConsensusSnapshot,
  round: number,
  maxRounds: number,
  threshold: number
) {
  if (
    snapshot.agreementScore >= threshold &&
    snapshot.goalAlignmentScore >= MIN_GOAL_ALIGNMENT
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
- whether one main conclusion is emerging
- whether remaining objections are minor or critical

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

  const stream = client.responses.stream({
    model: args.model,
    input: args.prompt,
  });

  let content = "";

  for await (const event of stream) {
    if (event.type === "response.output_text.delta" && event.delta) {
      content += event.delta;
      await args.onDelta(streamingMessage.id, event.delta);
    }
  }

  await stream.finalResponse();
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

Return a crisp final answer grounded in the debate.
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
            keyEvidence: { type: "array", items: { type: "string" } },
            remainingDisputes: { type: "array", items: { type: "string" } },
          },
          required: ["finalAnswer", "keyEvidence", "remainingDisputes"],
        },
      },
    },
  });

  const parsed = safeJsonParse(response.output_text, {
    finalAnswer: args.snapshot.currentPosition,
    keyEvidence: [],
    remainingDisputes: args.snapshot.openDisputes,
  });

  return {
    finalAnswer: parsed.finalAnswer,
    agreementScore: args.snapshot.agreementScore,
    goalAlignmentScore: args.snapshot.goalAlignmentScore,
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

  const documents = await Promise.all(files.map((file) => parseUploadedFile(file)));
  const brief = buildDebateBrief(input, documents);
  const session: DebateSession = {
    id: nanoid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "running",
      input: {
        instruction: input.instruction,
        goal: input.goal,
        consensusThreshold: clamp(input.consensusThreshold || DEFAULT_CONSENSUS_THRESHOLD, 50, 95),
        maxRounds: clamp(input.maxRounds || DEFAULT_MAX_ROUNDS, 10, 50),
        model: input.model,
        agents: input.agents,
      },
    documents,
    messages: [],
    snapshots: [],
  };

  await saveSession(session);
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
      await saveSession(session);
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
      currentPosition: moderatorContent.current_position,
      openDisputes: moderatorContent.open_disputes,
      rationale: moderatorContent.rationale,
      shouldContinue: moderatorContent.should_continue,
    };

    session.messages.push(moderatorMessage);
    session.snapshots.push(snapshot);
    session.updatedAt = new Date().toISOString();

    await saveSession(session);
    await onEvent({ type: "message.completed", message: moderatorMessage });
    await onEvent({ type: "consensus.updated", snapshot });

    finishReason = shouldStopDebate(
      snapshot,
      round,
      session.input.maxRounds,
      session.input.consensusThreshold
    );

    if (finishReason || !snapshot.shouldContinue) {
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
  await saveSession(session);
  await onEvent({ type: "debate.completed", session });

  return session;
}
