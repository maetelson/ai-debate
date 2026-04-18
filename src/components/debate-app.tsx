"use client";

import { startTransition, useMemo, useState } from "react";
import {
  AlertCircle,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Trash2,
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
  StreamingMessage,
} from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";

function createFreshDraft() {
  return {
    title: "",
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

function messageLayout(role: string) {
  if (/moderator|judge|arbiter/i.test(role)) {
    return {
      wrapper: "flex justify-center",
      bubble: "w-full max-w-3xl border-zinc-200 bg-zinc-100",
      title: "text-zinc-950",
      meta: "text-zinc-500",
      body: "text-zinc-800",
    };
  }

  if (/critic|challenger/i.test(role)) {
    return {
      wrapper: "flex justify-start",
      bubble: "max-w-3xl border-zinc-200 bg-white",
      title: "text-zinc-950",
      meta: "text-zinc-500",
      body: "text-zinc-800",
    };
  }

  return {
    wrapper: "flex justify-end",
    bubble: "max-w-3xl border-zinc-300 bg-zinc-200",
    title: "text-zinc-950",
    meta: "text-zinc-500",
    body: "text-zinc-900",
  };
}

function sanitizeDisplayContent(content: string) {
  return content.replace(/\s*\[[^\]]+\]/g, "").trim();
}

export function DebateApp({
  initialSessions,
}: {
  initialSessions: SessionSummary[];
}) {
  const [instruction, setInstruction] = useState("");
  const [title, setTitle] = useState("");
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
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const selectedDocumentNames = useMemo(() => {
    if (activeSession?.documents.length) {
      return activeSession.documents.map((document) => document.name);
    }

    return files.map((file) => file.name);
  }, [activeSession, files]);

  const selectedAgents = activeSession?.input.agents ?? agents;
  const selectedTitle = activeSession?.input.title || title;
  const selectedGoal = activeSession?.input.goal || goal;
  const selectedThreshold =
    activeSession?.input.consensusThreshold ?? consensusThreshold;
  const selectedMaxRounds = activeSession?.input.maxRounds ?? maxRounds;
  const selectedModel = activeSession?.input.model ?? model;
  const displayMessages = useMemo(
    () => [...(activeSession?.messages ?? []), ...streamingMessages],
    [activeSession?.messages, streamingMessages]
  );

  async function loadSessions() {
    const response = await fetch("/api/sessions");
    const data = (await response.json()) as { sessions: SessionSummary[] };
    setSessions(data.sessions);
  }

  function startSessionRename(session: SessionSummary) {
    setEditingSessionId(session.id);
    setEditingSessionTitle(session.title || session.goal);
  }

  function cancelSessionRename() {
    setEditingSessionId(null);
    setEditingSessionTitle("");
  }

  async function saveSessionRename(id: string) {
    const nextTitle = editingSessionTitle.trim();
    if (!nextTitle) {
      setErrorMessage("세션 제목은 비워둘 수 없습니다.");
      return;
    }

    setSavingSessionId(id);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: nextTitle }),
      });
      const data = (await response.json()) as {
        session?: DebateSession;
        summary?: SessionSummary;
        error?: string;
      };

      if (!response.ok || !data.summary || !data.session) {
        throw new Error(data.error || "Session rename failed.");
      }

      setSessions((current) =>
        current.map((session) => (session.id === id ? data.summary! : session))
      );
      setActiveSession((current) => (current?.id === id ? data.session! : current));
      if (activeSession?.id === id) {
        setTitle(data.session.input.title);
      }
      cancelSessionRename();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unknown session rename error."
      );
    } finally {
      setSavingSessionId(null);
    }
  }

  async function deleteSession(id: string) {
    const target = sessions.find((session) => session.id === id);
    const label = target?.title || target?.goal || "이 세션";
    if (!window.confirm(`'${label}' 세션을 삭제할까요?`)) {
      return;
    }

    setDeletingSessionId(id);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/sessions/${id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Session delete failed.");
      }

      setSessions((current) => current.filter((session) => session.id !== id));
      if (activeSession?.id === id) {
        setActiveSession(null);
        setLatestSnapshot(null);
        setBrief(null);
        setStreamingMessages([]);
        setInstruction("");
        setTitle("");
        setGoal("");
        setStatusMessage("대기 중");
      }
      if (editingSessionId === id) {
        cancelSessionRename();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unknown session delete error."
      );
    } finally {
      setDeletingSessionId(null);
    }
  }

  function resetDraft() {
    const fresh = createFreshDraft();
    setInstruction(fresh.instruction);
    setTitle(fresh.title);
    setGoal(fresh.goal);
    setModel(fresh.model);
    setConsensusThreshold(fresh.consensusThreshold);
    setMaxRounds(fresh.maxRounds);
    setAgents(fresh.agents);
    setFiles(fresh.files);
    setBrief(null);
    setErrorMessage("");
    setStreamingMessages([]);
    cancelSessionRename();
  }

  function openNewSessionModal() {
    resetDraft();
    setIsComposerOpen(true);
  }

  async function loadSession(id: string) {
    setIsLoadingSession(true);
    setErrorMessage("");
    cancelSessionRename();

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
        setTitle(data.session?.input.title ?? "");
        setGoal(data.session?.input.goal ?? "");
        setAgents(data.session?.input.agents ?? createDefaultAgents());
        setModel(data.session?.input.model ?? DEFAULT_MODEL);
        setConsensusThreshold(
          data.session?.input.consensusThreshold ?? DEFAULT_CONSENSUS_THRESHOLD
        );
        setMaxRounds(data.session?.input.maxRounds ?? DEFAULT_MAX_ROUNDS);
        setFiles([]);
        setBrief(null);
        setStreamingMessages([]);
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
    setStreamingMessages([]);
    setStatusMessage("문서 업로드 준비 중");
    setIsComposerOpen(false);

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });
    formData.append("instruction", instruction);
    formData.append("title", title);
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
      let currentSessionId = "";

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
            currentSessionId = payload.session.id;
            setActiveSession(payload.session);
            setSessions((current) => {
              const next = [
                {
                  id: payload.session.id,
                  createdAt: payload.session.createdAt,
                  updatedAt: payload.session.updatedAt,
                  status: payload.session.status,
                  title: payload.session.input.title,
                  goal: payload.session.input.goal,
                  instruction: payload.session.input.instruction,
                  messageCount: 0,
                  agreementScore: 0,
                },
                ...current.filter((session) => session.id !== payload.session.id),
              ];

              return next;
            });
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

          if (payload.type === "message.started") {
            setStreamingMessages((current) => [...current, payload.message]);
            setStatusMessage(`${payload.message.agentName} thinking...`);
          }

          if (payload.type === "message.delta") {
            setStreamingMessages((current) =>
              current.map((message) =>
                message.id === payload.messageId
                  ? {
                      ...message,
                      content: message.content + payload.delta,
                      status: "streaming",
                    }
                  : message
              )
            );
          }

          if (payload.type === "message.completed") {
            setStreamingMessages((current) =>
              current.filter((message) => message.agentId !== payload.message.agentId)
            );
            setActiveSession((current) =>
              current
                ? {
                    ...current,
                    messages: [...current.messages, payload.message],
                    updatedAt: new Date().toISOString(),
                  }
                : current
            );
            setSessions((current) =>
              current.map((session) =>
                session.id === currentSessionId
                  ? {
                      ...session,
                      messageCount: session.messageCount + 1,
                      updatedAt: new Date().toISOString(),
                    }
                  : session
              )
            );
          }

          if (payload.type === "consensus.updated") {
            setLatestSnapshot(payload.snapshot);
            setSessions((current) =>
              current.map((session) =>
                session.id === currentSessionId
                  ? {
                      ...session,
                      agreementScore: payload.snapshot.agreementScore,
                      updatedAt: new Date().toISOString(),
                    }
                  : session
              )
            );
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
      <div className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(24,24,27,0.08),_transparent_28%),linear-gradient(180deg,#fcfcfd_0%,#f4f4f5_100%)]">
        <div className="mx-auto flex h-screen w-full max-w-[1680px] gap-4 p-4 lg:p-6">
          <aside className="hidden w-[320px] shrink-0 lg:block">
            <div className="flex h-full flex-col rounded-[28px] bg-white p-4 shadow-sm">
              <div className="space-y-3">
                <Badge variant="outline" className="w-fit">
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
                    <div className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">
                      세션을 불러오는 중입니다…
                    </div>
                  ) : null}
                  {sessions.length === 0 ? (
                    <div className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">
                      저장된 세션이 아직 없습니다.
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <div
                        key={session.id}
                        role="button"
                        tabIndex={0}
                        className={`group w-full rounded-2xl border p-4 text-left transition ${
                          activeSession?.id === session.id
                            ? "border-zinc-300 bg-white shadow-sm"
                            : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                        }`}
                        onClick={() => void loadSession(session.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void loadSession(session.id);
                          }
                        }}
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <Badge
                            variant={session.status === "completed" ? "default" : "secondary"}
                          >
                            {session.status}
                          </Badge>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">
                              {formatTimestamp(session.updatedAt)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-7 w-7 rounded-full text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-700"
                              disabled={deletingSessionId === session.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteSession(session.id);
                              }}
                            >
                              {deletingSessionId === session.id ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        {editingSessionId === session.id ? (
                          <Input
                            value={editingSessionTitle}
                            autoFocus
                            disabled={savingSessionId === session.id}
                            className="h-9 border-zinc-300 bg-white text-sm font-medium"
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setEditingSessionTitle(event.target.value)}
                            onBlur={cancelSessionRename}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void saveSessionRename(session.id);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelSessionRename();
                              }
                            }}
                          />
                        ) : (
                          <p
                            className="text-sm font-medium leading-6 text-zinc-950"
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              startSessionRename(session);
                            }}
                          >
                            {session.title || session.goal}
                          </p>
                        )}
                        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                          <span>{session.messageCount} messages</span>
                          <span>{session.agreementScore ?? 0}%</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm lg:hidden">
              <div>
                <p className="text-sm font-medium text-zinc-950">Debate Sessions</p>
                <p className="text-xs text-zinc-500">{statusMessage}</p>
              </div>
              <Button onClick={openNewSessionModal}>
                <Plus className="mr-2 h-4 w-4" />
                새 세션
              </Button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="flex min-h-0 flex-col overflow-hidden border-0 shadow-sm">
                <CardHeader className="pb-4">
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
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <CardTitle className="text-xl leading-8">
                          {selectedTitle || "새 세션을 시작해 토론 제목을 설정하세요."}
                        </CardTitle>
                        <CardDescription className="mt-2 line-clamp-2 max-w-4xl">
                          {selectedGoal || "좌측 사이드바에서 새 세션을 시작하세요."}
                        </CardDescription>
                      </div>
                      <Badge variant="outline">{displayMessages.length} messages</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 pt-0">
                  <ScrollArea className="h-full pr-2">
                    <div className="space-y-4">
                      {!displayMessages.length ? (
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
                        displayMessages.map((message) => {
                          const layout = messageLayout(message.role);
                          const isStreaming = "status" in message;
                          const visibleContent = sanitizeDisplayContent(message.content);

                          return (
                            <div key={message.id} className={layout.wrapper}>
                              <div className={`w-full rounded-2xl border p-4 ${layout.bubble}`}>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <p className={`text-sm font-semibold ${layout.title}`}>
                                    {message.agentName}
                                  </p>
                                  <span className={`text-xs ${layout.meta}`}>
                                    {formatTimestamp(message.createdAt)}
                                  </span>
                                </div>
                                {visibleContent ? (
                                  <p
                                    className={`whitespace-pre-wrap text-sm leading-6 ${layout.body}`}
                                  >
                                    {visibleContent}
                                  </p>
                                ) : isStreaming ? (
                                  <ThinkingDots />
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                        
                      )}

                      {activeSession?.finalReport ? (
                        <div className="pt-2">
                          <div className="rounded-[24px] bg-zinc-950 p-6 text-white">
                            <p className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-400">
                              Final Consensus
                            </p>
                            <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-white">
                              {activeSession.finalReport.finalAnswer}
                            </p>
                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-zinc-200">Key Evidence</p>
                                {activeSession.finalReport.keyEvidence.length ? (
                                  <ul className="space-y-2 text-sm text-zinc-300">
                                    {activeSession.finalReport.keyEvidence.map((item) => (
                                      <li key={item}>• {item}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-zinc-400">정리된 증거가 아직 없습니다.</p>
                                )}
                              </div>
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-zinc-200">
                                  Remaining Disputes
                                </p>
                                {activeSession.finalReport.remainingDisputes.length ? (
                                  <ul className="space-y-2 text-sm text-zinc-300">
                                    {activeSession.finalReport.remainingDisputes.map((item) => (
                                      <li key={item}>• {item}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-zinc-400">남은 주요 이견이 없습니다.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <div className="min-h-0">
                <Card className="flex h-full min-h-0 flex-col border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle>Consensus</CardTitle>
                    <CardDescription>
                      목표 기준 합의율과 아직 남은 핵심 이견을 표시합니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-h-0 flex-1 overflow-y-auto">
                    <div className="flex h-full flex-col gap-4">
                      <MetricRow
                        label="Agreement Score"
                        value={`${latestSnapshot?.agreementScore ?? 0}%`}
                      />
                      <MetricRow
                        label="Goal Alignment"
                        value={`${latestSnapshot?.goalAlignmentScore ?? 0}%`}
                      />
                      <MetricRow
                        label="Evidence Strength"
                        value={`${latestSnapshot?.evidenceStrengthScore ?? 0}%`}
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
                        <div className="rounded-2xl bg-zinc-50 p-4">
                          <p className="text-sm font-medium text-zinc-900">Debate Brief</p>
                          <ul className="mt-3 space-y-2 text-sm text-zinc-600">
                            {brief.successCriteria.map((criterion) => (
                              <li key={criterion}>• {criterion}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                {errorMessage ? (
                  <Card className="border-0 bg-zinc-100 shadow-sm">
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-sm"
          onClick={() => setIsComposerOpen(false)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-[0_30px_80px_rgba(9,9,11,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
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

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Goal Composer</CardTitle>
                        <CardDescription>
                          합의율은 여기서 정한 목표를 기준으로 계산됩니다.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Field label="Session Title">
                          <Input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="예: 3일 MVP 의사결정 토론"
                            required
                          />
                        </Field>
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
                        <CardTitle>Agent Setup</CardTitle>
                        <CardDescription>
                          아래 에이전트 구성이 그대로 적용됩니다.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {agents.map((agent, index) => (
                          <div
                            key={agent.id}
                            className={`rounded-2xl border p-4 ${agentTone(agent.role, index)}`}
                          >
                            <p className="text-sm font-semibold text-zinc-900">{agent.role}</p>
                            <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">
                              <p>
                                <span className="font-medium text-zinc-800">Persona:</span>{" "}
                                {agent.persona}
                              </p>
                              <p>
                                <span className="font-medium text-zinc-800">Tone:</span>{" "}
                                {agent.tone || "설정 없음"}
                              </p>
                              <p>
                                <span className="font-medium text-zinc-800">Style:</span>{" "}
                                {agent.debateStyle || "설정 없음"}
                              </p>
                              <p>
                                <span className="font-medium text-zinc-800">Objective:</span>{" "}
                                {agent.objective || "설정 없음"}
                              </p>
                            </div>
                          </div>
                        ))}
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
                        <Field label="Consensus Threshold">
                          <Input
                            type="number"
                            min={60}
                            max={95}
                            value={consensusThreshold}
                            onChange={(event) =>
                              setConsensusThreshold(
                                Math.min(
                                  Math.max(Number(event.target.value) || 60, 60),
                                  95
                                )
                              )
                            }
                            className="w-full"
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
                      "Debate 시작하기"
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

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700">{label}</span>
        <span className="text-sm text-zinc-900">{value}</span>
      </div>
    </div>
  );
}

function ThinkingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="text-sm text-zinc-500">thinking</span>
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-zinc-400 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-zinc-400 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-zinc-400 [animation-delay:300ms]" />
      </span>
    </span>
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
