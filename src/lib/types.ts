export type Source = {
  id: string;
  title: string;
  kind: string;
  page?: number;
  excerpt: string;
  updated: string;
};
export type Project = {
  id: string;
  name: string;
  category: string;
  initials: string;
  description: string;
  prompts: string[];
  sources: Source[];
  answer?: string;
  keywords?: string[];
  connection?: ConnectionConfig;
};
export type ConnectionConfig = {
  endpoint: string;
  backendUrl?: string;
  queryPath?: string;
  protocol: "json" | "ndjson";
  requestMode: "question" | "messages" | "folio";
  questionField: string;
  conversationIdField?: string;
  answerPath: string;
  sourcesPath: string;
  includeHistory: boolean;
  model: string;
};
export type ProjectProfile = {
  version: 1;
  id: string;
  name: string;
  description: string;
  prompts: string[];
  connection: ConnectionConfig;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  state?: "streaming" | "complete" | "stopped" | "error";
};
export type Conversation = {
  id: string;
  projectId: string;
  title: string;
  messages: Message[];
};
export type ChatRequest = {
  projectId: string;
  conversationId: string;
  messages: Pick<Message, "role" | "content">[];
  documentIds: string[];
};
export type ChatEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "sources"; sources: Source[] }
  | { type: "done" };
export interface RagAdapter {
  stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>;
}
