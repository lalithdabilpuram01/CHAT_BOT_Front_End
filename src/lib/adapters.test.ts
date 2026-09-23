import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttpAdapter, parseEvent } from "./http-adapter";
import { demoAdapter } from "./demo-adapter";
import type { ChatEvent, ChatRequest } from "./types";

const request: ChatRequest = {
  projectId: "product",
  conversationId: "test",
  documentIds: ["roadmap", "principles", "onboarding"],
  messages: [{ role: "user", content: "What are the product priorities?" }],
};

test("demo cancellation prevents further tokens", async () => {
  const abort = new AbortController();
  const iterator = demoAdapter
    .stream(request, abort.signal)
    [Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value.type, "status");
  const pending = iterator.next();
  abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("demo never exposes another project sources", async () => {
  const events: ChatEvent[] = [];
  for await (const event of demoAdapter.stream(
    {
      ...request,
      projectId: "research",
      messages: [{ role: "user", content: "How do we compare retrieval?" }],
    },
    new AbortController().signal,
  ))
    events.push(event);
  assert.deepEqual(
    events.find((e) => e.type === "sources"),
    { type: "sources", sources: [] },
  );
  assert.ok(
    events
      .filter((e) => e.type === "delta")
      .map((e) => e.text)
      .join("")
      .includes("does not have a supported answer"),
  );
});

test("event parser rejects invalid citations and unknown events", () => {
  assert.throws(() =>
    parseEvent('{"type":"sources","sources":[{"title":"fake"}]}'),
  );
  assert.throws(() => parseEvent('{"type":"unknown"}'));
  assert.deepEqual(parseEvent('{"type":"delta","text":"hello"}'), {
    type: "delta",
    text: "hello",
  });
});

test("HTTP adapter handles chunked UTF-8, blank lines, and a final line without newline", async (t) => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(
    '{"type":"delta","text":"café 🌿"}\n\n{"type":"done"}',
  );
  const body = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(body, {
        headers: { "content-type": "application/x-ndjson" },
      }),
  );
  const events = [];
  for await (const event of createHttpAdapter().stream(
    request,
    new AbortController().signal,
  ))
    events.push(event);
  assert.deepEqual(events, [
    { type: "delta", text: "café 🌿" },
    { type: "done" },
  ]);
});

test("HTTP adapter reports truncated answers", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response('{"type":"delta","text":"partial"}\n', {
        headers: { "content-type": "application/x-ndjson" },
      }),
  );
  await assert.rejects(async () => {
    for await (const event of createHttpAdapter().stream(
      request,
      new AbortController().signal,
    ))
      void event;
  }, /before the answer was complete/);
});

test("HTTP adapter handles an expired session without retrying", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 401 }),
  );
  await assert.rejects(async () => {
    for await (const event of createHttpAdapter().stream(
      request,
      new AbortController().signal,
    ))
      void event;
  }, /session has expired/);
  assert.equal(fetch.mock.callCount(), 1);
});
