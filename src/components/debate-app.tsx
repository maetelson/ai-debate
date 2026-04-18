"use client";

import { startTransition, useState } from "react";
import { nanoid } from "nanoid";
import {
  AlertCircle,
  Bot,
  Files,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Scale,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  createDefaultAgents,
  DEFAULT_CONSENSUS_THRESHOLD,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_MODEL,
} from "@/lib/defaults";
import {
  AgentConfig,
  ConsensusSnapshot,
  DebateBrief,
  DebateSession,
  DebateStreamEvent,
  SessionSummary,
} from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";

const personaHints = [
  "논리적이고 공격적",
  "냉소적이고 허점 집착형",
  "실무형, 실행 가능성 중시",
  "학술적, 근거 엄격주의",
];

function createNewAgent(): AgentConfig {
  return {
    id: nanoid(),
    name: "New agent",
    role: "Specialist",
    persona: "침착하지만 집요한 토론가",
    tone: "담백하고 선명한 말투",
    debateStyle: "문서 근거를 인용하며 한 가지 논점에 집중한다.",
    objective: "새로운 관점에서 논의를 밀어붙인다.",
  };
}

function agentTone(role: string, index: number) {
  if (/moderator|judge|arbiter/i.test(role)) {
    return "border-zinc-300 bg-zinc-50";
  }

  return index % 2 === 0
    ? "border-sky-200 bg-sky-50"
    : "border-orange-200 bg-orange-50";
}

export function DebateApp({
  initialSessions,
}: {
  initialSessions: SessionSummary[];
}) {
  const [instruction, setInstruction] = useState("");
  const [goal, setGoal] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [consensusThreshold, setConsensusThreshold] = useState(
    DEFAULT_CONSENSUS_THRESHOLD
  );
  const [maxRounds, setMaxRounds] = useState(DEFAULT_MAX_ROUNDS);
  const [agents, setAgents] = useState<AgentConfig[]>(createDefaultAgents);
  const [files, setFiles] = useState<File[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>(initialSessions);
  const [activeSession, setActiveSession] = useState<DebateSession | null>(null);
  const [brief, setBrief] = useState<DebateBrief | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<ConsensusSnapshot | null>(null);
  const [statusMessage, setStatusMessage] = useState("대기 중");
  const [errorMessage, setErrorMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  async function loadSessions() {
    const response = await fetch("/api/sessions");
    const data = (await response.json()) as { sessions: SessionSummary[] };
    setSessions(data.sessions);
  }

  function updateAgent(agentId: string, field: keyof AgentConfig, value: string) {
    setAgents((current) =>
      current.map((agent) =>
        agent.id === agentId ? { ...agent, [field]: value } : agent
      )
    );
  }

  async function loadSession(id: string) {
    setIsLoadingSession(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/sessions/${id}`);
      const data = (await response.json()) as { session?: DebateSession; error?: string };
      if (!response.ok || !data.session) {
        throw new Error(data.error || "Session load failed.");
      }

      startTransition(() => {
        setActiveSession(data.session ?? null);
        setLatestSnapshot(data.session?.snapshots.at(-1) ?? null);
        setInstruction(data.session?.input.instruction ?? "");
        setGoal(data.session?.input.goal ?? "");
        setAgents(data.session?.input.agents ?? createDefaultAgents());
        setModel(data.session?.input.model ?? DEFAULT_MODEL);
        setConsensusThreshold(
          data.session?.input.consensusThreshold ?? DEFAULT_CONSENSUS_THRESHOLD
        );
        setMaxRounds(data.session?.input.maxRounds ?? DEFAULT_MAX_ROUNDS);
        setFiles([]);
        setBrief(null);
        setStatusMessage(
          data.session?.status === "completed" ? "저장된 세션 불러옴" : "세션 확인 중"
        );
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unknown session loading error."
      );
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setBrief(null);
    setActiveSession(null);
    setLatestSnapshot(null);
    setStatusMessage("문서 업로드 준비 중");

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });
    formData.append("instruction", instruction);
    formData.append("goal", goal);
    formData.append("consensusThreshold", String(consensusThreshold));
    formData.append("maxRounds", String(maxRounds));
    formData.append("model", model);
    formData.append("apiKey", apiKey);
    formData.append("agents", JSON.stringify(agents));

    setIsRunning(true);

    try {
      const response = await fetch("/api/debates", {
        method: "POST",
        body: formData,
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({ error: "Request failed." }))) as {
          error?: string;
        };
        throw new Error(data.error || "Debate request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          if (!frame.startsWith("data: ")) {
            continue;
          }

          const payload = JSON.parse(frame.slice(6)) as DebateStreamEvent;

          if (payload.type === "session.created") {
            setActiveSession(payload.session);
            setStatusMessage("세션 시작");
          }

          if (payload.type === "document.parsed") {
            setActiveSession((current) =>
              current ? { ...current, documents: payload.documents } : current
            );
            setStatusMessage("문서 파싱 완료");
          }

          if (payload.type === "brief.generated") {
            setBrief(payload.brief);
            setStatusMessage("토론 브리프 생성 완료");
          }

          if (payload.type === "round.started") {
            setStatusMessage(
              `${payload.round}라운드 진행 중 · ${
                payload.phase === "converge" ? "수렴 모드" : "탐색 모드"
              }`
            );
          }

          if (payload.type === "message.added") {
            setActiveSession((current) =>
              current
                ? {
                    ...current,
                    messages: [...current.messages, payload.message],
                    updatedAt: new Date().toISOString(),
                  }
                : current
            );
          }

          if (payload.type === "consensus.updated") {
            setLatestSnapshot(payload.snapshot);
            setActiveSession((current) =>
              current
                ? {
                    ...current,
                    snapshots: [...current.snapshots, payload.snapshot],
                    updatedAt: new Date().toISOString(),
                  }
                : current
            );
          }

          if (payload.type === "debate.completed") {
            setActiveSession(payload.session);
            setLatestSnapshot(payload.session.snapshots.at(-1) ?? null);
            setStatusMessage("토론 완료");
            void loadSessions();
          }

          if (payload.type === "debate.failed") {
            setErrorMessage(payload.message);
            setStatusMessage("실행 실패");
          }
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown debate error.");
      setStatusMessage("실행 실패");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#f6f2e8_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="grid gap-4 rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <Badge variant="outline" className="w-fit border-sky-200 bg-sky-50 text-sky-900">
              GPT Debate Studio
            </Badge>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">
              문서를 올리고, 목표를 정하고, 서로 다른 성격의 GPT들이 끝까지 토론하게 만드세요.
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-600 md:text-base">
              `pdf/docx/txt/html` 문서를 기반으로 여러 에이전트가 채팅처럼 논의하고,
              목표 기준 합의율이 충분히 높아지면 결과를 고정합니다.
            </p>
          </div>
          <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">현재 상태</span>
              <Badge variant={isRunning ? "default" : "secondary"}>
                {isRunning ? "Running" : "Ready"}
              </Badge>
            </div>
            <p className="text-sm text-zinc-600">{statusMessage}</p>
            <div className="grid gap-2 md:grid-cols-3">
              <StatCard icon={Files} label="문서 형식" value="PDF / DOCX / TXT / HTML" />
              <StatCard icon={Bot} label="에이전트" value={`${agents.length}명`} />
              <StatCard
                icon={Scale}
                label="합의 기준"
                value={`${latestSnapshot?.agreementScore ?? consensusThreshold}%`}
              />
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[480px_minmax(0,1fr)]">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Goal Composer</CardTitle>
                <CardDescription>
                  합의율은 여기서 정한 목표를 기준으로 계산됩니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Instruction">
                  <Textarea
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    placeholder="이 문서를 바탕으로 가장 설득력 있는 전략을 도출해라."
                    className="min-h-28"
                    required
                  />
                </Field>
                <Field label="Debate Goal">
                  <Textarea
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder="문서 근거만으로 실행 가능한 결론 1개를 도출한다."
                    className="min-h-24"
                    required
                  />
                </Field>
                <Field label="OpenAI API Key (optional)">
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="입력하지 않으면 OPENAI_API_KEY를 사용합니다."
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Model">
                    <select
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                    >
                      <option value="gpt-5">gpt-5</option>
                      <option value="gpt-5-mini">gpt-5-mini</option>
                      <option value="gpt-4.1">gpt-4.1</option>
                    </select>
                  </Field>
                  <Field label="Files">
                    <Input
                      type="file"
                      accept=".pdf,.docx,.txt,.html,.htm"
                      multiple
                      onChange={(event) =>
                        setFiles(Array.from(event.target.files ?? []))
                      }
                    />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label={`Consensus Threshold · ${consensusThreshold}%`}
                    helper="Moderator score와 goal alignment를 함께 봅니다."
                  >
                    <input
                      type="range"
                      min={60}
                      max={95}
                      step={1}
                      value={consensusThreshold}
                      onChange={(event) =>
                        setConsensusThreshold(Number(event.target.value))
                      }
                      className="w-full accent-zinc-900"
                    />
                  </Field>
                  <Field
                    label={`Max Rounds · ${maxRounds}`}
                    helper="8라운드 이후는 수렴 모드로 전환됩니다."
                  >
                    <input
                      type="range"
                      min={8}
                      max={16}
                      step={1}
                      value={maxRounds}
                      onChange={(event) => setMaxRounds(Number(event.target.value))}
                      className="w-full accent-zinc-900"
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  {files.length === 0 ? (
                    <Badge variant="secondary">업로드된 문서 없음</Badge>
                  ) : (
                    files.map((file) => (
                      <Badge key={`${file.name}-${file.size}`} variant="outline">
                        {file.name}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Agent Builder</CardTitle>
                  <CardDescription>
                    역할, 성격, 말투가 실제 토론 프롬프트에 그대로 반영됩니다.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAgents((current) => [...current, createNewAgent()])}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Agent 추가
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {personaHints.map((hint) => (
                    <Badge key={hint} variant="secondary">
                      {hint}
                    </Badge>
                  ))}
                </div>
                {agents.map((agent, index) => (
                  <div
                    key={agent.id}
                    className={`rounded-2xl border p-4 ${agentTone(agent.role, index)}`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">{agent.name}</p>
                        <p className="text-xs text-zinc-600">{agent.role}</p>
                      </div>
                      {agents.length > 2 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setAgents((current) =>
                              current.filter((item) => item.id !== agent.id)
                            )
                          }
                        >
                          제거
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-3">
                      <Input
                        value={agent.name}
                        onChange={(event) =>
                          updateAgent(agent.id, "name", event.target.value)
                        }
                        placeholder="Agent name"
                      />
                      <Input
                        value={agent.role}
                        onChange={(event) =>
                          updateAgent(agent.id, "role", event.target.value)
                        }
                        placeholder="Role"
                      />
                      <Textarea
                        value={agent.persona}
                        onChange={(event) =>
                          updateAgent(agent.id, "persona", event.target.value)
                        }
                        placeholder="성격"
                        className="min-h-20"
                      />
                      <Input
                        value={agent.tone || ""}
                        onChange={(event) =>
                          updateAgent(agent.id, "tone", event.target.value)
                        }
                        placeholder="Tone"
                      />
                      <Textarea
                        value={agent.debateStyle || ""}
                        onChange={(event) =>
                          updateAgent(agent.id, "debateStyle", event.target.value)
                        }
                        placeholder="Debate style"
                        className="min-h-20"
                      />
                      <Textarea
                        value={agent.objective || ""}
                        onChange={(event) =>
                          updateAgent(agent.id, "objective", event.target.value)
                        }
                        placeholder="Objective"
                        className="min-h-20"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" size="lg" disabled={isRunning}>
              {isRunning ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  Debate running
                </>
              ) : (
                "토론 시작"
              )}
            </Button>

            {errorMessage ? (
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="flex items-start gap-3 p-4">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-orange-700" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-orange-900">실행 오류</p>
                    <p className="text-sm text-orange-800">{errorMessage}</p>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </form>

          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
              <Card className="min-h-[680px]">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>Debate Timeline</CardTitle>
                      <CardDescription>
                        실제 메시지 흐름과 persona 반영 결과를 채팅 형식으로 확인합니다.
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {activeSession?.messages.length ?? 0} messages
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="h-[580px]">
                  <ScrollArea className="h-full pr-2">
                    <div className="space-y-4">
                      {!activeSession?.messages.length ? (
                        <EmptyState
                          icon={MessageSquareText}
                          title="토론 타임라인이 비어 있습니다"
                          description="왼쪽 패널에서 문서와 목표를 입력하고 토론을 시작하면 메시지가 이곳에 순서대로 쌓입니다."
                        />
                      ) : (
                        activeSession.messages.map((message, index) => (
                          <div
                            key={message.id}
                            className={`rounded-2xl border p-4 ${agentTone(
                              message.role,
                              index
                            )}`}
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-zinc-950">
                                {message.agentName}
                              </p>
                              <Badge variant="secondary">{message.role}</Badge>
                              <Badge variant="outline">Round {message.round}</Badge>
                              <Badge variant="outline">{message.personaSummary}</Badge>
                              <span className="text-xs text-zinc-500">
                                {formatTimestamp(message.createdAt)}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                              {message.content}
                            </p>
                            {message.references.length ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {message.references.map((reference) => (
                                  <Badge key={reference} variant="outline">
                                    {reference}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Goal & Consensus</CardTitle>
                    <CardDescription>
                      현재 합의율과 왜 아직 부족한지를 함께 표시합니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">
                        Goal
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-800">
                        {goal || "아직 입력되지 않았습니다."}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-zinc-700">Agreement Score</span>
                        <span className="text-zinc-900">
                          {latestSnapshot?.agreementScore ?? 0}%
                        </span>
                      </div>
                      <Progress value={latestSnapshot?.agreementScore ?? 0} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                      <MiniMetric
                        label="Goal Alignment"
                        value={latestSnapshot?.goalAlignmentScore ?? 0}
                      />
                      <MiniMetric
                        label="Evidence Strength"
                        value={latestSnapshot?.evidenceStrengthScore ?? 0}
                      />
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-zinc-800">
                        왜 아직 80%가 아닌가
                      </p>
                      <p className="text-sm leading-6 text-zinc-600">
                        {latestSnapshot?.openDisputes[0] ||
                          "토론이 아직 시작되지 않았습니다."}
                      </p>
                    </div>
                    {brief ? (
                      <div className="space-y-2 rounded-2xl border border-zinc-200 p-4">
                        <p className="text-sm font-medium text-zinc-900">Debate Brief</p>
                        <ul className="space-y-2 text-sm text-zinc-600">
                          {brief.successCriteria.map((criterion) => (
                            <li key={criterion}>• {criterion}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Final Consensus</CardTitle>
                    <CardDescription>
                      합의 도달 또는 최대 라운드 종료 후 결과가 고정됩니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!activeSession?.finalReport ? (
                      <EmptyState
                        icon={Sparkles}
                        title="최종 결과 대기 중"
                        description="Moderator가 목표와 근거를 충분히 수렴하면 여기서 최종 합의안을 보여줍니다."
                      />
                    ) : (
                      <>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">
                            Recommendation
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-900">
                            {activeSession.finalReport.finalAnswer}
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                          <MiniMetric
                            label="Agreement"
                            value={activeSession.finalReport.agreementScore}
                          />
                          <MiniMetric
                            label="Goal Fit"
                            value={activeSession.finalReport.goalAlignmentScore}
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-zinc-900">Key Evidence</p>
                          {activeSession.finalReport.keyEvidence.length ? (
                            <ul className="space-y-2 text-sm text-zinc-600">
                              {activeSession.finalReport.keyEvidence.map((item) => (
                                <li key={item}>• {item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-zinc-500">정리된 증거가 아직 없습니다.</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-zinc-900">Remaining Disputes</p>
                          {activeSession.finalReport.remainingDisputes.length ? (
                            <ul className="space-y-2 text-sm text-zinc-600">
                              {activeSession.finalReport.remainingDisputes.map((item) => (
                                <li key={item}>• {item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-zinc-500">남은 주요 이견이 없습니다.</p>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Saved Sessions</CardTitle>
                  <CardDescription>
                    완료된 토론과 진행 중 세션을 다시 열어볼 수 있습니다.
                  </CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadSessions()}>
                  새로고침
                </Button>
              </CardHeader>
              <CardContent>
                {sessions.length === 0 ? (
                  <EmptyState
                    icon={Files}
                    title="저장된 세션이 없습니다"
                    description="첫 토론을 실행하면 이곳에 자동으로 기록됩니다."
                  />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        className="rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50"
                        onClick={() => void loadSession(session.id)}
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <Badge variant={session.status === "completed" ? "default" : "secondary"}>
                            {session.status}
                          </Badge>
                          <span className="text-xs text-zinc-500">
                            {formatTimestamp(session.updatedAt)}
                          </span>
                        </div>
                        <p className="text-sm font-medium leading-6 text-zinc-950">
                          {session.goal}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-zinc-600">
                          {session.instruction}
                        </p>
                        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                          <span>{session.messageCount} messages</span>
                          <span>{session.agreementScore ?? 0}% agreement</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {isLoadingSession ? (
                  <p className="mt-3 text-sm text-zinc-500">세션을 불러오는 중입니다…</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        {helper ? <span className="text-xs text-zinc-500">{helper}</span> : null}
      </div>
      {children}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
      <Icon className="h-4 w-4 text-zinc-500" />
      <p className="mt-3 text-xs uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-900">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700">{label}</span>
        <span className="text-sm text-zinc-900">{value}%</span>
      </div>
      <Progress value={value} />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-6 py-10 text-center">
      <Icon className="h-7 w-7 text-zinc-400" />
      <p className="mt-4 text-sm font-medium text-zinc-900">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{description}</p>
    </div>
  );
}
