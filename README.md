# Folio — reusable RAG workspace

A Next.js + React + TypeScript starter for a shared RAG frontend, with midnight navy/mint styling and a light theme. Designed for your Python/FastAPI services.

## Run

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://127.0.0.1:3000. The server binds to loopback by default.

```bash
npm run build
npm run typecheck
npm test
```

## What works now

- Three configurable sample projects, with isolated in-memory conversations.
- Streaming sample replies, stop, retry of interrupted replies, and copy.
- Suggested questions, Markdown answers, and clickable supporting-source chips.
- Evidence previews and a knowledge library.
- Dark/light themes, responsive layouts, keyboard composer, and reduced-motion support.
- A tested HTTP streaming adapter that handles partial UTF-8 chunks, malformed events, interrupted streams, and authentication/rate-limit responses.

## What is a demonstration

The visible app uses `demoAdapter`. Documents are fictional excerpts and answers are fixed examples. Nothing is uploaded, indexed, retrieved, or sent to an AI model. An out-of-scope question gets an explicit unsupported-answer response.

Conversations live only in memory and disappear on refresh. Only the theme preference goes into local storage. There is no login, persistent history, real PDF viewer, ingestion, or backend connection yet.

Do not deploy this as a customer-facing application with real data until authentication and server-side authorization are implemented. UI project isolation is not a security boundary.

## Reuse in another RAG project

1. Define project metadata, starter questions, and supported sources in `src/lib/projects.ts` during prototyping; fetch them from authorized backend endpoints for real deployments.
2. Implement `RagAdapter` from `src/lib/types.ts`, or use `createHttpAdapter` with the documented NDJSON protocol.
3. Replace the `demoAdapter.stream(...)` boundary in `src/components/workspace.tsx` after configuring the authenticated endpoint.
4. Replace sample document data and demo labels together when the connection is real.
5. Adjust CSS color tokens in `.workspace` and `.workspace.light` to match another brand.

The UI deliberately does not depend on LangChain, LlamaIndex, a vector database, or a model provider. Those choices stay in FastAPI.

## Structure

| File                           | Purpose                                                |
| ------------------------------ | ------------------------------------------------------ |
| `src/components/workspace.tsx` | Workspace, conversations, cancellation, evidence UI    |
| `src/app/globals.css`          | Themes and responsive layout                           |
| `src/lib/projects.ts`          | Sample project configuration and evidence              |
| `src/lib/types.ts`             | Shared adapter, message, source, and project contracts |
| `src/lib/demo-adapter.ts`      | Explicitly simulated streaming                         |
| `src/lib/http-adapter.ts`      | Validated NDJSON transport                             |
| `src/lib/adapters.test.ts`     | Cancellation, isolation, and streaming contract tests  |
| `DESIGN.md`                    | Product ideas, edge cases, and open decisions          |
| `FASTAPI_INTEGRATION.md`       | API contract and production integration plan           |

Google Fonts supplies DM Sans and Manrope, with system fallbacks. For an offline or privacy-sensitive deployment, self-host these fonts.

## Next decisions

Provide your FastAPI endpoint/schema and the sign-in approach you want. We can then connect the real stream, authorized source listing, and conversation persistence, followed by uploads and indexing status.
