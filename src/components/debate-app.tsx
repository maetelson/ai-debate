"use client";

import { startTransition, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import {
  AlertCircle,
  ChevronDown,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Plus,
  Settings2,
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
import { formatTimestamp, truncate } from "@/lib/utils";

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

function createFreshDraft() {
  return {
    instruction: "",
    goal: "",
    model: DEFAULT_MODEL,
    consensusThreshold: DEFAULT_CONSENSUS_THRESHOLD,
    maxRounds: DEFAULT_MAX_ROUNDS,
    agents: createDefaultAgents(),
    files: [] as File[],
  };
}

function agentTone(role: string, index: number) {
  if (/moderator|judge|arbiter/i.test(role)) {
    return "border-zinc-300 bg-zinc-50";
  }

  return index % 2 === 0
    ? "border-zinc-200 bg-white"
    : "border-zinc-300 bg-zinc-50";
}

export function DebateApp({
  initialSessions,
}: {
  initialSessions: SessionSummary[];
}) {
  const [instruction, setInstruction] = useState("");
  const [goal, setGoal] = useState("");
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
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  const selectedDocumentNames = useMemo(() => {
    if (activeSession?.documents.length) {
      return activeSession.documents.map((document) => document.name);
    }

    return files.map((file) => file.name);
  }, [activeSession, files]);

  const selectedAgents = activeSession?.input.agents ?? agents;
  const selectedGoal = activeSession?.input.goal || goal;
  const selectedInstruction = activeSession?.input.instruction || instruction;
  const selectedThreshold =
    activeSession?.input.consensusThreshold ?? consensusThreshold;
  const selectedMaxRounds = activeSession?.input.maxRounds ?? maxRounds;
  const selectedModel = activeSession?.input.model ?? model;

  async function loadSessions() {
    const response = await fetch("/api/sessions");
    const data = (await response.json()) as { sessions: SessionSummary[] };
    setSessions(data.sessions);
  }

  function resetDraft() {
    const fresh = createFreshDraft();
    setInstruction(fresh.instruction);
    setGoal(fresh.goal);
    setModel(fresh.model);
    setConsensusThreshold(fresh.consensusThreshold);
    setMaxRounds(fresh.maxRounds);
    setAgents(fresh.agents);
    setFiles(fresh.files);
    setBrief(null);
    setErrorMessage("");
  }

  function openNewSessionModal() {
    resetDraft();
    setIsComposerOpen(true);
  }

  function openEditSessionModal() {
    setIsComposerOpen(true);
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
    setIsComposerOpen(false);

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });
    formData.append("instruction", instruction);
    formData.append("goal", goal);
    formData.append("consensusThreshold", String(consensusThreshold));
    formData.append("maxRounds", String(Math.min(Math.max(maxRounds || 10, 10), 50)));
    formData.append("model", model);
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
    <>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(24,24,27,0.08),_transparent_28%),linear-gradient(180deg,#fcfcfd_0%,#f4f4f5_100%)]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1680px] gap-4 p-4 lg:p-6">
          <aside className="hidden w-[300px] shrink-0 lg:block">
            <div className="sticky top-6 flex h-[calc(100vh-3rem)] flex-col rounded-[28px] border border-zinc-200 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur">
              <div className="space-y-3">
                <Badge variant="outline" className="w-fit bg-zinc-100 text-zinc-900">
                  GPT Debate Studio
                </Badge>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-zinc-950">
                    Debate Sessions
                  </h1>
                  <p className="mt-1 text-sm leading-6 text-zinc-500">
                    새 세션을 시작하고, 이전 토론을 다시 불러와 이어서 확인하세요.
                  </p>
                </div>
                <Button className="w-full" onClick={openNewSessionModal}>
                  <Plus className="mr-2 h-4 w-4" />
                  새 세션
                </Button>
              </div>

              <Separator className="my-4" />

              <ScrollArea className="flex-1 pr-1">
                <div className="space-y-2">
                  {isLoadingSession ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
                      세션을 불러오는 중입니다…
                    </div>
                  ) : null}
                  {sessions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
                      저장된 세션이 아직 없습니다.
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        className="w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50"
                        onClick={() => void loadSession(session.id)}
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <Badge
                            variant={session.status === "completed" ? "default" : "secondary"}
                          >
                            {session.status}
                          </Badge>
                          <span className="text-xs text-zinc-500">
                            {formatTimestamp(session.updatedAt)}
                          </span>
                        </div>
                        <p className="text-sm font-medium leading-6 text-zinc-950">
                          {session.goal}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                          {session.instruction}
                        </p>
                        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                          <span>{session.messageCount} messages</span>
                          <span>{session.agreementScore ?? 0}%</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col gap-4">
            <header className="rounded-[28px] border border-zinc-200 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={isRunning ? "default" : "secondary"}>
                      {isRunning ? "Running" : "Ready"}
                    </Badge>
                    <Badge variant="outline">{statusMessage}</Badge>
                    {selectedDocumentNames.length ? (
                      <Badge variant="outline">{selectedDocumentNames.length} docs</Badge>
                    ) : null}
                    {selectedAgents.length ? (
                      <Badge variant="outline">{selectedAgents.length} agents</Badge>
                    ) : null}
                    <Badge variant="outline">{selectedThreshold}% threshold</Badge>
                    <Badge variant="outline">{selectedMaxRounds} rounds</Badge>
                    <Badge variant="outline">{selectedModel}</Badge>
                  </div>

                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
                      {selectedGoal || "새 세션을 시작해 토론 목표를 설정하세요."}
                    </h2>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
                      {selectedInstruction
                        ? truncate(selectedInstruction, 180)
                        : "Goal Composer와 Agent Builder는 새 세션 팝업에서만 설정합니다."}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" onClick={openEditSessionModal}>
                    <Pencil className="mr-2 h-4 w-4" />
                    설정 수정
                  </Button>
                  <Button onClick={openNewSessionModal}>
                    <Plus className="mr-2 h-4 w-4" />
                    새 세션
                  </Button>
                </div>
              </div>

              {(selectedGoal || selectedInstruction || selectedAgents.length > 0) && (
                <details className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-zinc-800">
                    <span className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      자세한 세션 설정 보기
                    </span>
                    <ChevronDown className="h-4 w-4 text-zinc-500" />
                  </summary>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-4">
                      <MetaBlock label="Goal" value={selectedGoal || "설정되지 않음"} />
                      <MetaBlock
                        label="Instruction"
                        value={selectedInstruction || "설정되지 않음"}
                      />
                      <MetaBlock
                        label="Documents"
                        value={
                          selectedDocumentNames.length
                            ? selectedDocumentNames.join(", ")
                            : "아직 문서가 선택되지 않았습니다."
                        }
                      />
                    </div>
                    <div className="space-y-4">
                      <MetaBlock
                        label="Agents"
                        value={selectedAgents
                          .map((agent) => `${agent.name} · ${agent.role}`)
                          .join("\n")}
                      />
                      <MetaBlock
                        label="Advanced"
                        value={`Consensus ${selectedThreshold}% · Max rounds ${selectedMaxRounds} · Model ${selectedModel}`}
                      />
                    </div>
                  </div>
                </details>
              )}
            </header>

            <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Card className="min-h-[720px]">
                <CardHeader className="border-b border-zinc-100 pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>Debate Timeline</CardTitle>
                      <CardDescription>
                        실제 배포된 앱처럼 본문은 대화 자체에 집중하도록 구성했습니다.
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {activeSession?.messages.length ?? 0} messages
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="h-[640px] pt-5">
                  <ScrollArea className="h-full pr-2">
                    <div className="space-y-4">
                      {!activeSession?.messages.length ? (
                        <EmptyState
                          icon={MessageSquareText}
                          title="대화가 아직 시작되지 않았습니다"
                          description="상단의 새 세션 버튼을 눌러 Goal과 Agent를 설정하면, 메인 화면은 토론 본문만 보여주는 형태로 진행됩니다."
                          action={
                            <Button onClick={openNewSessionModal}>
                              <Plus className="mr-2 h-4 w-4" />
                              새 세션 시작
                            </Button>
                          }
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

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Consensus</CardTitle>
                    <CardDescription>
                      목표 기준 합의율과 아직 남은 핵심 이견을 표시합니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">
                        Goal
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-800">
                        {selectedGoal || "아직 설정되지 않았습니다."}
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
                    <MiniMetric
                      label="Goal Alignment"
                      value={latestSnapshot?.goalAlignmentScore ?? 0}
                    />
                    <MiniMetric
                      label="Evidence Strength"
                      value={latestSnapshot?.evidenceStrengthScore ?? 0}
                    />
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-zinc-800">현재 남은 쟁점</p>
                      <p className="text-sm leading-6 text-zinc-600">
                        {latestSnapshot?.openDisputes[0] ||
                          "토론이 시작되면 남은 쟁점이 이곳에 표시됩니다."}
                      </p>
                    </div>
                    {brief ? (
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <p className="text-sm font-medium text-zinc-900">Debate Brief</p>
                        <ul className="mt-3 space-y-2 text-sm text-zinc-600">
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
                        <MiniMetric
                          label="Agreement"
                          value={activeSession.finalReport.agreementScore}
                        />
                        <MiniMetric
                          label="Goal Fit"
                          value={activeSession.finalReport.goalAlignmentScore}
                        />
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

                {errorMessage ? (
                  <Card className="border-zinc-300 bg-zinc-100">
                    <CardContent className="flex items-start gap-3 p-4">
                      <AlertCircle className="mt-0.5 h-4 w-4 text-zinc-700" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-zinc-900">실행 오류</p>
                        <p className="text-sm text-zinc-700">{errorMessage}</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          </main>
        </div>
      </div>

      {isComposerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-[0_30px_80px_rgba(9,9,11,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-5">
              <div>
                <p className="text-sm font-medium text-zinc-500">New Session</p>
                <h3 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
                  Goal과 Agent를 먼저 정하고 토론을 시작합니다.
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  메인 화면에는 요약만 남기고, 자세한 설정은 이 팝업과 상단 토글에서만 확인할 수 있습니다.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setIsComposerOpen(false)}>
                닫기
              </Button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="max-h-[calc(92vh-88px)] overflow-auto px-6 py-6">
                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-6">
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
                        <Field label="Documents">
                          <Input
                            type="file"
                            accept=".pdf,.docx,.txt,.html,.htm"
                            multiple
                            onChange={(event) =>
                              setFiles(Array.from(event.target.files ?? []))
                            }
                          />
                        </Field>
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
                      <CardHeader>
                        <CardTitle>Agent Builder</CardTitle>
                        <CardDescription>
                          역할, 성격, 말투가 실제 토론 프롬프트에 그대로 반영됩니다.
                        </CardDescription>
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
                                <p className="text-sm font-semibold text-zinc-900">
                                  {agent.name}
                                </p>
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
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setAgents((current) => [...current, createNewAgent()])
                          }
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Agent 추가
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Advanced Settings</CardTitle>
                        <CardDescription>
                          모델, 라운드 수, 합의 기준을 조정합니다.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
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
                          label="Max Rounds"
                          helper="기본 20, 허용 범위는 10~50입니다."
                        >
                          <Input
                            type="number"
                            min={10}
                            max={50}
                            value={maxRounds}
                            onChange={(event) =>
                              setMaxRounds(
                                Math.min(
                                  Math.max(Number(event.target.value) || 10, 10),
                                  50
                                )
                              )
                            }
                            className="w-full"
                          />
                        </Field>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Session Summary</CardTitle>
                        <CardDescription>
                          시작 전에 선택된 설정을 한 번 더 확인합니다.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <MetaBlock
                          label="Goal"
                          value={goal || "아직 목표가 입력되지 않았습니다."}
                        />
                        <MetaBlock
                          label="Instruction"
                          value={instruction || "아직 instruction이 입력되지 않았습니다."}
                        />
                        <MetaBlock
                          label="Agents"
                          value={agents
                            .map((agent) => `${agent.name} · ${agent.role} · ${agent.persona}`)
                            .join("\n")}
                        />
                        <MetaBlock
                          label="Documents"
                          value={
                            files.length
                              ? files.map((file) => file.name).join(", ")
                              : "아직 문서가 선택되지 않았습니다."
                          }
                        />
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-6 py-5">
                <p className="text-sm text-zinc-500">
                  시작 후 메인 화면에는 요약만 남고, 상세 설정은 상단 토글에서 확인할 수 있습니다.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsComposerOpen(false)}>
                    취소
                  </Button>
                  <Button type="submit" disabled={isRunning || files.length === 0}>
                    {isRunning ? (
                      <>
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                        Debate running
                      </>
                    ) : (
                      "토론 시작"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
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

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-800">
        {value}
      </p>
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
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-6 py-10 text-center">
      <Icon className="h-7 w-7 text-zinc-400" />
      <p className="mt-4 text-sm font-medium text-zinc-900">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
