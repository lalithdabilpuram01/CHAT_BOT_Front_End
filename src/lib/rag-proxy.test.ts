import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BACKEND_URL, proxyRagRequest } from "./rag-proxy";

const payload = { q: "What is RAG?", thread_id: "conversation-1" };
const request = (body = payload, headers = {}) =>
  new Request("http://localhost:3000/api/rag", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

test("gateway forwards the query to the fixed default backend", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    assert.equal(url.toString(), `${DEFAULT_BACKEND_URL}/query`);
    assert.deepEqual(JSON.parse(options.body as string), payload);
    assert.equal(options.redirect, "error");
    return Response.json({ answer: "Retrieved answer", sources: [] });
  });
  const response = await proxyRagRequest(request(), {});
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    answer: "Retrieved answer",
    sources: [],
  });
});

test("gateway supports another configured backend, streaming, and server-only bearer auth", async (t) => {
  const events = '{"type":"delta","text":"Answer"}\n{"type":"done"}\n';
  t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    assert.equal(url.toString(), "http://localhost:8000/v1/chat");
    assert.equal(
      new Headers(options.headers).get("authorization"),
      "Bearer server-secret",
    );
    assert.equal(
      new Headers(options.headers).get("accept"),
      "application/x-ndjson",
    );
    return new Response(events, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  });
  const response = await proxyRagRequest(
    request(payload, { Accept: "application/x-ndjson" }),
    {
      baseUrl: "http://localhost:8000/v1/",
      queryPath: "/chat",
      apiKey: "server-secret",
    },
  );
  assert.equal(await response.text(), events);
  assert.equal(response.headers.has("authorization"), false);
});

test("gateway rejects invalid bodies, origins, and configuration before contacting backend", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Must not fetch");
  });
  assert.equal(
    (
      await proxyRagRequest(
        request(payload, { Origin: "https://other.example" }),
        {},
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await proxyRagRequest(
        new Request("http://localhost/api/rag", {
          method: "POST",
          body: "invalid",
        }),
        {},
      )
    ).status,
    400,
  );
  for (const settings of [
    { baseUrl: "file:///tmp/data" },
    { baseUrl: "https://user:password@example.com" },
    { queryPath: "//other.example" },
    { queryPath: "/query?secret=1" },
  ]) {
    assert.equal((await proxyRagRequest(request(), settings)).status, 500);
  }
  assert.equal(mock.mock.callCount(), 0);
});

test("gateway preserves upstream error status without exposing upstream secrets", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("private error details", { status: 422 }),
  );
  const response = await proxyRagRequest(request(), {});
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: "The RAG backend returned HTTP 422.",
  });
});

test("gateway reports network errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  assert.equal((await proxyRagRequest(request(), {})).status, 502);
});

test("gateway accepts the browser host when Next.js uses an internal hostname", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ answer: "OK" }),
  );
  const response = await proxyRagRequest(
    request(payload, {
      Origin: "http://127.0.0.1:3000",
      Host: "127.0.0.1:3000",
    }),
    {},
  );
  assert.equal(response.status, 200);
});
