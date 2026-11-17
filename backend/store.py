from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from .models import ProviderConfig, PublicSettings, now_iso
from .seed import seed_projects

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("TABLECRAFT_DATA_DIR", ROOT / ".data"))
DB_PATH = DATA_DIR / "tablecraft.json"
SETTINGS_PATH = DATA_DIR / "settings.json"

PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "openai": {
        "model": "gpt-4.1-mini",
        "base_url": "https://api.openai.com/v1",
        "env": "OPENAI_API_KEY",
    },
    "anthropic": {
        "model": "claude-sonnet-4-5",
        "base_url": "https://api.anthropic.com",
        "env": "ANTHROPIC_API_KEY",
    },
    "google": {
        "model": "gemini-2.5-flash",
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "env": "GOOGLE_API_KEY",
    },
    "local": {
        "model": "llama3.2",
        "base_url": "http://localhost:11434",
        "env": "OLLAMA_API_KEY",
    },
}


class Store:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if not DB_PATH.exists():
            self._write_db({"projects": [], "runs": {}})
            db = self._read_db()
            db["projects"] = seed_projects()
            self._write_db(db)

    def _read_db(self) -> dict[str, Any]:
        with DB_PATH.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _write_db(self, data: dict[str, Any]) -> None:
        tmp = DB_PATH.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
        tmp.replace(DB_PATH)

    def list_projects(self) -> list[dict[str, Any]]:
        with self._lock:
            projects = self._read_db()["projects"]
            return sorted(projects, key=lambda p: p.get("updated_at", ""), reverse=True)

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with self._lock:
            for project in self._read_db()["projects"]:
                if project["id"] == project_id:
                    return project
            return None

    def create_project(self, project: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            db = self._read_db()
            used = {p["id"] for p in db["projects"]}
            base_id = project["id"]
            suffix = 2
            while project["id"] in used:
                project["id"] = f"{base_id}-{suffix}"
                suffix += 1
            db["projects"].append(project)
            self._write_db(db)
            return project

    def delete_project(self, project_id: str) -> bool:
        with self._lock:
            db = self._read_db()
            before = len(db["projects"])
            db["projects"] = [p for p in db["projects"] if p["id"] != project_id]
            if len(db["projects"]) == before:
                return False
            db.get("runs", {}).pop(project_id, None)
            self._write_db(db)
            return True

    def update_project(self, project_id: str, project: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            db = self._read_db()
            for index, current in enumerate(db["projects"]):
                if current["id"] == project_id:
                    project["updated_at"] = now_iso()
                    db["projects"][index] = project
                    self._write_db(db)
                    return project
            raise KeyError(project_id)

    def add_run(self, project_id: str, run: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            db = self._read_db()
            runs = db.setdefault("runs", {})
            project_runs = runs.setdefault(project_id, [])
            project_runs.insert(0, run)
            runs[project_id] = project_runs[:30]
            self._write_db(db)
            return run

    def list_runs(self, project_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return self._read_db().get("runs", {}).get(project_id, [])

    def _read_settings(self) -> dict[str, Any]:
        if not SETTINGS_PATH.exists():
            return {}
        with SETTINGS_PATH.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _write_settings(self, settings: dict[str, Any]) -> None:
        tmp = SETTINGS_PATH.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as handle:
            json.dump(settings, handle, ensure_ascii=False, indent=2)
        tmp.replace(SETTINGS_PATH)

    def get_runtime_config(self) -> ProviderConfig:
        saved = self._read_settings()
        provider = saved.get("provider", os.getenv("TABLECRAFT_PROVIDER", "openai"))
        defaults = PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["openai"])
        env_key = os.getenv(defaults["env"], "")
        saved_key = saved.get("api_key", "") if saved.get("provider") == provider else ""
        return ProviderConfig(
            provider=provider,
            model=saved.get("model", os.getenv("TABLECRAFT_MODEL", defaults["model"])),
            base_url=saved.get("base_url", defaults["base_url"]),
            api_key=env_key or saved_key,
        )

    def public_settings(self) -> PublicSettings:
        config = self.get_runtime_config()
        saved = self._read_settings()
        provider = config.provider
        defaults = PROVIDER_DEFAULTS[provider]
        env_key = os.getenv(defaults["env"], "")
        if env_key:
            source = "environment"
            hint = f"••••{env_key[-4:]}"
        elif saved.get("api_key") and saved.get("provider") == provider:
            source = "saved"
            hint = f"••••{saved['api_key'][-4:]}"
        else:
            source = "none"
            hint = "Not connected"
        has_key = bool(config.api_key)
        demo_mode = provider != "local" and not has_key
        return PublicSettings(
            provider=provider,
            model=config.model,
            base_url=config.base_url,
            has_api_key=has_key,
            key_hint=hint,
            key_source=source,
            demo_mode=demo_mode,
        )

    def save_settings(
        self,
        provider: str,
        model: str,
        base_url: str,
        api_key: str = "",
    ) -> PublicSettings:
        with self._lock:
            current = self._read_settings()
            existing_key = current.get("api_key", "") if current.get("provider") == provider else ""
            new_key = api_key.strip() or existing_key
            self._write_settings(
                {
                    "provider": provider,
                    "model": model.strip(),
                    "base_url": base_url.strip(),
                    "api_key": new_key,
                }
            )
            return self.public_settings()

    def clear_saved_key(self) -> PublicSettings:
        with self._lock:
            current = self._read_settings()
            current["api_key"] = ""
            self._write_settings(current)
            return self.public_settings()

    def reset_demo_data(self) -> list[dict[str, Any]]:
        with self._lock:
            self._write_db({"projects": seed_projects(), "runs": {}})
            return self.list_projects()


store = Store()
