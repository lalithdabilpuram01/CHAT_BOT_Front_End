# Use Folio with your RAG project

You do not need to edit React components to connect a compatible API.

1. Start your RAG backend and Folio (`npm run dev`).
2. In the left sidebar, choose **Add project**. On mobile, open the navigation menu first.
3. Name your project and enter its chat endpoint, for example `http://127.0.0.1:8000/chat`.
4. Choose **JSON**, set the question field your API accepts, and set the field path containing its answer.
5. Click **Send test question** to make one real API request and inspect the result.
6. **Save project**. Select it from the project switcher and start chatting.

Settings are saved in this browser. Conversations remain session-only. Editing a connection clears its current session conversations to avoid sending previous context to a different backend.

## Common configurations

| Your backend | Request settings | Answer path |
| --- | --- | --- |
| Accepts `{"question":"…"}`, returns `{"answer":"…"}` | Question field: `question` | `answer` |
| Accepts `{"query":"…"}`, returns `{"result":"…"}` | Question field: `query` | `result` |
| Accepts `{"input":"…"}`, returns `{"data":{"answer":"…"}}` | Question field: `input` | `data.answer` |
| Accepts a chat `messages` array and returns choices | Messages array; supply model if required | `choices.0.message.content` |
| Streams Folio JSON events | NDJSON; choose the request shape your API accepts | Not required |

The messages preset requests `stream: false`. For streaming use the documented NDJSON contract. SSE and other custom formats require a transport adapter; there is no universal RAG wire protocol.

Enable **Include previous messages** only if your question-style endpoint accepts a `history` array. The request preview shows exactly what will be sent. The Folio envelope preset sends projectId, conversationId, documentIds, and messages. Its projectId is the profile's local ID; if your service uses its own identifiers, map them at your gateway or custom adapter.

## Sources

Set the optional sources field path to `sources`, `data.documents`, or the corresponding path in your response. Leave it empty for answer-only APIs.

```json
{
  "answer": "Your RAG response",
  "sources": [
    {"title": "My document", "excerpt": "The supporting passage", "page": 4}
  ]
}
```

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

Direct browser connections require CORS for the exact frontend origin. Both localhost and 127.0.0.1 defaults are allowed by the sample bridge; add your actual development origin if using another port. An HTTPS frontend cannot normally call an HTTP backend due to mixed-content restrictions.

For production, use an authenticated same-origin endpoint such as `/api/chat`; same-origin session cookies are sent automatically. Cross-origin credentials and provider API keys are intentionally not stored in browser profiles. The supplied Python bridge is for local development and does not implement authentication. Internal/customer access, tenant isolation, and source permissions must remain enforced by your backend.
