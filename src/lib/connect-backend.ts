import { backendEndpoint } from "./backend-url";
import { BackendAddressError, postPublicBackend } from "./public-backend";

export async function connectBackend(
  request: Request,
  send = postPublicBackend,
) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.host !==
          (request.headers.get("host") || new URL(request.url).host)
      )
        throw new Error();
    } catch {
      return Response.json({ error: "Origin not allowed." }, { status: 403 });
    }
  }
  let endpoint: URL;
  let payload: unknown;
  try {
    // Bound incoming history/settings before parsing them.
    if (!request.body) throw new Error("Send a JSON request.");
    const reader = request.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1_000_000) {
          await reader.cancel();
          throw new Error(
            "This conversation is too large. Start a new conversation.",
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      typeof data?.backendUrl !== "string" ||
      typeof data?.queryPath !== "string"
    )
      throw new Error(
        "Enter your backend server URL and question path in Settings.",
      );
    endpoint = new URL(backendEndpoint(data.backendUrl, data.queryPath));
    payload = data.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error("Send a JSON question object.");
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? "Send valid JSON."
            : (error as Error).message,
      },
      { status: 400 },
    );
  }
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(120_000),
  ]);
  try {
    return await send(
      endpoint,
      JSON.stringify(payload),
      request.headers.get("accept")?.includes("application/x-ndjson")
        ? "application/x-ndjson"
        : "application/json",
      signal,
    );
  } catch (error) {
    if (error instanceof BackendAddressError)
      return Response.json({ error: error.message }, { status: 400 });
    const timeout = signal.aborted && !request.signal.aborted;
    return Response.json(
      {
        error: timeout
          ? "The backend took longer than two minutes. Try again."
          : "Cannot reach this backend. Check the server URL and that the server is running.",
      },
      { status: timeout ? 504 : 502 },
    );
  }
}
