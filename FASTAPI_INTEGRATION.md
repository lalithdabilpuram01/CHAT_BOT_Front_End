# FastAPI integration contract

This is the proposed boundary, not a claim that the current app is connected. The visible app uses sample data. The HTTP adapter exists and is tested, but no `/api/chat` route or authentication provider has been configured.

## Recommended topology

Browser → authenticated same-origin `/api/chat` → FastAPI → retrieval/model services.

The same-origin route can be served by a Next.js route handler or an existing gateway. Keep model-provider credentials on the server. Resolve the user and tenant from the authenticated session, never from a trusted browser-supplied `tenantId`.

FastAPI must authorize the project, conversation, and every source against the authenticated user. For customer deployments, retrieval itself must apply access filters before selecting evidence. Validate origin/CSRF protections for cookie-authenticated requests and set appropriate per-user limits. If using bearer authentication instead, adapt the transport to your identity provider's token flow.

## Request

`POST /api/chat`, `Content-Type: application/json`, `Accept: application/x-ndjson`.

```json
{
  "projectId": "product",
  "conversationId": "a-conversation-uuid",
  "messages": [
    { "role": "user", "content": "What are the next release priorities?" }
  ],
  "documentIds": ["roadmap", "principles", "onboarding"]
}
```

Project/document IDs are requested scope, not permission grants. Production conversation history should be loaded by the backend using an authorized conversation ID; browser-supplied history must not override a system prompt or server-owned record.

## Streaming response

`200 OK`, `Content-Type: application/x-ndjson`, `Cache-Control: no-store`. Each line is a complete JSON object. Newlines inside string values must be JSON-escaped. Configure any proxy to forward chunks without buffering.

```jsonl
{"type":"status","text":"Searching your documents…"}
{"type":"sources","sources":[{"id":"roadmap","title":"Product roadmap","kind":"PDF","page":4,"excerpt":"The next release focuses on guided onboarding.","updated":"2026-09-18"}]}
{"type":"delta","text":"The next release focuses on "}
{"type":"delta","text":"guided onboarding."}
{"type":"done"}
```

The current contract uses answer-level supporting-source chips. Per-claim inline citation spans and PDF highlights would require an extended citation model. For non-paginated content the prototype uses a page reference of 1; extend the model with section/anchor locators before integrating real websites or Markdown sources.

Return `sources: []` and an explicit unsupported answer when the documents do not support the question. Do not invent citations or convert a raw similarity score into an answer confidence percentage.

An `error` event terminates a stream. Use 401/403/429/5xx before the stream starts where appropriate. The frontend retains partial text and labels interrupted answers. A stream without `done` is considered incomplete.

## Adapter usage

```ts
import { createHttpAdapter } from "@/lib/http-adapter";

const adapter = createHttpAdapter("/api/chat");
// In the workspace's send handler, use adapter.stream(request, signal).
```

`fetch` uses same-origin credentials. This adapter is intended for a same-origin authenticated gateway. Do not point it directly at a different origin and assume session cookies or CORS are already configured.

For an existing SSE backend, implement another `RagAdapter` that maps its events to the same `ChatEvent` types; the workspace need not change its conversation or evidence rendering.

## Additional backend capabilities

Before a real customer deployment, connect:

- Authorized project and source listing; separate metadata from document content.
- Persistent conversation history, deletion, and retention rules.
- Signed or authorized source previews; revoked source access must remain revoked.
- Upload validation, file limits, duplicate detection, and ingestion states (`queued`, `processing`, `ready`, `failed`).
- Cancellation propagation from the disconnected browser to generation when supported.
- Timeouts and bounded retries appropriate to the deployed backend.

An internal diagnostics view can later expose retrieval timing and chunk matches. Keep it permissioned and show useful operational status rather than model private reasoning.
