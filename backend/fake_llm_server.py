"""Fake LLM backend server.

A small FastAPI wrapper around the local Ollama LMF3 model. It exposes an
Ollama-compatible chat endpoint (and a health endpoint) so other services can
treat it like a real LLM backend without talking to Ollama directly.

Run:
    python3 backend/fake_llm_server.py
Then:
    curl http://127.0.0.1:8790/health
    curl -X POST http://127.0.0.1:8790/api/chat \\
         -H 'Content-Type: application/json' \\
         -d '{"model":"lfm3:latest","messages":[{"role":"user","content":"Hi"}]}'
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "lfm3:latest")
HOST = os.getenv("FAKE_LLM_HOST", "127.0.0.1")
PORT = int(os.getenv("FAKE_LLM_PORT", "8790"))

app = FastAPI(title="Fake LMF3 Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str = MODEL
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float | None = 0.7
    max_tokens: int | None = 300


@app.get("/health")
async def health() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            r.raise_for_status()
            models = [m.get("name") for m in r.json().get("models", [])]
            return {
                "status": "ok",
                "backend": "fake-llm",
                "engine": "ollama",
                "ollama_url": OLLAMA_URL,
                "model": MODEL,
                "model_available": MODEL in models,
                "available_models": models,
            }
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Ollama unreachable: {exc}")


@app.get("/api/tags")
async def tags() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(f"{OLLAMA_URL}/api/tags")
        r.raise_for_status()
        return r.json()


@app.post("/api/chat")
async def chat(payload: ChatRequest) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            r = await client.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": payload.model or MODEL,
                    "messages": [m.model_dump() for m in payload.messages],
                    "stream": False,
                    "think": False,
                    "options": {
                        "temperature": payload.temperature or 0.7,
                        "num_predict": payload.max_tokens or 300,
                    },
                },
            )
            r.raise_for_status()
            data = r.json()
            message = data.get("message", {"role": "assistant", "content": ""})
            if not (message.get("content") or "").strip():
                thinking = (message.get("thinking") or "").strip()
                if thinking:
                    message = {"role": "assistant", "content": thinking}
            return {
                "model": data.get("model", payload.model or MODEL),
                "message": message,
                "done": data.get("done", True),
            }
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text[:500])
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Upstream error: {exc}")


if __name__ == "__main__":
    print(f"Fake LMF3 backend · {HOST}:{PORT} · model={MODEL} · engine={OLLAMA_URL}")
    uvicorn.run(app, host=HOST, port=PORT)
