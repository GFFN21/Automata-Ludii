from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .agent import framework_manifest, run_agent
from .models import NewProjectRequest, ProviderConfig, RunRequest
from .naming import title_from_brief
from .presenter import present_project, present_projects
from .providers import chat as provider_chat, check_connection
from .seed import make_project_from_brief
from .store import store
from .storage import store_file, resolve_path, guess_mime, MAX_UPLOAD_BYTES

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT / "frontend"

app = FastAPI(
    title="Tablecraft API",
    version="0.4.0",
    description="Backend and agent runtime for the Tablecraft board game design studio.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: str | None = None


class AISuggestRequest(BaseModel):
    section: str
    instruction: str = ""


class SettingsUpdate(BaseModel):
    provider: Literal["openai", "anthropic", "google", "local"] = "openai"
    model: str = Field(default="gpt-4.1-mini", max_length=200)
    base_url: str = Field(default="", max_length=500)
    api_key: str = Field(default="", max_length=1000)


@app.get("/api/health")
async def health() -> dict:
    settings = store.public_settings()
    chat_available = False
    if settings.provider == "local":
        import httpx

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                r = await client.get(f"{settings.base_url.rstrip('/')}/api/tags")
                chat_available = r.status_code == 200
        except Exception:
            chat_available = False
    else:
        chat_available = settings.has_api_key
    return {
        "status": "ok",
        "service": "tablecraft-api",
        "version": "0.4.0",
        "projects": len(store.list_projects()),
        "provider": settings.provider,
        "model": settings.model,
        "provider_connected": settings.has_api_key,
        "demo_mode": settings.demo_mode,
        "chat_available": chat_available,
        "time": datetime.now(UTC).isoformat(),
    }


@app.get("/api/projects")
async def list_projects() -> dict:
    return {"projects": present_projects(store.list_projects())}


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str) -> dict:
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"project": present_project(project), "runs": store.list_runs(project_id)}


@app.post("/api/projects", status_code=201)
async def create_project(payload: NewProjectRequest) -> dict:
    title = payload.title.strip() if payload.title else title_from_brief(payload.brief or " ".join(payload.game_type))
    project = make_project_from_brief(
        payload.brief,
        title,
        players_range=payload.players_range,
        game_type=payload.game_type,
        medium=payload.medium,
        style_mood=payload.style_mood,
        references=[r.model_dump() for r in payload.references],
    )
    saved = store.create_project(project)
    return {"project": present_project(saved)}


@app.post("/api/projects/import", status_code=201)
async def import_project(payload: dict) -> dict:
    project = payload.get("project", payload)
    if not isinstance(project, dict) or not project.get("id") or not project.get("name"):
        raise HTTPException(status_code=400, detail="Invalid project file")
    project.pop("cover_svg", None)
    for asset in project.get("assets", []):
        asset.pop("preview_svg", None)
    saved = store.create_project(project)
    return {"project": present_project(saved)}


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str) -> dict:
    deleted = store.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"deleted": project_id, "message": "Project deleted."}


@app.put("/api/projects/{project_id}")
async def update_project(project_id: str, payload: dict) -> dict:
    current = store.get_project(project_id)
    if not current:
        raise HTTPException(status_code=404, detail="Project not found")
    # merge top-level fields
    for key, value in payload.items():
        if key in ("cover_svg", "preview_svg"):
            continue
        current[key] = value
    current.pop("cover_svg", None)
    for asset in current.get("assets", []):
        asset.pop("preview_svg", None)
    saved = store.update_project(project_id, current)
    return {"project": present_project(saved)}


@app.post("/api/projects/{project_id}/agent/run")
async def run_project_agent(project_id: str, payload: RunRequest) -> dict:
    if not store.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        run, project = await run_agent(project_id, payload.prompt.strip(), payload.focus)
    except KeyError:
        raise HTTPException(status_code=404, detail="Project not found")
    except Exception as exc:  # keep the API envelope useful in the UI
        raise HTTPException(status_code=500, detail=f"Agent run failed: {exc}") from exc
    return {"run": run, "project": present_project(project)}


@app.get("/api/projects/{project_id}/assets")
async def list_project_assets(project_id: str) -> dict:
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"assets": [store.get_asset(a) for a in project.get("assets", []) if store.get_asset(a)]}


@app.post("/api/projects/{project_id}/assets", status_code=201)
async def upload_project_asset(
    project_id: str,
    file: UploadFile = File(...),
    name: str = Form(""),
    kind: str = Form("image"),
    tags: str = Form(""),
) -> dict:
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    import uuid

    asset_id = f"asset_{uuid.uuid4().hex[:10]}"
    stored = store_file(asset_id, file.filename or "upload.bin", content, kind="original")
    asset = {
        "id": asset_id,
        "project_id": project_id,
        "name": name.strip() or (file.filename or "Untitled asset"),
        "kind": kind,
        "format": (file.filename or "").rsplit(".", 1)[-1].upper() if "." in (file.filename or "") else "BIN",
        "mime": file.content_type or guess_mime(stored["path"]),
        "status": "Draft",
        "accent": project.get("accent", "#6C4CF1"),
        "description": "",
        "motif": "board",
        "resolution": "300 dpi",
        "folder": "",
        "tags": [t.strip() for t in tags.split(",") if t.strip()],
        "storage": {
            "backend": "local",
            "path": stored["path"],
            "uri": stored["uri"],
            "size_bytes": stored["size_bytes"],
            "sha256": stored["sha256"],
        },
        "variants": [],
        "metadata": {},
        "references": [],
        "provenance": {"source": "upload", "original_filename": stored["filename"]},
    }
    saved = store.create_asset(project_id, asset)
    return {"asset": saved}


@app.post("/api/projects/{project_id}/assets/create", status_code=201)
async def create_asset_meta(project_id: str, payload: dict) -> dict:
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    import uuid

    asset = {
        "id": f"asset_{uuid.uuid4().hex[:10]}",
        "project_id": project_id,
        "name": payload.get("name") or "New asset",
        "kind": payload.get("kind") or "Other",
        "format": payload.get("format") or "BIN",
        "status": "Draft",
        "accent": project.get("accent", "#6C4CF1"),
        "description": payload.get("description", ""),
        "folder": payload.get("folder", ""),
        "tags": payload.get("tags", []),
        "storage": None,
        "variants": [],
        "metadata": {},
        "references": [],
        "provenance": {"source": "manual"},
    }
    saved = store.create_asset(project_id, asset)
    return {"asset": saved}


@app.get("/api/assets/{asset_id}")
async def get_asset(asset_id: str) -> dict:
    asset = store.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"asset": asset}


@app.get("/api/assets/{asset_id}/file")
async def get_asset_file(asset_id: str, variant: str = "original") -> "FileResponse":
    from fastapi.responses import FileResponse

    asset = store.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    storage = asset.get("storage") or {}
    rel = storage.get("path", "")
    if not rel:
        raise HTTPException(status_code=404, detail="No file for asset")
    path = resolve_path(rel)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing")
    return FileResponse(path, media_type=asset.get("mime") or guess_mime(str(path)))


@app.patch("/api/assets/{asset_id}")
async def update_asset(asset_id: str, payload: dict) -> dict:
    try:
        asset = store.update_asset(asset_id, payload)
    except KeyError:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"asset": asset}


@app.delete("/api/assets/{asset_id}")
async def delete_asset(asset_id: str) -> dict:
    deleted = store.delete_asset(asset_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"deleted": asset_id}

@app.post("/api/projects/{project_id}/ai/suggest")
async def ai_suggest(project_id: str, payload: AISuggestRequest) -> dict:
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    config = store.get_runtime_config()
    section = payload.section
    instruction = payload.instruction.strip()
    rules = project.get("ruleset", {})
    if section == "title":
        current = project.get("name", "")
        prompt = f"Propose a better project title for this board game. Current title: {current!r}. Brief: {project.get('description','')}. Return only the new title, no quotes."
    elif section == "summary":
        current = project.get("tagline", "")
        prompt = f"Propose a sharper one-sentence tagline. Current: {current!r}. Game: {project.get('name')} — {project.get('description','')}. Return only the new tagline."
    elif section == "ruleset":
        current = rules.get("logline", "") or project.get("tagline", "")
        prompt = f"Propose a concise rules logline. Current: {current!r}. Include core loop and tension. Return only the logline."
    elif section == "description":
        current = project.get("description", "")
        prompt = f"Rewrite and improve this game description in Markdown. Keep it concise and engaging. Current: {current!r}. Return only the new description."
    else:
        current = ""
        prompt = f"Improve the {section} section. {instruction}"
    if instruction:
        prompt += f"\nAdditional guidance: {instruction}"
    messages = [{"role": "system", "content": "You are a board game design assistant. Be concise."}, {"role": "user", "content": prompt}]
    reply = None
    try:
        reply = await provider_chat(config, messages, None)
    except Exception:
        pass
    if not reply:
        # try local Ollama
        import httpx

        for base_url in ("http://localhost:11434", "http://127.0.0.1:11434", config.base_url):
            if not base_url:
                continue
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    r = await client.get(f"{base_url.rstrip('/')}/api/tags")
                    r.raise_for_status()
                    models = [m.get("name") for m in r.json().get("models", []) if m.get("name")]
                if not models:
                    continue
                from .models import ProviderConfig

                local_config = ProviderConfig(provider="local", model=models[0], base_url=base_url)
                reply = await provider_chat(local_config, messages, None)
                if reply:
                    break
            except Exception:
                continue
    if not reply:
        reply = f"{current} (AI suggestion unavailable offline)"
    return {"section": section, "current": current, "suggestion": clean_ai_text(reply)}

@app.get("/api/projects/{project_id}/runs")
async def list_project_runs(project_id: str) -> dict:
    if not store.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"runs": store.list_runs(project_id)}


@app.get("/api/settings")
async def get_settings() -> dict:
    return {"settings": store.public_settings().model_dump(), "providers": provider_catalog()}


@app.put("/api/settings")
async def update_settings(payload: SettingsUpdate) -> dict:
    settings = store.save_settings(
        provider=payload.provider,
        model=payload.model,
        base_url=payload.base_url,
        api_key=payload.api_key,
    )
    return {"settings": settings.model_dump()}


@app.delete("/api/settings/key")
async def delete_settings_key() -> dict:
    return {"settings": store.clear_saved_key().model_dump()}


@app.post("/api/settings/test")
async def test_settings() -> dict:
    config = store.get_runtime_config()
    connected, message = await check_connection(config)
    return {
        "connected": connected,
        "message": message,
        "provider": config.provider,
        "model": config.model,
    }


@app.get("/api/framework")
async def get_framework() -> dict:
    return framework_manifest()


@app.post("/api/demo/reset")
async def reset_demo() -> dict:
    projects = store.reset_demo_data()
    return {"projects": present_projects(projects), "message": "Demo projects restored."}


@app.get("/api/")
async def api_root() -> dict:
    return {
        "name": "Tablecraft API",
        "docs": "/docs",
        "ui": "/",
    }


def provider_catalog() -> list[dict]:
    return [
        {
            "id": "openai",
            "name": "OpenAI",
            "models": ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
            "base_url": "https://api.openai.com/v1",
            "key_label": "OpenAI API key",
        },
        {
            "id": "anthropic",
            "name": "Anthropic",
            "models": ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"],
            "base_url": "https://api.anthropic.com",
            "key_label": "Anthropic API key",
        },
        {
            "id": "google",
            "name": "Google Gemini",
            "models": ["gemini-2.5-flash", "gemini-2.5-pro"],
            "base_url": "https://generativelanguage.googleapis.com/v1beta",
            "key_label": "Google AI API key",
        },
        {
            "id": "local",
            "name": "Local / Ollama",
            "models": ["llama3.2", "qwen3:8b", "mistral"],
            "base_url": "http://localhost:11434",
            "key_label": "API key (optional)",
        },
    ]


@app.get("/api/local/models")
async def local_models(base_url: str = "http://localhost:11434") -> dict:
    import httpx

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(f"{base_url.rstrip('/')}/api/tags")
            r.raise_for_status()
            models = [m.get("name") for m in r.json().get("models", []) if m.get("name")]
            return {"available": True, "models": models, "default": models[0] if models else None, "base_url": base_url}
    except Exception as exc:
        return {"available": False, "models": [], "default": None, "base_url": base_url, "error": str(exc)}


@app.get("/api/chat/models")
async def chat_models() -> dict:
    # Prefer a real local Ollama instance when available, regardless of saved provider.
    import httpx

    for base_url in {store.get_runtime_config().base_url, "http://localhost:11434", "http://127.0.0.1:11434"}:
        if not base_url:
            continue
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                r = await client.get(f"{base_url.rstrip('/')}/api/tags")
                r.raise_for_status()
                models = [m.get("name") for m in r.json().get("models", []) if m.get("name")]
                if models:
                    return {"models": models, "default": models[0], "provider": "local", "base_url": base_url}
        except Exception:
            continue
    config = store.get_runtime_config()
    if config.provider == "local":
        return {"models": [], "default": config.model, "provider": "local", "base_url": config.base_url}
    return {"models": [config.model], "default": config.model, "provider": config.provider, "base_url": config.base_url}


def clean_ai_text(text: str) -> str:
    if not text:
        return ""
    text = text.strip()
    # Remove markdown code fences if the model wrapped the answer.
    if text.startswith("```"):
        lines = text.splitlines()
        # drop first fence line
        lines = lines[1:]
        # drop trailing fence
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    # Remove a leading language tag line like "markdown"
    if text.lower().startswith("markdown\n"):
        text = text[len("markdown\n"):].strip()
    return text.strip()


def offline_chat_reply(messages: list[dict]) -> str:
    last = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            last = m.get("content", "")
            break
    last = (last or "").strip()
    if not last:
        return "I'm running in offline mode. Ask me about rulesets, components, or playtest ideas and I'll help with deterministic suggestions."
    return (
        "I'm running in offline mode (no model provider available). "
        "Here's a quick suggestion based on your prompt:\n\n"
        f"- Break the idea into a clear win condition and 3-5 core actions.\n"
        f"- List the components you need and their counts.\n"
        f"- Add one edge case and one balancing note.\n\n"
        f"You asked: {last[:240]}"
    )


@app.post("/api/chat")
async def chat_endpoint(payload: ChatRequest) -> dict:
    config = store.get_runtime_config()
    messages = [m.model_dump() for m in payload.messages]
    # Try the configured provider first.
    try:
        reply = await provider_chat(config, messages, payload.model)
        if reply:
            return {"model": payload.model or config.model, "content": reply, "offline": False, "provider": config.provider}
    except Exception:
        pass
    # Fall back to a real local Ollama instance if one is reachable.
    import httpx

    for base_url in ("http://localhost:11434", "http://127.0.0.1:11434", config.base_url):
        if not base_url:
            continue
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                r = await client.get(f"{base_url.rstrip('/')}/api/tags")
                r.raise_for_status()
                models = [m.get("name") for m in r.json().get("models", []) if m.get("name")]
            if not models:
                continue
            local_config = ProviderConfig(provider="local", model=models[0], base_url=base_url)
            reply = await provider_chat(local_config, messages, payload.model if payload.model in models else None)
            if reply:
                return {"model": payload.model or models[0], "content": reply, "offline": False, "provider": "local"}
        except Exception:
            continue
    return {
        "model": "offline-demo",
        "content": offline_chat_reply(messages),
        "offline": True,
        "provider": "offline",
    }


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="studio")

