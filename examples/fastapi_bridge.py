"""Local-development bridge: plug in your own async RAG function.

Example in your backend's app.py:
    from fastapi_bridge import create_rag_app
    from my_pipeline import ask_rag
    app = create_rag_app(ask_rag)

ask_rag(question: str) must return a string or an object shaped like:
    {"answer": "...", "sources": [{"title": "...", "excerpt": "..."}]}

Install fastapi and uvicorn in your backend environment, then run:
    uvicorn app:app --host 127.0.0.1 --port 8000

This bridge has no authentication. Add your existing identity and source
authorization dependencies before using it beyond local development.
"""
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


class ChatInput(BaseModel):
    question: str = Field(min_length=1, max_length=8000)


def create_rag_app(
    ask_rag: Callable[[str], Awaitable[str | dict[str, Any]]],
    frontend_origins: list[str] | None = None,
) -> FastAPI:
    app = FastAPI(title="RAG interface bridge")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=frontend_origins or ["http://127.0.0.1:3000", "http://localhost:3000"],
        allow_methods=["POST"],
        allow_headers=["Content-Type", "Accept"],
    )

    @app.post("/chat")
    async def chat(request: ChatInput):
        result = await ask_rag(request.question)
        return {"answer": result, "sources": []} if isinstance(result, str) else result

    return app
