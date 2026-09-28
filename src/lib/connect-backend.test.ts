import { test } from "node:test";
import assert from "node:assert/strict";
import { connectBackend } from "./connect-backend";
import { backendEndpoint } from "./backend-url";
import {
  isPublicAddress,
  resolvePublicAddress,
  BackendAddressError,
} from "./public-backend";
import {
  queryConnection,
  projectTransport,
  parseProfile,
  defaultProfile,
  editableConnection,
} from "./project-profiles";
import { createProjectAdapter } from "./project-adapter";
import type { ChatRequest } from "./types";

const chat: ChatRequest = {
  conversationId: "thread-a",
  projectId: "custom-a",
  documentIds: [],
  messages: [{ role: "user", content: "Hello" }],
};
const req = (body: unknown, headers = {}) =>
  new Request("http://localhost:3000/api/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

test("base URL and question path combine without duplicate slashes or lost prefixes", () => {
  assert.equal(
    backendEndpoint("https://first.example/", "/query"),
    "https://first.example/query",
  );
  assert.equal(
    backendEndpoint("https://second.example/v1/", "/chat"),
    "https://second.example/v1/chat",
  );
  for (const [base, path] of [
    ["", "/query"],
    ["file:///tmp/a", "/query"],
    ["https://u:p@example.com", "/query"],
    ["https://example.com?secret=x", "/query"],
    ["https://example.com", "//other.example"],
    ["https://example.com", "/../internal"],
    ["https://example.com", "/%2e%2e/internal"],
  ])
    assert.throws(() => backendEndpoint(base, path));
});

test("two saved projects route to their own servers and send only the mapped payload", async () => {
  const destinations: string[] = [];
  for (const [backendUrl, queryPath, questionField] of [
    ["https://first.example/", "/query", "q"],
    ["https://second.example/api/", "/chat", "question"],
  ]) {
    const profile = parseProfile({
      ...defaultProfile,
      connection: { ...queryConnection, backendUrl, queryPath, questionField },
    });
    assert.equal(
      parseProfile(JSON.parse(JSON.stringify(profile))).connection.backendUrl,
      backendUrl.replace(/\/$/, ""),
    );
    const transport = projectTransport(profile.connection, chat);
    assert.equal(transport.endpoint, "/api/connect");
    const result = await connectBackend(
      req(transport.body),
      async (url, body) => {
        destinations.push(url.toString());
        assert.deepEqual(JSON.parse(body), {
          [questionField]: "Hello",
          thread_id: "thread-a",
        });
        return Response.json({ answer: "OK", sources: [] });
      },
    );
    assert.equal(result.status, 200);
  }
  assert.deepEqual(destinations, [
    "https://first.example/query",
    "https://second.example/api/chat",
  ]);
});

test("preserves existing connections while making their server editable", () => {
  const { backendUrl: _base, queryPath: _path, ...legacy } = queryConnection;
  assert.equal(
    editableConnection(legacy).backendUrl,
    queryConnection.backendUrl,
  );
  assert.deepEqual(projectTransport(legacy, chat).body, {
    q: "Hello",
    thread_id: "thread-a",
  });
  const direct = editableConnection({
    ...legacy,
    endpoint: "https://another.example/api/chat",
  });
  assert.equal(direct.backendUrl, "https://another.example");
  assert.equal(direct.queryPath, "/api/chat");
});

test("dynamic gateway rejects bad input and cross-origin requests before sending", async () => {
  const send = async () => {
    throw new Error("Must not send");
  };
  assert.equal((await connectBackend(req({}), send)).status, 400);
  assert.equal(
    (
      await connectBackend(
        req({}, { Origin: "https://elsewhere.example" }),
        send,
      )
    ).status,
    403,
  );
  const request = req(projectTransport(queryConnection, chat).body, {
    Origin: "http://127.0.0.1:3000",
    Host: "127.0.0.1:3000",
  });
  assert.equal(
    (await connectBackend(request, async () => Response.json({ answer: "OK" })))
      .status,
    200,
  );
});

test("non-public destinations, mixed DNS results, and alternative IP notation are blocked", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2002:7f00:1::",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  await assert.rejects(
    resolvePublicAddress(new URL("http://2130706433").hostname),
    BackendAddressError,
  );
  await assert.rejects(
    resolvePublicAddress(
      "mixed.example",
      async () =>
        [
          { address: "8.8.8.8", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ] as never,
    ),
    BackendAddressError,
  );
  assert.deepEqual(
    await resolvePublicAddress(
      "public.example",
      async () => [{ address: "8.8.8.8", family: 4 }] as never,
    ),
    { address: "8.8.8.8", family: 4 },
  );
});

test("new server profiles support NDJSON through the same gateway", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (endpoint: string, options: RequestInit) => {
      assert.equal(endpoint, "/api/connect");
      assert.equal(
        JSON.parse(options.body as string).backendUrl,
        "https://second.example",
      );
      return new Response('{"type":"delta","text":"OK"}\n{"type":"done"}\n', {
        headers: { "Content-Type": "application/x-ndjson" },
      });
    },
  );
  const events = [];
  for await (const event of createProjectAdapter({
    ...queryConnection,
    backendUrl: "https://second.example",
    protocol: "ndjson",
  }).stream(chat, new AbortController().signal))
    events.push(event);
  assert.equal(events.at(-1)?.type, "done");
});
