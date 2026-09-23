# Reusable RAG workspace — discussion draft

## Direction

Build a React + TypeScript frontend with Next.js and keep retrieval/generation behind a replaceable adapter. Python backends do not need rewriting. Chainlit remains a good alternative when speed of Python integration matters more than owning the whole interface.

Confirmed direction: serve both internal users and external customers, connect to an existing Python/FastAPI backend, and use the midnight navy/mint theme. Customer authentication and authorization must be integrated before deploying real data. The current implementation is a local demonstration, not a multi-tenant service.

## Product ideas

- Three-part workspace: projects/conversations, chat, and evidence.
- Click citations to inspect document excerpts and page references.
- Project configuration defines branding, suggested prompts, documents, and supported capabilities.
- Explicit demo mode makes it possible to evaluate the design without an API key.
- Calm dark and light themes; clear typography, generous spacing, restrained motion.
- Session-only conversation history initially; real history belongs behind authenticated backend APIs.
- Add document ingestion, feedback persistence, and model controls only when a backend supports them.

## Edge cases and decisions

| Case                             | Expected behavior                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| No evidence                      | State that the sources do not support an answer; do not fabricate citations.                                        |
| Conflicting evidence             | Present both claims with their source dates and citations.                                                          |
| Indexing or failed documents     | Distinguish ready, processing, and failed; exclude unready content.                                                 |
| Interrupted stream               | Preserve partial text, label it incomplete, allow retry.                                                            |
| Stop generation                  | Abort the active request; prevent late chunks from updating another conversation.                                   |
| Project switch                   | Cancel generation and isolate conversations and document scope by project.                                          |
| Expired authentication           | Ask for sign-in; do not silently retry with another identity.                                                       |
| Rate limits or unavailable model | Show a useful error with retry; avoid unbounded retries.                                                            |
| Long conversation                | Backend controls context limits and makes any summarization explicit.                                               |
| Citation unavailable             | Preserve its label and explain why the document cannot be opened.                                                   |
| Similarity scores                | Never label retrieval similarity as answer confidence.                                                              |
| Untrusted document text          | Treat as data; backend must enforce tool permissions and source access.                                             |
| Mobile or keyboard use           | Evidence opens below chat or in an accessible panel; controls have labels and focus states.                         |
| Multiple tenants                 | Server authorizes each conversation, source, upload, and retrieval request. UI filtering is not an access boundary. |

## Adapter contract

`stream(request, abortSignal)` returns an asynchronous stream of typed events: status, text delta, sources, completion. Errors terminate with a recoverable UI state. Requests include project ID, conversation ID, document IDs, and completed conversation messages. A backend must validate and authorize all identifiers.

Use a demo adapter for the first visual prototype. Integrate the real backend only after its API, authentication, and streaming protocol are known. Never put model-provider secrets in browser configuration.

## Questions to settle together

1. Which identity provider will handle internal and customer sign-in?
2. What is the FastAPI request/response schema, streaming protocol, and authentication mechanism?
3. Separate deployments per project, or one workspace with a project switcher?
4. Who can add documents, and which formats must be supported?
5. Does evidence need a full PDF viewer with highlights, or are excerpts sufficient?
6. Should each customer have its own logo and accent color?

## Reference documentation

- https://nextjs.org/docs/app/getting-started/installation
- https://docs.chainlit.io/advanced-features/streaming
- https://docs.chainlit.io/customisation/theme
- https://docs.chainlit.io/authentication/overview
