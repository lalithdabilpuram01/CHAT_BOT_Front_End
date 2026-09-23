import { createHttpAdapter } from "./http-adapter";
import { buildRequestBody, readPath } from "./project-profiles";
import type { ConnectionConfig, RagAdapter, Source } from "./types";

export function responseSources(value: unknown): Source[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new Error(
      "The sources field must be an array. Check the source field path in project settings.",
    );
  return value.map((item, index) => {
    if (!item || typeof item !== "object")
      throw new Error(
        "Each source must be an object with a title and excerpt.",
      );
    const s = item as Record<string, unknown>;
    const metadata =
      s.metadata && typeof s.metadata === "object"
        ? (s.metadata as Record<string, unknown>)
        : {};
    const title = s.title ?? s.source ?? metadata.source;
    const excerpt = s.excerpt ?? s.content ?? s.page_content;
    const page = s.page ?? metadata.page;
    if (typeof title !== "string" || typeof excerpt !== "string")
      throw new Error(
        "Sources need title/source and excerpt/content/page_content strings. See the integration guide.",
      );
    return {
      id: typeof s.id === "string" ? s.id : `source-${index}`,
      title,
      excerpt,
      kind: typeof s.kind === "string" ? s.kind : "Source",
      updated: typeof s.updated === "string" ? s.updated : "",
      ...(Number.isInteger(page) && (page as number) > 0
        ? { page: page as number }
        : {}),
    };
  });
}

export function createProjectAdapter(config: ConnectionConfig): RagAdapter {
  if (config.protocol === "ndjson")
    return createHttpAdapter(config.endpoint, (request) =>
      buildRequestBody(config, request),
    );
  return {
    async *stream(request, signal) {
      const combined = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
      yield { type: "status", text: "Waiting for your RAG service…" };
      let response: Response;
      try {
        response = await fetch(config.endpoint, {
          method: "POST",
          signal: combined,
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(buildRequestBody(config, request)),
        });
      } catch (error) {
        if (combined.aborted) throw error;
        throw new Error(
          "Cannot reach the API. Check that it is running, the URL is correct, and CORS allows this frontend origin.",
        );
      }
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403
            ? "The API denied access. Configure authentication at your backend or same-origin gateway."
            : `Your API returned HTTP ${response.status}. Check the request format in project settings.`,
        );
      const data: unknown = await response.json();
      const answer = readPath(data, config.answerPath);
      if (typeof answer !== "string" || !answer.trim())
        throw new Error(
          `No answer text found at "${config.answerPath}". Update the answer field in project settings.`,
        );
      const sources = responseSources(readPath(data, config.sourcesPath));
      signal.throwIfAborted();
      yield { type: "sources", sources };
      yield { type: "delta", text: answer };
      yield { type: "done" };
    },
  };
}
