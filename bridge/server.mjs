import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const PORT = Number(process.env.BRIDGE_PORT || 8787);
const TOKEN = process.env.LOCAL_BRIDGE_TOKEN || "";
const DATA_DIR = process.env.BRIDGE_DATA_DIR || path.join(process.cwd(), ".bridge-data");
const DB_PATH = path.join(DATA_DIR, "debate-bridge.sqlite");

if (!TOKEN) {
  throw new Error("LOCAL_BRIDGE_TOKEN is required to run the local bridge.");
}

mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    goal TEXT NOT NULL,
    instruction TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    model TEXT NOT NULL,
    consensus_threshold INTEGER NOT NULL,
    max_rounds INTEGER NOT NULL,
    error TEXT,
    session_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    role TEXT NOT NULL,
    round INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    session_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    agreement_score INTEGER NOT NULL,
    goal_alignment_score INTEGER NOT NULL,
    evidence_strength_score INTEGER NOT NULL,
    current_position TEXT NOT NULL,
    rationale TEXT NOT NULL,
    should_continue INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    PRIMARY KEY (session_id, round)
  );

  CREATE TABLE IF NOT EXISTS final_reports (
    session_id TEXT PRIMARY KEY,
    final_answer TEXT NOT NULL,
    agreement_score INTEGER NOT NULL,
    goal_alignment_score INTEGER NOT NULL,
    round_count INTEGER NOT NULL,
    finish_reason TEXT NOT NULL,
    report_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    summary TEXT NOT NULL
  );
`);

const upsertSessionStmt = db.prepare(`
  INSERT INTO sessions (
    id, title, goal, instruction, status, created_at, updated_at, model,
    consensus_threshold, max_rounds, error, session_json
  ) VALUES (
    @id, @title, @goal, @instruction, @status, @created_at, @updated_at, @model,
    @consensus_threshold, @max_rounds, @error, @session_json
  )
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    goal = excluded.goal,
    instruction = excluded.instruction,
    status = excluded.status,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    model = excluded.model,
    consensus_threshold = excluded.consensus_threshold,
    max_rounds = excluded.max_rounds,
    error = excluded.error,
    session_json = excluded.session_json
`);

const insertMessageStmt = db.prepare(`
  INSERT OR IGNORE INTO messages (
    id, session_id, agent_id, agent_name, role, round, content, created_at
  ) VALUES (
    @id, @session_id, @agent_id, @agent_name, @role, @round, @content, @created_at
  )
`);

const upsertSnapshotStmt = db.prepare(`
  INSERT INTO snapshots (
    session_id, round, agreement_score, goal_alignment_score, evidence_strength_score,
    current_position, rationale, should_continue, snapshot_json
  ) VALUES (
    @session_id, @round, @agreement_score, @goal_alignment_score, @evidence_strength_score,
    @current_position, @rationale, @should_continue, @snapshot_json
  )
  ON CONFLICT(session_id, round) DO UPDATE SET
    agreement_score = excluded.agreement_score,
    goal_alignment_score = excluded.goal_alignment_score,
    evidence_strength_score = excluded.evidence_strength_score,
    current_position = excluded.current_position,
    rationale = excluded.rationale,
    should_continue = excluded.should_continue,
    snapshot_json = excluded.snapshot_json
`);

const upsertFinalReportStmt = db.prepare(`
  INSERT INTO final_reports (
    session_id, final_answer, agreement_score, goal_alignment_score, round_count,
    finish_reason, report_json
  ) VALUES (
    @session_id, @final_answer, @agreement_score, @goal_alignment_score, @round_count,
    @finish_reason, @report_json
  )
  ON CONFLICT(session_id) DO UPDATE SET
    final_answer = excluded.final_answer,
    agreement_score = excluded.agreement_score,
    goal_alignment_score = excluded.goal_alignment_score,
    round_count = excluded.round_count,
    finish_reason = excluded.finish_reason,
    report_json = excluded.report_json
`);

const deleteDocumentsStmt = db.prepare(`DELETE FROM documents WHERE session_id = ?`);
const insertDocumentStmt = db.prepare(`
  INSERT OR REPLACE INTO documents (id, session_id, name, mime_type, summary)
  VALUES (@id, @session_id, @name, @mime_type, @summary)
`);

const listSessionsStmt = db.prepare(`
  SELECT
    s.id,
    s.created_at AS createdAt,
    s.updated_at AS updatedAt,
    s.status,
    s.title,
    s.goal,
    s.instruction,
    (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS messageCount,
    COALESCE(
      (SELECT agreement_score FROM final_reports fr WHERE fr.session_id = s.id),
      (SELECT agreement_score FROM snapshots sp WHERE sp.session_id = s.id ORDER BY sp.round DESC LIMIT 1)
    ) AS agreementScore
  FROM sessions s
  ORDER BY s.updated_at DESC
`);

const getSessionStmt = db.prepare(`SELECT session_json FROM sessions WHERE id = ? LIMIT 1`);

function verifyToken(request) {
  const authHeader = request.headers.authorization;
  const bridgeHeader = request.headers["x-bridge-token"];
  const queryToken = new URL(request.url || "/", `http://${request.headers.host}`).searchParams.get(
    "token"
  );

  return (
    authHeader === `Bearer ${TOKEN}` || bridgeHeader === TOKEN || queryToken === TOKEN
  );
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function persistSessionGraph(session) {
  upsertSessionStmt.run({
    id: session.id,
    title: session.input.title,
    goal: session.input.goal,
    instruction: session.input.instruction,
    status: session.status,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    model: session.input.model,
    consensus_threshold: session.input.consensusThreshold,
    max_rounds: session.input.maxRounds,
    error: session.error || null,
    session_json: JSON.stringify(session),
  });

  deleteDocumentsStmt.run(session.id);
  for (const document of session.documents || []) {
    insertDocumentStmt.run({
      id: document.id,
      session_id: session.id,
      name: document.name,
      mime_type: document.mimeType,
      summary: document.summary,
    });
  }

  for (const message of session.messages || []) {
    insertMessageStmt.run({
      id: message.id,
      session_id: session.id,
      agent_id: message.agentId,
      agent_name: message.agentName,
      role: message.role,
      round: message.round,
      content: message.content,
      created_at: message.createdAt,
    });
  }

  for (const snapshot of session.snapshots || []) {
    upsertSnapshotStmt.run({
      session_id: session.id,
      round: snapshot.round,
      agreement_score: snapshot.agreementScore,
      goal_alignment_score: snapshot.goalAlignmentScore,
      evidence_strength_score: snapshot.evidenceStrengthScore,
      current_position: snapshot.currentPosition,
      rationale: snapshot.rationale,
      should_continue: snapshot.shouldContinue ? 1 : 0,
      snapshot_json: JSON.stringify(snapshot),
    });
  }

  if (session.finalReport) {
    upsertFinalReportStmt.run({
      session_id: session.id,
      final_answer: session.finalReport.finalAnswer,
      agreement_score: session.finalReport.agreementScore,
      goal_alignment_score: session.finalReport.goalAlignmentScore,
      round_count: session.finalReport.roundCount,
      finish_reason: session.finalReport.finishReason,
      report_json: JSON.stringify(session.finalReport),
    });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, dbPath: DB_PATH }));
    return;
  }

  if (!verifyToken(request)) {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  try {
    if (request.method === "GET" && url.pathname === "/sessions") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ sessions: listSessionsStmt.all() }));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/sessions/")) {
      const id = decodeURIComponent(url.pathname.replace("/sessions/", ""));
      const row = getSessionStmt.get(id);
      if (!row) {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Session not found" }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ session: JSON.parse(row.session_json) }));
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/events/")) {
      const payload = await readBody(request);

      if (payload.session) {
        persistSessionGraph(payload.session);
      }

      if (url.pathname === "/events/message" && payload.message) {
        insertMessageStmt.run({
          id: payload.message.id,
          session_id: payload.sessionId,
          agent_id: payload.message.agentId,
          agent_name: payload.message.agentName,
          role: payload.message.role,
          round: payload.message.round,
          content: payload.message.content,
          created_at: payload.message.createdAt,
        });
      }

      if (url.pathname === "/events/snapshot" && payload.snapshot) {
        upsertSnapshotStmt.run({
          session_id: payload.sessionId,
          round: payload.snapshot.round,
          agreement_score: payload.snapshot.agreementScore,
          goal_alignment_score: payload.snapshot.goalAlignmentScore,
          evidence_strength_score: payload.snapshot.evidenceStrengthScore,
          current_position: payload.snapshot.currentPosition,
          rationale: payload.snapshot.rationale,
          should_continue: payload.snapshot.shouldContinue ? 1 : 0,
          snapshot_json: JSON.stringify(payload.snapshot),
        });
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown bridge error",
      })
    );
  }
});

server.listen(PORT, () => {
  console.log(`Local debate bridge listening on http://localhost:${PORT}`);
  console.log(`SQLite DB: ${DB_PATH}`);
});
