export type SessionStatus =
  | { type: "idle" }
  | { type: "retry"; attempt: number; message: string; next: number }
  | { type: "busy" };

export interface Session {
  id: string;
  slug: string;
  projectID: string;
  workspaceID?: string;
  directory: string;
  parentID?: string;
  title: string;
  version: string;
  time: {
    created: number;
    updated: number;
    compacting?: number;
    archived?: number;
  };
  summary?: {
    additions: number;
    deletions: number;
    files: number;
    diffs?: FileDiff[];
  };
  share?: { url: string };
}

export interface Message {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time: {
    created: number;
    completed?: number;
  };
  agent?: string;
  model?: {
    providerID: string;
    modelID: string;
  };
  error?: unknown;
  parentID?: string;
  cost?: number;
  tokens?: {
    total?: number;
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
}

export interface TextPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: { start: number; end?: number };
}

export interface ReasoningPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "reasoning";
  text: string;
  time: { start: number; end?: number };
}

export interface ToolPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool";
  callID: string;
  tool: string;
  state: ToolState;
}

export type ToolState =
  | { status: "pending"; input: Record<string, unknown>; raw: string }
  | { status: "running"; input: Record<string, unknown>; title?: string; time: { start: number } }
  | { status: "completed"; input: Record<string, unknown>; output: string; title: string; time: { start: number; end: number } }
  | { status: "error"; input: Record<string, unknown>; error: string; time: { start: number; end: number } };

export interface FilePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "file";
  mime: string;
  filename?: string;
  url: string;
}

export interface StepStartPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-start";
  snapshot?: string;
}

export interface StepFinishPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-finish";
  reason: string;
  cost: number;
  tokens: {
    total?: number;
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
}

export interface SubtaskPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "subtask";
  prompt: string;
  description: string;
  agent: string;
}

export type Part =
  | TextPart
  | ReasoningPart
  | ToolPart
  | FilePart
  | StepStartPart
  | StepFinishPart
  | SubtaskPart;

export interface FileDiff {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
  status?: "added" | "deleted" | "modified";
}

export interface PermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: { messageID: string; callID: string };
}

export interface QuestionRequest {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: { messageID: string; callID: string };
}

export interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionOption {
  label: string;
  description: string;
}

export type Event =
  | { type: "session.created"; properties: { sessionID: string; info: Session } }
  | { type: "session.updated"; properties: { sessionID: string; info: Session } }
  | { type: "session.deleted"; properties: { sessionID: string; info: Session } }
  | { type: "session.status"; properties: { sessionID: string; status: SessionStatus } }
  | { type: "session.idle"; properties: { sessionID: string } }
  | { type: "session.error"; properties: { sessionID?: string; error?: unknown } }
  | { type: "session.diff"; properties: { sessionID: string; diff: FileDiff[] } }
  | { type: "message.updated"; properties: { sessionID: string; info: Message } }
  | { type: "message.removed"; properties: { sessionID: string; messageID: string } }
  | { type: "message.part.updated"; properties: { sessionID: string; part: Part; time: number } }
  | { type: "message.part.removed"; properties: { sessionID: string; messageID: string; partID: string } }
  | { type: "message.part.delta"; properties: { sessionID: string; messageID: string; partID: string; field: string; delta: string } }
  | { type: "permission.asked"; properties: PermissionRequest }
  | { type: "permission.replied"; properties: { sessionID: string; requestID: string; reply: "once" | "always" | "reject" } }
  | { type: "question.asked"; properties: QuestionRequest }
  | { type: "question.replied"; properties: { sessionID: string; requestID: string; answers: string[][] } }
  | { type: "todo.updated"; properties: { sessionID: string; todos: Todo[] } }
  | { type: "file.edited"; properties: { file: string } }
  | { type: "command.executed"; properties: { name: string; sessionID: string; arguments: string; messageID: string } }
  | { type: "project.updated"; properties: unknown }
  | { type: "server.connected"; properties: Record<string, unknown> }
  | { type: "installation.updated"; properties: { version: string } }
  | { type: "workspace.ready"; properties: { name: string } }
  | { type: "workspace.failed"; properties: { message: string } };

export interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}

export interface ConnectionConfig {
  bridgeUrl: string;
  apiKey: string;
}

export interface Project {
  id: string;
  worktree: string;
  time?: { created: number; updated: number };
}

export interface Agent {
  name: string;
  description?: string;
  builtIn?: boolean;
  public?: boolean;
}

export interface ModelInfo {
  id: string;
  providerID: string;
  name: string;
  status?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  models: Record<string, ModelInfo>;
}

export interface ConfigProviders {
  providers: ProviderInfo[];
  default: Record<string, string>;
}