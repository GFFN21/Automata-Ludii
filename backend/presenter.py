from __future__ import annotations

from copy import deepcopy
from typing import Any

from .artwork import asset_visual, project_cover


def present_project(project: dict[str, Any]) -> dict[str, Any]:
    """Attach generated artwork so the static frontend can render it inline."""
    data = deepcopy(project)
    data["cover_svg"] = project_cover(project)
    for asset in data.get("assets", []):
        asset["preview_svg"] = asset_visual(asset, project)
    return data


def present_projects(projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [present_project(project) for project in projects]
