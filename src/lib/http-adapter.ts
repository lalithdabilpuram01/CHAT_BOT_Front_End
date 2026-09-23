import type { ChatEvent, ChatRequest, RagAdapter, Source } from "./types";

function isSource(value: unknown): value is Source {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return (
    ["id", "title", "kind", "excerpt", "updated"].every(
      (key) => typeof source[key] === "string",
    ) &&
    (source.page === undefined ||
      (Number.isInteger(source.page) && (source.page as number) > 0))
  );
}

export function parseEvent(line: string): ChatEvent {
  const data: unknown = JSON.parse(line);
  if (!data || typeof data !== "object")
    throw new Error("Invalid response event.");
  const event = data as Record<string, unknown>;
  if (
    (event.type === "status" || event.type === "delta") &&
    typeof event.text === "string"
  )
    return { type: event.type, text: event.text };
  if (
    event.type === "sources" &&
    Array.isArray(event.sources) &&
    event.sources.every(isSource)
  )
    return { type: "sources", sources: event.sources };
  if (event.type === "done") return { type: "done" };
  if (event.type === "error")
    throw new Error(
      "The backend could not complete this response. Please try again.",
    );
  throw new Error("The backend returned an unsupported response event.");
}

// FastAPI should return application/x-ndjson, one JSON event per line.
// The caller supplies a same-origin endpoint whose server authenticates the user.
// No provider keys or trusted tenant IDs belong in this browser adapter.
export function createHttpAdapter(
  endpoint = "/api/chat",
  mapRequest: (request: ChatRequest) => unknown = (request) => request,
): RagAdapter {
  return {
    async *stream(request, signal) {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify(mapRequest(request)),
      });
      if (!response.ok) {
        if (response.status === 401)
          throw new Error(
            "Your session has expired. Sign in again to continue.",
          );
        if (response.status === 403)
          throw new Error("You no longer have access to this knowledge space.");
        if (response.status === 429)
          throw new Error("Too many requests. Wait a moment and try again.");
        throw new Error(
          `The knowledge service is unavailable (${response.status}).`,
        );
      }
      if (
        !response.headers.get("content-type")?.includes("application/x-ndjson")
      )
        throw new Error(
          "Expected a streaming NDJSON response from the backend.",
        );
      if (!response.body)
        throw new Error("The server returned an empty response.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      try {
        while (!completed) {
          signal.throwIfAborted();
          const { value, done } = await reader.read();
          buffer += done
            ? decoder.decode()
            : decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          if (done && buffer.trim()) {
            lines.push(buffer);
            buffer = "";
          }
          // Limit an individual unfinished event, not the full answer.
          if (buffer.length > 1_000_000)
            throw new Error("A response event exceeded the size limit.");
          for (const line of lines) {
            if (!line.trim()) continue;
            if (line.length > 1_000_000)
              throw new Error("A response event exceeded the size limit.");
            const event = parseEvent(line);
            if (event.type === "done") completed = true;
            yield event;
            if (completed) break;
          }
          if (done) break;
        }
        if (!completed)
          throw new Error(
            "The connection ended before the answer was complete.",
          );
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    },
  };
}
