"""A fixed-response FastAPI fixture for testing the connection, not a RAG model.

From the frontend project directory:
    python3 -m uvicorn examples.demo_backend:app --host 127.0.0.1 --port 8011

Use http://127.0.0.1:8011/chat with the default JSON connection settings.
"""
from examples.fastapi_bridge import create_rag_app


async def sample_answer(question: str):
    return {
        "answer": "FastAPI connection verified. This is a fixed integration-test response, not an AI-generated answer.",
        "sources": [{
            "title": "Connection test fixture",
            "excerpt": "This source is returned by a separate FastAPI server to verify request mapping and evidence rendering.",
        }],
    }


app = create_rag_app(sample_answer)
