import { DebateSession, SessionSummary } from "@/lib/types";
import { safeJsonParse } from "@/lib/utils";

const SESSION_SUMMARIES_KEY = "debate-session-summaries-v1";
const SESSION_CACHE_PREFIX = "debate-session-v1:";

function hasWindow() {
  return typeof window !== "undefined";
}

function getSessionCacheKey(id: string) {
  return `${SESSION_CACHE_PREFIX}${id}`;
}

export function readCachedSessionSummaries() {
  if (!hasWindow()) {
    return [] as SessionSummary[];
  }

  return safeJsonParse<SessionSummary[]>(
    window.localStorage.getItem(SESSION_SUMMARIES_KEY) || "[]",
    []
  );
}

export function writeCachedSessionSummaries(sessions: SessionSummary[]) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(SESSION_SUMMARIES_KEY, JSON.stringify(sessions));
}

export function readCachedSession(id: string) {
  if (!hasWindow()) {
    return null;
  }

  return safeJsonParse<DebateSession | null>(
    window.localStorage.getItem(getSessionCacheKey(id)) || "null",
    null
  );
}

export function writeCachedSession(session: DebateSession) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(getSessionCacheKey(session.id), JSON.stringify(session));
}

export function deleteCachedSession(id: string) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.removeItem(getSessionCacheKey(id));
}
