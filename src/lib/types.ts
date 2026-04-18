export type AgentConfig = {
  id: string;
  name: string;
  role: string;
  persona: string;
  tone?: string;
  debateStyle?: string;
  objective?: string;
};

export type DebateInput = {
  title: string;
  instruction: string;
  goal: string;
  consensusThreshold: number;
  maxRounds: number;
  model: string;
  apiKey?: string;
  agents: AgentConfig[];
};

export type DocumentChunk = {
  id: string;
  documentId: string;
  index: number;
  text: string;
};

export type ParsedDocument = {
  id: string;
  name: string;
  mimeType: string;
  content: string;
  summary: string;
  chunks: DocumentChunk[];
};

export type DebateMessage = {
  id: string;
  agentId: string;
  agentName: string;
  role: string;
  round: number;
  content: string;
  references: string[];
  personaSummary: string;
  createdAt: string;
};

export type StreamingMessage = {
  id: string;
  agentId: string;
  agentName: string;
  role: string;
  round: number;
  content: string;
  createdAt: string;
  status: "thinking" | "streaming";
};

export type ConsensusSnapshot = {
  round: number;
  agreementScore: number;
  goalAlignmentScore: number;
  evidenceStrengthScore: number;
  currentPosition: string;
  openDisputes: string[];
  rationale: string;
  shouldContinue: boolean;
};

export type FinalReport = {
  finalAnswer: string;
  agreementScore: number;
  goalAlignmentScore: number;
  keyEvidence: string[];
  remainingDisputes: string[];
  roundCount: number;
  finishReason: "consensus_reached" | "max_rounds_reached" | "error";
};

export type DebateSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "idle" | "running" | "completed" | "failed";
  input: Omit<DebateInput, "apiKey">;
  documents: ParsedDocument[];
  messages: DebateMessage[];
  snapshots: ConsensusSnapshot[];
  finalReport?: FinalReport;
  error?: string;
};

export type DebateStreamEvent =
  | { type: "session.created"; session: DebateSession }
  | { type: "document.parsed"; documents: ParsedDocument[] }
  | { type: "brief.generated"; brief: DebateBrief }
  | { type: "round.started"; round: number; phase: "explore" | "converge" }
  | { type: "message.started"; message: StreamingMessage }
  | { type: "message.delta"; messageId: string; delta: string }
  | { type: "message.completed"; message: DebateMessage }
  | { type: "message.added"; message: DebateMessage }
  | { type: "consensus.updated"; snapshot: ConsensusSnapshot }
  | { type: "debate.completed"; session: DebateSession }
  | { type: "debate.failed"; message: string };

export type DebateBrief = {
  goal: string;
  instruction: string;
  successCriteria: string[];
  documentConstraints: string[];
  agentRoster: Array<{
    id: string;
    name: string;
    role: string;
    objective: string;
    persona: string;
    tone: string;
    debateStyle: string;
  }>;
};

export type SessionSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: DebateSession["status"];
  title: string;
  goal: string;
  instruction: string;
  messageCount: number;
  agreementScore?: number;
};
