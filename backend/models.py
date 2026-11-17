from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


Focus = Literal["auto", "ruleset", "visuals", "simulation"]


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


class RulesSection(BaseModel):
    id: str = Field(default_factory=lambda: new_id("sec"))
    title: str
    body: str


class Component(BaseModel):
    name: str
    count: str
    kind: str
    note: str = ""


class Ruleset(BaseModel):
    version: str = "0.1"
    logline: str = ""
    pillars: list[str] = Field(default_factory=list)
    sections: list[RulesSection] = Field(default_factory=list)
    components: list[Component] = Field(default_factory=list)
    win_condition: str = ""
    design_notes: list[str] = Field(default_factory=list)


class AssetStorage(BaseModel):
    backend: str = "local"
    path: str = ""
    uri: str = ""
    size_bytes: int = 0
    sha256: str = ""


class AssetVariant(BaseModel):
    id: str = Field(default_factory=lambda: new_id("var"))
    kind: str = "original"
    format: str = ""
    mime: str = ""
    path: str = ""
    size_bytes: int = 0
    sha256: str = ""


class Asset(BaseModel):
    id: str = Field(default_factory=lambda: new_id("asset"))
    project_id: str = ""
    name: str
    kind: str = "image"
    format: str = "SVG"
    mime: str = ""
    status: str = "Draft"
    accent: str = "#6C4CF1"
    description: str = ""
    motif: str = "board"
    resolution: str = "300 dpi"
    folder: str = ""
    tags: list[str] = Field(default_factory=list)
    collections: list[str] = Field(default_factory=list)
    storage: AssetStorage | None = None
    variants: list[AssetVariant] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    references: list[str] = Field(default_factory=list)
    provenance: dict[str, Any] = Field(default_factory=dict)
    image: str = ""
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    schema_version: int = 1


class CodeFile(BaseModel):
    path: str
    language: str
    code: str
    description: str = ""


class PlaytestMetric(BaseModel):
    label: str
    value: str
    delta: str = ""


class PlaytestReport(BaseModel):
    id: str = Field(default_factory=lambda: new_id("test"))
    created_at: str = Field(default_factory=now_iso)
    simulations: int
    headline: str
    status: str = "Passed"
    metrics: list[PlaytestMetric] = Field(default_factory=list)
    findings: list[str] = Field(default_factory=list)
    event_log: list[str] = Field(default_factory=list)


class Activity(BaseModel):
    id: str = Field(default_factory=lambda: new_id("act"))
    agent: str
    action: str
    created_at: str = Field(default_factory=now_iso)


class Project(BaseModel):
    id: str
    name: str
    tagline: str
    description: str
    genre: str
    players: str
    playtime: str
    age: str
    status: str
    stage: Literal["ruleset", "visuals", "simulation"]
    accent: str
    secondary: str
    visibility: str = "private"
    players_range: str = ""
    game_type: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    model: dict = Field(default_factory=dict)
    flowchart: dict = Field(default_factory=dict)
    medium: list[str] = Field(default_factory=list)
    style_mood: str = ""
    references: list[dict] = Field(default_factory=list)
    motif: Literal["sun", "wave", "flora", "orbit"]
    progress: dict[str, int]
    ruleset: Ruleset
    assets: list[str] = Field(default_factory=list)
    schema_version: int = 1
    code: list[CodeFile] = Field(default_factory=list)
    playtests: list[PlaytestReport] = Field(default_factory=list)
    activity: list[Activity] = Field(default_factory=list)
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class AgentMessage(BaseModel):
    id: str = Field(default_factory=lambda: new_id("msg"))
    agent: str
    role: Literal["director", "specialist", "critic", "system"]
    content: str
    created_at: str = Field(default_factory=now_iso)


class AgentRun(BaseModel):
    id: str = Field(default_factory=lambda: new_id("run"))
    project_id: str
    prompt: str
    focus: Literal["ruleset", "visuals", "simulation"]
    status: Literal["complete", "failed"] = "complete"
    provider: str = "studio-demo"
    messages: list[AgentMessage] = Field(default_factory=list)
    summary: str = ""
    created_at: str = Field(default_factory=now_iso)
    duration_ms: int = 0


class RunRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    focus: Focus = "auto"


class Reference(BaseModel):
    name: str
    annotation: str = ""


class NewProjectRequest(BaseModel):
    brief: str = Field(default="", max_length=4000)
    title: str | None = None
    players_range: str = ""
    game_type: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    model: dict = Field(default_factory=dict)
    flowchart: dict = Field(default_factory=dict)
    medium: list[str] = Field(default_factory=list)
    style_mood: str = ""
    references: list[Reference] = Field(default_factory=list)


class ProviderConfig(BaseModel):
    provider: Literal["openai", "anthropic", "google", "local"] = "openai"
    model: str = "gpt-4.1-mini"
    base_url: str = ""
    api_key: str = ""


class PublicSettings(BaseModel):
    provider: str
    model: str
    base_url: str
    has_api_key: bool
    key_hint: str
    key_source: Literal["environment", "saved", "none"]
    demo_mode: bool
