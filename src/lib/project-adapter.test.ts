import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRequestBody,
  defaultConnection,
  defaultProfile,
  queryConnection,
  parseProfile,
  readPath,
} from "./project-profiles";
import { createProjectAdapter, responseSources } from "./project-adapter";
import type { ChatRequest } from "./types";

const profile = {
  version: 1,
  id: "custom-example",
  name: "My RAG",
  description: "",
  prompts: [],
  connection: defaultConnection,
};
const request: ChatRequest = {
  projectId: profile.id,
  conversationId: "test",
  documentIds: [],
  messages: [
    { role: "user", content: "First question" },
    { role: "assistant", content: "First answer" },
    { role: "user", content: "Next question" },
  ],
};

test("saved profiles round-trip and strip unknown fields", () => {
  assert.deepEqual(parseProfile(JSON.parse(JSON.stringify(profile))), profile);
  assert.equal(
    "headers" in
      parseProfile({
        ...profile,
        connection: {
          ...defaultConnection,
          headers: { Authorization: "secret" },
        },
      }).connection,
    false,
  );
});
test("profiles reject credentials, unsafe schemes, dangerous mappings, and excessive prompts", () => {
  for (const endpoint of [
    "javascript:alert(1)",
    "https://user:password@example.com/chat",
    "https://example.com/chat?key=secret",
    "//external.example/chat",
    "/api\\evil",
  ])
    assert.throws(() =>
      parseProfile({
        ...profile,
        connection: { ...defaultConnection, endpoint },
      }),
    );
  assert.throws(() =>
    parseProfile({
      ...profile,
      connection: { ...defaultConnection, questionField: "__proto__" },
    }),
  );
  assert.throws(() =>
    parseProfile({ ...profile, prompts: Array(7).fill("hello") }),
  );
});
test("custom question fields and history preserve the expected contract", () => {
  assert.deepEqual(
    buildRequestBody(
      { ...defaultConnection, questionField: "query", includeHistory: true },
      request,
    ),
    { query: "Next question", history: request.messages.slice(0, -1) },
  );
  assert.deepEqual(
    buildRequestBody(
      { ...defaultConnection, requestMode: "messages", model: "my-model" },
      request,
    ),
    { messages: request.messages, stream: false, model: "my-model" },
  );
  assert.equal(readPath({}, "constructor.name"), undefined);
});
test("JSON connection maps nested answers and common document sources", async (t) => {
  let sent: unknown;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, options: RequestInit) => {
      sent = JSON.parse(options.body as string);
      return Response.json({
        data: {
          answer: "An answer",
          documents: [
            {
              page_content: "Supporting excerpt",
              metadata: { source: "Guide", page: 3 },
            },
          ],
        },
      });
    },
  );
  const adapter = createProjectAdapter({
    ...defaultConnection,
    questionField: "query",
    answerPath: "data.answer",
    sourcesPath: "data.documents",
  });
  const events = [];
  for await (const event of adapter.stream(
    request,
    new AbortController().signal,
  ))
    events.push(event);
  assert.deepEqual(sent, { query: "Next question" });
  assert.ok(events.some((e) => e.type === "delta" && e.text === "An answer"));
  const sourceEvent = events.find((e) => e.type === "sources");
  assert.equal(sourceEvent?.sources[0].title, "Guide");
  assert.equal(sourceEvent?.sources[0].page, 3);
  assert.equal(events.at(-1)?.type, "done");
});
test("bad answer mappings fail instead of displaying an empty answer", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ output: "somewhere else" }),
  );
  await assert.rejects(async () => {
    for await (const e of createProjectAdapter(defaultConnection).stream(
      request,
      new AbortController().signal,
    ))
      void e;
  }, /No answer text found/);
});
test("NDJSON connections can send a custom question body", async (t) => {
  let sent: unknown;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, options: RequestInit) => {
      sent = JSON.parse(options.body as string);
      return new Response('{"type":"delta","text":"A"}\n{"type":"done"}\n', {
        headers: { "content-type": "application/x-ndjson" },
      });
    },
  );
  for await (const e of createProjectAdapter({
    ...defaultConnection,
    protocol: "ndjson",
  }).stream(request, new AbortController().signal))
    void e;
  assert.deepEqual(sent, { question: "Next question" });
});
test("a cancelled JSON request emits no answer", async (t) => {
  const abort = new AbortController();
  t.mock.method(globalThis, "fetch", async () => {
    abort.abort();
    return Response.json({ answer: "too late" });
  });
  await assert.rejects(
    async () => {
      for await (const e of createProjectAdapter(defaultConnection).stream(
        request,
        abort.signal,
      ))
        void e;
    },
    { name: "AbortError" },
  );
});

test("query preset preserves a thread for follow-ups and isolates new conversations", () => {
  assert.deepEqual(parseProfile(defaultProfile), defaultProfile);
  assert.deepEqual(buildRequestBody(queryConnection, request), {
    q: "Next question",
    thread_id: "test",
  });
  assert.deepEqual(
    buildRequestBody(queryConnection, {
      ...request,
      conversationId: "new-thread",
    }),
    { q: "Next question", thread_id: "new-thread" },
  );
  assert.deepEqual(
    buildRequestBody(
      { ...defaultConnection, conversationIdField: "" },
      request,
    ),
    { question: "Next question" },
  );
  const messages = buildRequestBody(
    {
      ...defaultConnection,
      requestMode: "messages",
      conversationIdField: "session_id",
    },
    request,
  );
  assert.equal(readPath(messages, "session_id"), "test");
});

test("conversation mappings survive export and reject conflicting fields", () => {
  assert.deepEqual(
    parseProfile(JSON.parse(JSON.stringify(defaultProfile))),
    defaultProfile,
  );
  for (const conversationIdField of [
    "q",
    "__proto__",
    "constructor",
    "prototype",
    "history",
    "model",
    "messages",
    "stream",
    "nested.id",
    123,
  ]) {
    assert.throws(() =>
      parseProfile({
        ...defaultProfile,
        connection: { ...queryConnection, conversationIdField },
      }),
    );
  }
});

test("query adapter posts the Streamlit contract and reads the backend answer", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (endpoint: string, options: RequestInit) => {
      assert.equal(endpoint, "/api/connect");
      assert.deepEqual(JSON.parse(options.body as string), {
        backendUrl: queryConnection.backendUrl,
        queryPath: "/query",
        payload: { q: "Next question", thread_id: "test" },
      });
      return Response.json({
        question: "Next question",
        answer: "Live-format answer",
        sources: [],
        status: "Response generated.",
      });
    },
  );
  const events = [];
  for await (const event of createProjectAdapter(queryConnection).stream(
    request,
    new AbortController().signal,
  ))
    events.push(event);
  assert.ok(
    events.some((e) => e.type === "delta" && e.text === "Live-format answer"),
  );
  assert.equal(events.at(-1)?.type, "done");
});

test("JSON errors explain non-JSON responses and backend timeouts", async (t) => {
  for (const [response, message] of [
    [new Response("<html>wrong endpoint</html>"), /Expected a JSON response/],
    [new Response("", { status: 504 }), /timed out/],
  ] as const) {
    const mock = t.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(async () => {
      for await (const e of createProjectAdapter(queryConnection).stream(
        request,
        new AbortController().signal,
      ))
        void e;
    }, message);
    mock.mock.restore();
  }
});

test("raw passages display without invented metadata or colliding IDs", () => {
  const passages = ["CONTENT: A retrieved passage.", "Another passage."];
  const sources = responseSources(passages);
  assert.deepEqual(
    sources.map((s) => s.excerpt),
    passages,
  );
  assert.equal(sources[0].title, "Retrieved passage 1");
  assert.equal(sources[0].page, undefined);
  assert.notEqual(sources[0].id, responseSources(passages)[0].id);
});
