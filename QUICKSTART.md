# Use Folio with your RAG project

You do not need to edit React components to connect a compatible API.

For your Cloud Run backend, use:

| Setting            | Value                                               |
| ------------------ | --------------------------------------------------- |
| Backend server URL | `https://rag-api-851836889082.us-central1.run.app/` |
| Question path      | `/query`                                            |
| Preset             | RAG query — q + thread_id                           |
| Response format    | JSON                                                |
| Answer field       | `answer`                                            |
| Sources field      | `sources`                                           |

To connect anyone else's backend:

1. Choose **Add project** and name it.
2. Paste their **Backend server URL**.
3. Set its **Question path** (usually `/query` or `/chat`).
4. Choose a preset or map the request and answer fields to match their API.
5. Click **Send test question** to verify it.
6. **Save project** and start chatting.

Folio joins the server URL and question path and handles the connection. For
example, `https://other-rag.example.com/` plus `/query` becomes
`https://other-rag.example.com/query`. No environment-file changes or restart are
needed. Different projects can use different servers at the same time.

Settings are saved in this browser. Conversations remain session-only. Editing a connection clears its current session conversations to avoid sending previous context to a different backend.

## Common configurations

| Your backend                                                  | Request settings                                        | Answer path                 |
| ------------------------------------------------------------- | ------------------------------------------------------- | --------------------------- |
| Accepts `{"q":"…","thread_id":"…"}`, returns `{"answer":"…"}` | Question field: `q`; conversation ID field: `thread_id` | `answer`                    |
| Accepts `{"question":"…"}`, returns `{"answer":"…"}`          | Question field: `question`                              | `answer`                    |
| Accepts `{"query":"…"}`, returns `{"result":"…"}`             | Question field: `query`                                 | `result`                    |
| Accepts `{"input":"…"}`, returns `{"data":{"answer":"…"}}`    | Question field: `input`                                 | `data.answer`               |
| Accepts a chat `messages` array and returns choices           | Messages array; supply model if required                | `choices.0.message.content` |
| Streams Folio JSON events                                     | NDJSON; choose the request shape your API accepts       | Not required                |

The messages preset requests `stream: false`. For streaming use the documented NDJSON contract. SSE and other custom formats require a transport adapter; there is no universal RAG wire protocol.

Set **Conversation ID field** when the backend maintains memory by thread/session ID. Follow-ups reuse the ID; new conversations and connection tests get distinct UUIDs. Leave this field blank for stateless backends.

Enable **Include previous messages** only if your question-style endpoint accepts a `history` array. The request preview shows exactly what will be sent. The Folio envelope preset sends projectId, conversationId, documentIds, and messages. Its projectId is the profile's local ID; if your service uses its own identifiers, map them at your gateway or custom adapter.

## Sources

Set the optional sources field path to `sources`, `data.documents`, or the corresponding path in your response. Leave it empty for answer-only APIs.

```json
{
  "answer": "Your RAG response",
  "sources": [
    { "title": "My document", "excerpt": "The supporting passage", "page": 4 }
  ]
}
```

Sources can also be raw passage strings, as returned by the Cloud Run backend. These display as **Retrieved passage 1**, **Retrieved passage 2**, etc., with the original text and no invented document title or page.

Source objects can use `title` or `source`/`metadata.source`, and `excerpt`, `content`, or `page_content`. Page references are optional and should be one-based. Missing page references are never invented. IDs, kind, and updated date are optional for JSON responses. Other source schemas need normalization at your backend or adapter.

The live evidence library shows sources returned in the selected conversation, not every document in the backend.

## Reuse the same setup elsewhere

Open **Settings → Export settings**. In another installation, choose **Add project → Import settings**, paste the JSON, review it, and save. Import creates a new local project when used from Add project. There is also a starter file in `examples/project.json`.

## If you only have a Python RAG function

Copy `examples/fastapi_bridge.py` into your backend project and wrap your async function:

```python
from fastapi_bridge import create_rag_app
from my_rag import ask_rag

app = create_rag_app(ask_rag)
```

The function accepts a question string and returns either an answer string or the answer/sources object above. Install FastAPI and Uvicorn in your backend environment, then run `uvicorn app:app --host 127.0.0.1 --port 8000`. For a synchronous pipeline, call it through an async wrapper using `asyncio.to_thread` rather than blocking the event loop.

For a connection-only demo, run `python3 -m uvicorn examples.demo_backend:app --host 127.0.0.1 --port 8011` from this repository. That endpoint returns a labeled fixed response; it does not contain a RAG model.

## Authentication and deployment

New profiles connect through Folio's `/api/connect` server route, so backend CORS
changes are unnecessary. The server must be publicly reachable. Private network,
localhost, and cloud metadata addresses are blocked; redirects are not followed.
DNS is checked and the outgoing connection uses the checked IP address.

The route does not send browser cookies or environment API keys to user-selected
servers. Services requiring authentication need an authenticated gateway or a
custom adapter. Folio itself does not yet provide user login or shared-service
rate limits; deploy behind access control when sharing it.

Old direct/same-origin profiles and the environment-configured `/api/rag` route
remain supported. Their old CORS and authentication requirements still apply.
