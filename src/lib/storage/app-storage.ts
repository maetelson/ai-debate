import {
  deleteSession as deleteLocalSession,
  loadSession as loadLocalSession,
  listSessions as listLocalSessions,
  saveSession as saveLocalSession,
  updateSessionTitle as updateLocalSessionTitle,
} from "@/lib/persistence";
import { ConsensusSnapshot, DebateMessage, DebateSession, SessionSummary } from "@/lib/types";

import {
  deleteBridgeSession,
  fetchBridgeSession,
  fetchBridgeSessions,
  mergeSessionSummaries,
  sendBridgeEvent,
  updateBridgeSessionTitle,
} from "@/lib/storage/bridge-client";

export async function saveSessionStarted(session: DebateSession) {
  await saveLocalSession(session);
  void sendBridgeEvent("/events/session-started", { session });
}

export async function saveSessionMessage(session: DebateSession, message: DebateMessage) {
  await saveLocalSession(session);
  void sendBridgeEvent("/events/message", {
    sessionId: session.id,
    session,
    message,
  });
}

export async function saveSessionSnapshot(
  session: DebateSession,
  snapshot: ConsensusSnapshot
) {
  await saveLocalSession(session);
  void sendBridgeEvent("/events/snapshot", {
    sessionId: session.id,
    session,
    snapshot,
  });
}

export async function saveSessionCompleted(session: DebateSession) {
  await saveLocalSession(session);
  void sendBridgeEvent("/events/session-completed", { session });
}

export async function saveSessionFailed(session: DebateSession, error: string) {
  await saveLocalSession(session);
  void sendBridgeEvent("/events/session-failed", {
    sessionId: session.id,
    session,
    error,
  });
}

export async function loadStoredSession(id: string) {
  try {
    return await loadLocalSession(id);
  } catch {
    const remote = await fetchBridgeSession(id);
    if (remote) {
      return remote;
    }
    throw new Error("Session not found.");
  }
}

export async function listStoredSessions() {
  const [localSessions, remoteSessions] = await Promise.all([
    listLocalSessions().catch(() => []),
    fetchBridgeSessions(),
  ]);

  return mergeSessionSummaries(localSessions, remoteSessions);
}

function toSessionSummary(session: DebateSession): SessionSummary {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    title: session.input.title,
    goal: session.input.goal,
    instruction: session.input.instruction,
    messageCount: session.messages.length,
    agreementScore:
      session.finalReport?.agreementScore ?? session.snapshots.at(-1)?.agreementScore,
  };
}

export async function renameStoredSession(id: string, title: string) {
  const nextTitle = title.trim();
  if (!nextTitle) {
    throw new Error("Title is required.");
  }

  let session: DebateSession | null = null;

  try {
    session = await updateLocalSessionTitle(id, nextTitle);
  } catch {
    session = null;
  }

  const remoteSession = await updateBridgeSessionTitle(id, nextTitle);
  if (remoteSession) {
    session = remoteSession;
  }

  if (!session) {
    throw new Error("Session not found.");
  }

  return {
    session,
    summary: toSessionSummary(session),
  };
}

export async function deleteStoredSession(id: string) {
  await Promise.allSettled([deleteLocalSession(id), deleteBridgeSession(id)]);
}
