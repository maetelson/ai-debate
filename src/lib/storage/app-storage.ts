import { saveSession as saveLocalSession, loadSession as loadLocalSession, listSessions as listLocalSessions } from "@/lib/persistence";
import { ConsensusSnapshot, DebateMessage, DebateSession } from "@/lib/types";

import {
  fetchBridgeSession,
  fetchBridgeSessions,
  mergeSessionSummaries,
  sendBridgeEvent,
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
