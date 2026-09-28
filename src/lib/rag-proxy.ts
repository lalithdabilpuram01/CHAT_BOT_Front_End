export const DEFAULT_BACKEND_URL =
  "https://rag-api-851836889082.us-central1.run.app";

type BackendSettings = {
  baseUrl?: string;
  queryPath?: string;
  apiKey?: string;
};

// The destination comes only from server configuration, never from a request.
export async function proxyRagRequest(
  request: Request,
  settings: BackendSettings,
) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      // Next.js can reconstruct request.url with an internal hostname. The
      // browser-facing Host also works behind a TLS-terminating reverse proxy.
      const expectedHost =
        request.headers.get("host") || new URL(request.url).host;
      const originUrl = new URL(origin);
      if (
        !["http:", "https:"].includes(originUrl.protocol) ||
        originUrl.host !== expectedHost
      )
        throw new Error("Origin mismatch");
    } catch {
      return Response.json({ error: "Origin not allowed." }, { status: 403 });
    }
  }

  let endpoint: URL;
  try {
    const base = new URL(settings.baseUrl || DEFAULT_BACKEND_URL);
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      throw new Error("Invalid backend URL");
    const path = settings.queryPath || "/query";
    if (!path.startsWith("/") || path.startsWith("//") || /[\\?#]/.test(path))
      throw new Error("Invalid query path");
    endpoint = new URL(base.toString().replace(/\/$/, "") + path);
  } catch {
    return Response.json(
      { error: "Invalid BACKEND_URL or BACKEND_QUERY_PATH configuration." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Expected an object");
  } catch {
    return Response.json(
      { error: "Send a JSON request object." },
      { status: 400 },
    );
  }

  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(120_000),
  ]);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: request.headers.get("accept")?.includes("application/x-ndjson")
          ? "application/x-ndjson"
          : "application/json",
        ...(settings.apiKey
          ? { Authorization: `Bearer ${settings.apiKey}` }
          : {}),
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      return Response.json(
        { error: `The RAG backend returned HTTP ${response.status}.` },
        { status: response.status },
      );
    }
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    const timedOut = signal.aborted && !request.signal.aborted;
    return Response.json(
      {
        error: timedOut
          ? "The RAG backend timed out after two minutes."
          : "Cannot reach the RAG backend. Check the server connection and BACKEND_URL.",
      },
      { status: timedOut ? 504 : 502 },
    );
  }
}
