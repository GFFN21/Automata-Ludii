from __future__ import annotations

from copy import deepcopy
from typing import Any

from .artwork import asset_visual, project_cover
from .storage import read_asset


def _expand_assets(project: dict[str, Any]) -> list[dict[str, Any]]:
    expanded: list[dict[str, Any]] = []
    for item in project.get("assets", []) or []:
        if isinstance(item, str):
            record = read_asset(item)
            if record is None:
                continue
            asset = dict(record)
        elif isinstance(item, dict):
            asset = dict(item)
        else:
            continue
        asset["preview_svg"] = asset_visual(asset, project)
        expanded.append(asset)
    return expanded


def present_project(project: dict[str, Any]) -> dict[str, Any]:
    """Attach generated artwork so the static frontend can render it inline."""
    data = deepcopy(project)
    data["cover_svg"] = project_cover(project)
    data["assets"] = _expand_assets(project)
    return data


def present_projects(projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [present_project(project) for project in projects]
