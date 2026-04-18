import { DebateMessage, DebateSession, ConsensusSnapshot, SessionSummary } from "@/lib/types";

type BridgeEventPayload =
  | { session: DebateSession }
  | { sessionId: string; session: DebateSession; message: DebateMessage }
  | { sessionId: string; session: DebateSession; snapshot: ConsensusSnapshot }
  | { sessionId: string; session: DebateSession; error: string };

function getBridgeBaseUrl() {
  return process.env.LOCAL_BRIDGE_URL?.trim() || "";
}

function getBridgeToken() {
  return process.env.LOCAL_BRIDGE_TOKEN?.trim() || "";
}

function hasBridgeConfig() {
  return Boolean(getBridgeBaseUrl() && getBridgeToken());
}

function buildBridgeUrl(pathname: string) {
  return new URL(pathname, getBridgeBaseUrl()).toString();
}

function buildBridgeHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getBridgeToken()}`,
    "x-bridge-token": getBridgeToken(),
  };
}

export function mergeSessionSummaries(
  localSessions: SessionSummary[],
  remoteSessions: SessionSummary[]
) {
  const merged = new Map<string, SessionSummary>();

  for (const session of [...remoteSessions, ...localSessions]) {
    const existing = merged.get(session.id);
    if (!existing || +new Date(session.updatedAt) >= +new Date(existing.updatedAt)) {
      merged.set(session.id, session);
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
  );
}

export async function sendBridgeEvent(pathname: string, payload: BridgeEventPayload) {
  if (!hasBridgeConfig()) {
    return false;
  }

  try {
    const response = await fetch(buildBridgeUrl(pathname), {
      method: "POST",
      headers: buildBridgeHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error("Bridge event failed:", pathname, response.status, await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Bridge event error:", pathname, error);
    return false;
  }
}

export async function fetchBridgeSessions() {
  if (!hasBridgeConfig()) {
    return [] as SessionSummary[];
  }

  try {
    const response = await fetch(buildBridgeUrl("/sessions"), {
      headers: buildBridgeHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error("Bridge list sessions failed:", response.status, await response.text());
      return [] as SessionSummary[];
    }

    const data = (await response.json()) as { sessions?: SessionSummary[] };
    return data.sessions ?? [];
  } catch (error) {
    console.error("Bridge list sessions error:", error);
    return [] as SessionSummary[];
  }
}

export async function fetchBridgeSession(id: string) {
  if (!hasBridgeConfig()) {
    return null;
  }

  try {
    const response = await fetch(buildBridgeUrl(`/sessions/${id}`), {
      headers: buildBridgeHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { session?: DebateSession };
    return data.session ?? null;
  } catch (error) {
    console.error("Bridge load session error:", error);
    return null;
  }
}

export async function updateBridgeSessionTitle(id: string, title: string) {
  if (!hasBridgeConfig()) {
    return null;
  }

  try {
    const response = await fetch(buildBridgeUrl(`/sessions/${id}`), {
      method: "PATCH",
      headers: buildBridgeHeaders(),
      body: JSON.stringify({ title }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error("Bridge update session failed:", response.status, await response.text());
      return null;
    }

    const data = (await response.json()) as { session?: DebateSession };
    return data.session ?? null;
  } catch (error) {
    console.error("Bridge update session error:", error);
    return null;
  }
}

export async function deleteBridgeSession(id: string) {
  if (!hasBridgeConfig()) {
    return false;
  }

  try {
    const response = await fetch(buildBridgeUrl(`/sessions/${id}`), {
      method: "DELETE",
      headers: buildBridgeHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error("Bridge delete session failed:", response.status, await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Bridge delete session error:", error);
    return false;
  }
}
