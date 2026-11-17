from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from pathlib import Path
from typing import Any

from .models import now_iso

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("TABLECRAFT_DATA_DIR", ROOT / ".data"))
ASSETS_DIR = DATA_DIR / "assets"

ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
MAX_UPLOAD_BYTES = int(os.getenv("TABLECRAFT_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))


def safe_id(value: str) -> str:
    if not ID_RE.match(value or ""):
        raise ValueError(f"Invalid id: {value!r}")
    return value


def data_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


def assets_dir() -> Path:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    return ASSETS_DIR


def asset_dir(asset_id: str) -> Path:
    aid = safe_id(asset_id)
    path = assets_dir() / aid
    path.mkdir(parents=True, exist_ok=True)
    return path


def asset_record_path(asset_id: str) -> Path:
    return asset_dir(asset_id) / "asset.json"


def read_asset(asset_id: str) -> dict[str, Any] | None:
    path = asset_record_path(asset_id)
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_asset(record: dict[str, Any]) -> dict[str, Any]:
    asset_id = safe_id(record["id"])
    path = asset_record_path(asset_id)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(record, handle, ensure_ascii=False, indent=2)
    tmp.replace(path)
    return record


def delete_asset_files(asset_id: str) -> None:
    path = assets_dir() / safe_id(asset_id)
    if path.exists():
        shutil.rmtree(path)


def store_file(asset_id: str, filename: str, content: bytes, kind: str = "original") -> dict[str, Any]:
    aid = safe_id(asset_id)
    directory = asset_dir(aid) / "files"
    directory.mkdir(parents=True, exist_ok=True)
    # Sanitize filename: keep only basename and a safe extension.
    base = Path(filename).name
    ext = Path(base).suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,8}", ext):
        ext = ""
    stored_name = f"{kind}{ext}" if kind != "original" else f"original{ext}"
    # Avoid collisions for variants by prefixing kind.
    if kind != "original":
        stored_name = f"{kind}{ext}"
    else:
        stored_name = f"original{ext}"
    target = directory / stored_name
    target.write_bytes(content)
    sha = hashlib.sha256(content).hexdigest()
    return {
        "kind": kind,
        "path": str(target.relative_to(data_dir())),
        "uri": f"file://{target.resolve()}",
        "size_bytes": len(content),
        "sha256": sha,
        "filename": base,
    }


def resolve_path(relative_path: str) -> Path:
    # Resolve a stored relative path safely inside DATA_DIR.
    if not relative_path:
        raise ValueError("Empty path")
    root = data_dir().resolve()
    candidate = (root / relative_path).resolve()
    if root not in candidate.parents and candidate != root:
        raise ValueError("Path escapes data directory")
    return candidate


def guess_mime(path: str) -> str:
    import mimetypes

    mime, _ = mimetypes.guess_type(path)
    return mime or "application/octet-stream"
