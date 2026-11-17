from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from typing import Any

from .models import (
    Activity,
    AgentMessage,
    AgentRun,
    Asset,
    PlaytestReport,
    RulesSection,
    now_iso,
)
from .naming import detect_asset_kind, short_phrase
from .providers import ProviderError, generate, provider_label
from .simulation import simulate
from .store import store

AGENT_META = {
    "ruleset": {
        "agent": "Rulesmith",
        "role": "specialist",
        "verb": "stress-tested the rules surface",
    },
    "visuals": {
        "agent": "Artificer",
        "role": "specialist",
        "verb": "translated the brief into a visual artifact",
    },
    "simulation": {
        "agent": "Playtester",
        "role": "specialist",
        "verb": "ran the virtual playtest harness",
    },
}

SYSTEM_PROMPTS = {
    "ruleset": (
        "You are Rulesmith, a senior board game rules designer. You are precise, concise, "
        "and obsessed with edge cases. Given a physical board game project and a design "
        "request, write a practical rules proposal in Markdown. Include: design intent, "
        "trigger, resolution, exceptions, and one thing to test. Do not invent component "
        "counts that contradict the manifest. Keep it under 300 words."
    ),
    "visuals": (
        "You are Artificer, a board game art director and print production specialist. Given "
        "a project and a visual request, respond in Markdown with a concise art direction: "
        "composition, palette, typography, material/print notes, and one accessibility check. "
        "Keep it under 260 words. Do not claim to have generated a final image."
    ),
    "simulation": (
        "You are Playtester, a board game balance analyst. Given a project and a testing "
        "request, respond in Markdown with: hypothesis, simulation setup, the most important "
        "risk, and a concrete tuning recommendation. Be concise and quantitative where "
        "possible. Keep it under 260 words."
    ),
}


def resolve_focus(prompt: str, requested: str) -> str:
    if requested in {"ruleset", "visuals", "simulation"}:
        return requested
    text = prompt.lower()
    visual_words = {"art", "visual", "illustrat", "cover", "color", "palette", "logo", "card face", "layout"}
    simulation_words = {"playtest", "simulate", "simulation", "balance", "win rate", "test", "meta", "broken"}
    rules_words = {"rule", "mechanic", "turn", "action", "score", "combat", "solo", "draft", "endgame"}
    if any(word in text for word in visual_words):
        return "visuals"
    if any(word in text for word in simulation_words):
        return "simulation"
    if any(word in text for word in rules_words):
        return "ruleset"
    return "ruleset"


def _project_context(project: dict[str, Any]) -> str:
    rules = project.get("ruleset", {})
    sections = [
        {"title": section.get("title"), "excerpt": section.get("body", "")[:700]}
        for section in rules.get("sections", [])[-4:]
    ]
    recent_tests = [
        {
            "headline": report.get("headline"),
            "status": report.get("status"),
            "findings": report.get("findings", [])[:3],
        }
        for report in project.get("playtests", [])[:1]
    ]
    context = {
        "name": project.get("name"),
        "genre": project.get("genre"),
        "players": project.get("players"),
        "playtime": project.get("playtime"),
        "tagline": project.get("tagline"),
        "design_pillars": rules.get("pillars", []),
        "rules_version": rules.get("version"),
        "rules_sections": sections,
        "components": [item.get("name") for item in rules.get("components", [])],
        "latest_playtest": recent_tests,
        "asset_count": len(project.get("assets", [])),
        "stage": project.get("stage"),
    }
    return json.dumps(context, ensure_ascii=False, indent=2)[:11_000]


def _demo_rules_body(prompt: str) -> str:
    return (
        f"**Design intent.** {prompt}\n\n"
        "**Trigger.** Resolve this when the active player commits the relevant action during "
        "the Work phase, before any end-of-round effects.\n\n"
        "**Resolution.** Apply the change once, then mark the affected component with a "
        "temporary status token. If two effects share timing, resolve the active player's "
        "effect first, then proceed clockwise.\n\n"
        "**Constraint.** This variant must not remove a player's ability to score on their "
        "final turn, and it must preserve the shared tension named in the design pillars.\n\n"
        "**Playtest note.** Test it with three or more players and compare the endgame trigger "
        "rate against the current baseline before making it permanent."
    )


def _demo_visual_brief(prompt: str, project: dict[str, Any]) -> str:
    return (
        f"**Direction.** {prompt}\n\n"
        "**Composition.** Build the focal point on the rule of thirds, with a strong silhouette "
        "readable at 30 mm. Reserve the top-left for player-facing iconography and keep the "
        "bottom 12 mm free of critical information.\n\n"
        f"**Palette.** Anchor in {project.get('accent')} with {project.get('secondary')} as the "
        "signal colour; keep at least one neutral at 85% paper white for print contrast.\n\n"
        "**Production.** Use a 3 mm bleed, 6 mm safe margin, CMYK conversion, and 300 dpi for "
        "raster elements. Verify the design in greyscale before export."
    )


def _demo_critic(focus: str, project: dict[str, Any]) -> str:
    if focus == "ruleset":
        return (
            "I checked the proposal against the current rules surface. The timing window is "
            "clear, but the component manifest does not yet include a status token. Either use "
            "an existing marker or add the token in the next print pass. I would not lock this "
            "rule until it has been exercised in at least 300 simulated matches."
        )
    if focus == "visuals":
        return (
            "The art direction is coherent with the existing palette. The main risk is "
            "legibility on small cards: the signal colour needs a darker outline at 8 pt and "
            "below. I’ve flagged the concept sheet for a greyscale and colour-blind review."
        )
    latest = project.get("playtests", [{}])[0] if project.get("playtests") else {}
    headline = latest.get("headline", "The current sample is still small.")
    return (
        f"The simulation result is directionally useful, but it is still an abstraction. "
        f"Current baseline: {headline} Treat the recommendation as a test hypothesis, not a "
        "final balance decision. The next run should isolate one variable at a time."
    )


async def _provider_note(project: dict[str, Any], focus: str, prompt: str) -> tuple[str | None, str]:
    config = store.get_runtime_config()
    if not config.api_key and config.provider != "local":
        return None, "studio-demo"
    try:
        text = await generate(
            config,
            SYSTEM_PROMPTS[focus],
            f"PROJECT CONTEXT\n{_project_context(project)}\n\nREQUEST\n{prompt}",
        )
        return text[:5000], provider_label(config)
    except ProviderError as exc:
        return None, f"studio-demo · provider fallback: {str(exc)[:180]}"


def _message(agent: str, role: str, content: str) -> AgentMessage:
    return AgentMessage(agent=agent, role=role, content=content, created_at=now_iso())


async def run_agent(project_id: str, prompt: str, requested_focus: str) -> tuple[dict[str, Any], dict[str, Any]]:
    started = time.perf_counter()
    project = store.get_project(project_id)
    if not project:
        raise KeyError(project_id)

    focus = resolve_focus(prompt, requested_focus)
    meta = AGENT_META[focus]
    provider_note, provider_name = await _provider_note(project, focus, prompt)
    messages: list[AgentMessage] = [
        _message(
            "Director",
            "director",
            f"Focus set to **{focus.title()}**. I pulled the current ruleset, component "
            f"manifest, visual library, and latest playtest into context. {meta['agent']} is "
            "taking the first pass; I’ll check the output before it lands in the project.",
        )
    ]

    detail = provider_note or {
        "ruleset": _demo_rules_body(prompt),
        "visuals": _demo_visual_brief(prompt, project),
        "simulation": (
            f"**Hypothesis.** {prompt}\n\n"
            "**Setup.** Abstracted Monte Carlo model using the current player count, action "
            "economy, and scoring targets. The run tests turn-order advantage, strategy spread, "
            "and stalled-state frequency.\n\n"
            "**Risk.** The abstraction cannot model table negotiation or kingmaking. Read the "
            "output as a first-pass balance signal."
        ),
    }[focus]

    messages.append(_message(meta["agent"], "specialist", detail))
    if provider_note is None and provider_name.startswith("studio-demo · provider fallback"):
        messages.append(
            _message(
                "System",
                "system",
                f"The live provider was unavailable, so the studio used its local deterministic "
                f"framework. {provider_name.split(':', 1)[-1].strip()}",
            )
        )

    rules = project.setdefault("ruleset", {})
    progress = project.setdefault("progress", {"ruleset": 0, "visuals": 0, "simulation": 0})
    project["stage"] = focus
    status_line = ""

    if focus == "ruleset":
        title = short_phrase(prompt, 6)
        rules.setdefault("sections", []).append(
            RulesSection(
                title=f"Studio note · {title}",
                body=provider_note or _demo_rules_body(prompt),
            ).model_dump()
        )
        rules.setdefault("design_notes", []).append(
            f"Open question from {datetime.now(UTC):%d %b}: {prompt[:220]}"
        )
        progress["ruleset"] = min(100, progress.get("ruleset", 0) + 12)
        status_line = "Rules draft updated with one reviewed design note."
        if project.get("status") == "New concept":
            project["status"] = "In development"

    elif focus == "visuals":
        kind, motif = detect_asset_kind(prompt)
        asset_name = f"{short_phrase(prompt, 4)} · {kind.lower()}"
        asset = Asset(
            name=asset_name,
            kind=kind,
            format="SVG + PDF",
            status="Draft",
            accent=project.get("accent", "#6C4CF1"),
            description=(provider_note or _demo_visual_brief(prompt, project))[:600],
            motif=motif,
            resolution="300 dpi",
        )
        project.setdefault("assets", []).insert(0, asset.model_dump())
        progress["visuals"] = min(100, progress.get("visuals", 0) + 14)
        status_line = f"Added a new {kind.lower()} concept to the asset library."
        if project.get("status") in {"New concept", "Prototype"}:
            project["status"] = "In development"

    else:
        report = simulate(project, 800, prompt)
        project.setdefault("playtests", []).insert(0, report.model_dump())
        progress["simulation"] = min(100, progress.get("simulation", 0) + 18)
        status_line = (
            f"Completed {report.simulations:,} simulated matches. Result: {report.status.lower()}."
        )
        if project.get("status") == "New concept":
            project["status"] = "Playtesting"

    critic_text = _demo_critic(focus, project)
    if provider_note:
        critic_text = (
            "I reviewed the live-provider draft against the project manifest. The proposal is "
            "coherent, but treat the recommendation as a hypothesis until it is reflected in the "
            "rules document and exercised by the simulation harness. " + critic_text
        )
    messages.append(_message("Critic", "critic", critic_text))

    if focus == "visuals":
        project["stage"] = "visuals"
    project.setdefault("activity", []).insert(
        0,
        Activity(
            agent=meta["agent"],
            action=status_line,
            created_at=now_iso(),
        ).model_dump(),
    )
    project["activity"] = project["activity"][:12]
    project["updated_at"] = now_iso()
    store.update_project(project_id, project)

    run = AgentRun(
        project_id=project_id,
        prompt=prompt,
        focus=focus,
        provider=provider_name,
        messages=messages,
        summary=status_line,
        duration_ms=int((time.perf_counter() - started) * 1000),
    )
    stored_run = store.add_run(project_id, run.model_dump())
    return stored_run, project


def framework_manifest() -> dict[str, Any]:
    return {
        "name": "Tablecraft Agent Runtime",
        "version": "0.3.0",
        "orchestration": "director → specialist → critic",
        "stages": [
            {
                "id": "ruleset",
                "label": "Ruleset",
                "agent": "Rulesmith",
                "description": "Turns a brief into testable procedures, edge cases, and component constraints.",
                "tools": ["rules_writer", "edge_case_checker", "component_manifest"],
            },
            {
                "id": "visuals",
                "label": "Visuals",
                "agent": "Artificer",
                "description": "Builds print-aware art direction, asset specs, and accessibility checks.",
                "tools": ["art_direction", "asset_spec", "print_check"],
            },
            {
                "id": "simulation",
                "label": "Simulation",
                "agent": "Playtester",
                "description": "Runs virtual matches, evaluates balance targets, and surfaces tuning hypotheses.",
                "tools": ["monte_carlo", "balance_guard", "playtest_report"],
            },
        ],
        "critic": "Critic",
        "provider_ready": store.public_settings().has_api_key,
        "demo_mode": store.public_settings().demo_mode,
    }
