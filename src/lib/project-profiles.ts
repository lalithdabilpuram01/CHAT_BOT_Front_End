import { backendEndpoint, DEFAULT_BACKEND_URL } from "./backend-url";
import type {
  ChatRequest,
  ConnectionConfig,
  Project,
  ProjectProfile,
} from "./types";

export const PROFILE_STORAGE_KEY = "folio-projects-v1";
export const defaultConnection: ConnectionConfig = {
  endpoint: "http://127.0.0.1:8000/chat",
  protocol: "json",
  requestMode: "question",
  questionField: "question",
  answerPath: "answer",
  sourcesPath: "sources",
  includeHistory: false,
  model: "",
};
const forbidden = new Set(["__proto__", "constructor", "prototype"]);

export const queryConnection: ConnectionConfig = {
  ...defaultConnection,
  endpoint: "/api/rag",
  backendUrl: DEFAULT_BACKEND_URL,
  queryPath: "/query",
  questionField: "q",
  conversationIdField: "thread_id",
};

export const defaultProfile: ProjectProfile = {
  version: 1,
  id: "custom-rag-backend",
  name: "My RAG assistant",
  description: "Ask questions using your connected RAG backend.",
  prompts: ["What information can you help me find?"],
  connection: queryConnection,
};

export function validateEndpoint(endpoint: string) {
  if (
    endpoint.startsWith("/") &&
    !endpoint.startsWith("//") &&
    !endpoint.includes("\\")
  ) {
    const url = new URL(endpoint, "http://folio.local");
    if (url.search || url.hash)
      throw new Error(
        "Use an endpoint without query parameters or a fragment. Keep secrets on your backend.",
      );
    return;
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(
      "Enter an http(s) API URL or a same-origin path such as /api/chat.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use an http(s) endpoint without credentials, query parameters, or fragments.",
    );
}

export function readPath(value: unknown, path: string): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((current, key) => {
    if (
      forbidden.has(key) ||
      !current ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key)
    )
      return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

export function parseProfile(value: unknown): ProjectProfile {
  if (!value || typeof value !== "object")
    throw new Error("Expected a project settings object.");
  const p = value as Record<string, unknown>;
  const c = p.connection as Record<string, unknown> | undefined;
  if (
    p.version !== 1 ||
    typeof p.id !== "string" ||
    !/^custom-[a-zA-Z0-9-]{1,80}$/.test(p.id)
  )
    throw new Error("Expected version 1 and an ID beginning with custom-.");
  if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 80)
    throw new Error("Project name must be 1–80 characters.");
  if (typeof p.description !== "string" || p.description.length > 300)
    throw new Error("Description must be at most 300 characters.");
  if (
    !Array.isArray(p.prompts) ||
    p.prompts.length > 6 ||
    !p.prompts.every(
      (s) => typeof s === "string" && s.trim().length > 0 && s.length <= 250,
    )
  )
    throw new Error("Use up to six starter questions, each 1–250 characters.");
  if (
    !c ||
    !["json", "ndjson"].includes(String(c.protocol)) ||
    !["question", "messages", "folio"].includes(String(c.requestMode))
  )
    throw new Error("Choose a supported request and response format.");
  for (const key of [
    "endpoint",
    "questionField",
    "answerPath",
    "sourcesPath",
    "model",
  ])
    if (typeof c[key] !== "string" || (c[key] as string).length > 500)
      throw new Error(`Invalid ${key} setting.`);
  if (typeof c.includeHistory !== "boolean")
    throw new Error("includeHistory must be true or false.");
  if (
    c.conversationIdField !== undefined &&
    (typeof c.conversationIdField !== "string" ||
      (c.conversationIdField !== "" &&
        (!/^[a-zA-Z_][a-zA-Z0-9_]{0,79}$/.test(c.conversationIdField) ||
          forbidden.has(c.conversationIdField) ||
          ["history", "model", "messages", "stream", c.questionField].includes(
            c.conversationIdField,
          ))))
  )
    throw new Error(
      "Use a unique conversation field, such as thread_id or session_id, or leave it blank.",
    );
  validateEndpoint(c.endpoint as string);
  if (c.backendUrl !== undefined || c.queryPath !== undefined) {
    if (typeof c.backendUrl !== "string" || typeof c.queryPath !== "string")
      throw new Error("Enter the backend server URL and question path.");
    backendEndpoint(c.backendUrl, c.queryPath);
  }
  if (
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c.questionField as string) ||
    forbidden.has(c.questionField as string) ||
    ["history", "model"].includes(c.questionField as string)
  )
    throw new Error(
      "Use a simple question field, such as question, query, or input (not history or model).",
    );
  for (const key of ["answerPath", "sourcesPath"]) {
    const path = c[key] as string;
    if (
      path &&
      (!/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/.test(path) ||
        path.split(".").some((k) => forbidden.has(k)))
    )
      throw new Error(
        "Response fields use dotted paths, such as data.answer or choices.0.message.content.",
      );
  }
  if (c.protocol === "json" && !c.answerPath)
    throw new Error("Enter the field containing your answer.");
  // Whitelist fields. Imported settings cannot smuggle headers or credentials into storage.
  return {
    version: 1,
    id: p.id,
    name: p.name.trim(),
    description: p.description,
    prompts: p.prompts as string[],
    connection: {
      endpoint: c.endpoint as string,
      ...(c.backendUrl !== undefined
        ? {
            backendUrl: (c.backendUrl as string).trim().replace(/\/+$/, ""),
            queryPath: (c.queryPath as string).trim(),
          }
        : {}),
      protocol: c.protocol as ConnectionConfig["protocol"],
      requestMode: c.requestMode as ConnectionConfig["requestMode"],
      questionField: c.questionField as string,
      ...(c.conversationIdField !== undefined
        ? { conversationIdField: c.conversationIdField as string }
        : {}),
      answerPath: c.answerPath as string,
      sourcesPath: c.sourcesPath as string,
      model: c.model as string,
      includeHistory: c.includeHistory,
    },
  };
}

export function toProject(profile: ProjectProfile): Project {
  return {
    ...profile,
    category: "YOUR RAG PROJECT",
    initials: profile.name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase(),
    sources: [],
  };
}

export function buildRequestBody(
  config: ConnectionConfig,
  request: ChatRequest,
) {
  if (config.requestMode === "folio") return request;
  const conversation = config.conversationIdField
    ? { [config.conversationIdField]: request.conversationId }
    : {};
  if (config.requestMode === "messages")
    return {
      ...conversation,
      messages: request.messages,
      stream: false,
      ...(config.model ? { model: config.model } : {}),
    };
  const question =
    request.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  return {
    ...conversation,
    [config.questionField]: question,
    ...(config.includeHistory
      ? { history: request.messages.slice(0, -1) }
      : {}),
  };
}

// Existing saved profiles keep working; the settings editor makes their destination visible.
export function editableConnection(config: ConnectionConfig): ConnectionConfig {
  if (config.backendUrl !== undefined) return config;
  if (config.endpoint === "/api/rag")
    return { ...config, backendUrl: DEFAULT_BACKEND_URL, queryPath: "/query" };
  if (/^https?:\/\//.test(config.endpoint)) {
    const url = new URL(config.endpoint);
    return { ...config, backendUrl: url.origin, queryPath: url.pathname };
  }
  return config;
}

export function projectTransport(
  config: ConnectionConfig,
  request: ChatRequest,
) {
  const payload = buildRequestBody(config, request);
  if (config.backendUrl === undefined)
    return { endpoint: config.endpoint, body: payload };
  backendEndpoint(config.backendUrl, config.queryPath ?? "/query");
  return {
    endpoint: "/api/connect",
    body: {
      backendUrl: config.backendUrl,
      queryPath: config.queryPath ?? "/query",
      payload,
    },
  };
}
