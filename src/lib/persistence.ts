import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { DebateSession, SessionSummary } from "@/lib/types";
import { truncate } from "@/lib/utils";

const DATA_ROOT = process.env.VERCEL ? "/tmp" : process.cwd();
const DATA_DIR = path.join(DATA_ROOT, ".data", "sessions");

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

function getSessionPath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}

export async function saveSession(session: DebateSession) {
  await ensureDataDir();
  await writeFile(getSessionPath(session.id), JSON.stringify(session, null, 2), "utf8");
}

export async function loadSession(id: string) {
  await ensureDataDir();
  const content = await readFile(getSessionPath(id), "utf8");
  return JSON.parse(content) as DebateSession;
}

export async function listSessions() {
  await ensureDataDir();
  const entries = await readdir(DATA_DIR);

  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        const content = await readFile(path.join(DATA_DIR, entry), "utf8");
        return JSON.parse(content) as DebateSession;
      })
  );

  return sessions
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .map<SessionSummary>((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      status: session.status,
      goal: truncate(session.input.goal, 90),
      instruction: truncate(session.input.instruction, 110),
      messageCount: session.messages.length,
      agreementScore: session.finalReport?.agreementScore ?? session.snapshots.at(-1)?.agreementScore,
    }));
}
