from __future__ import annotations

import base64
import html
import re
from datetime import UTC, datetime

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def compact_html(markup: str) -> str:
    """Collapse inter-tag whitespace so Streamlit's markdown parser never
    mistakes indented HTML fragments for code blocks."""
    return re.sub(r">\s+<", "><", markup.strip())


def svg_image(svg: str, css_class: str, alt: str) -> str:
    """Streamlit sanitizes inline SVG away. A data-URI image survives while
    keeping the artwork crisp at any size."""
    encoded = base64.b64encode(compact_html(svg).encode("utf-8")).decode("ascii")
    return (
        f'<img class="{html.escape(css_class)}" '
        f'src="data:image/svg+xml;base64,{encoded}" '
        f'alt="{html.escape(alt)}" loading="lazy"/>'
    )


def _color(value: str | None, fallback: str) -> str:
    return value if value and HEX.match(value) else fallback


def _title_lines(name: str, max_chars: int = 15) -> list[str]:
    words = name.upper().split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines[:2]


def _motif(motif: str, accent: str, secondary: str) -> str:
    if motif == "sun":
        rays = "".join(
            f'<line x1="448" y1="102" x2="{448 + 160 * __import__("math").cos(i * 0.3927)}" '
            f'y2="{102 + 160 * __import__("math").sin(i * 0.3927)}" />'
            for i in range(16)
        )
        return f"""
        <g opacity=".95">
          <circle cx="448" cy="102" r="148" fill="{secondary}" opacity=".08"/>
          <circle cx="448" cy="102" r="105" fill="{accent}" opacity=".92"/>
          <circle cx="448" cy="102" r="65" fill="#14111B" opacity=".82"/>
          <g stroke="{secondary}" stroke-width="2" opacity=".5">{rays}</g>
          <circle cx="448" cy="102" r="115" fill="none" stroke="{secondary}" stroke-width="1" opacity=".45"/>
        </g>
        <path d="M0 268 C95 220 162 245 240 224 S390 188 600 238 V320 H0Z" fill="{accent}" opacity=".2"/>
        <path d="M0 290 C130 252 195 280 300 252 S470 228 600 268 V320 H0Z" fill="{accent}" opacity=".34"/>
        """
    if motif == "wave":
        return f"""
        <g>
          <circle cx="432" cy="92" r="70" fill="{secondary}" opacity=".16"/>
          <circle cx="432" cy="92" r="42" fill="{secondary}" opacity=".4"/>
          <path d="M260 128 C300 96 350 96 390 128" fill="none" stroke="{secondary}" stroke-width="2" opacity=".6"/>
          <path d="M0 232 C80 192 130 264 206 228 S330 186 410 226 S520 260 600 208 V320 H0Z" fill="{accent}" opacity=".24"/>
          <path d="M0 260 C75 230 135 292 218 254 S348 218 430 256 S535 286 600 246 V320 H0Z" fill="{accent}" opacity=".45"/>
          <path d="M0 292 C92 264 150 314 240 284 S385 254 470 288 S550 312 600 286 V320 H0Z" fill="{secondary}" opacity=".16"/>
          <g fill="{secondary}" opacity=".55">
            <circle cx="331" cy="160" r="2"/><circle cx="369" cy="182" r="1.4"/>
            <circle cx="522" cy="118" r="1.6"/><circle cx="198" cy="126" r="1.3"/>
          </g>
        </g>
        """
    if motif == "flora":
        petals = "".join(
            f'<ellipse cx="0" cy="-45" rx="16" ry="58" fill="{accent if i % 2 == 0 else secondary}" '
            f'opacity="{0.84 if i % 2 == 0 else 0.48}" transform="rotate({i * 30})"/>'
            for i in range(12)
        )
        return f"""
        <g transform="translate(436 118)">
          <circle r="145" fill="{secondary}" opacity=".05"/>
          <circle r="112" fill="none" stroke="{secondary}" stroke-width="1" opacity=".25"/>
          {petals}
          <circle r="35" fill="#14111B"/>
          <circle r="19" fill="{secondary}" opacity=".85"/>
          <circle r="6" fill="#14111B"/>
        </g>
        <path d="M304 245 C356 190 310 144 352 82" fill="none" stroke="{secondary}" stroke-width="2" opacity=".4"/>
        <circle cx="352" cy="82" r="4" fill="{secondary}" opacity=".8"/>
        """
    return f"""
    <g transform="translate(432 112)" fill="none">
      <circle r="142" fill="{secondary}" opacity=".06"/>
      <ellipse rx="122" ry="58" stroke="{secondary}" stroke-width="1.4" opacity=".38" transform="rotate(-24)"/>
      <ellipse rx="100" ry="43" stroke="{accent}" stroke-width="8" opacity=".72" transform="rotate(18)"/>
      <ellipse rx="64" ry="27" stroke="{secondary}" stroke-width="1.3" opacity=".58" transform="rotate(52)"/>
      <circle cx="-96" cy="24" r="9" fill="{accent}"/>
      <circle cx="74" cy="-36" r="4" fill="{secondary}"/>
      <circle cx="91" cy="45" r="6" fill="{secondary}" opacity=".72"/>
      <circle r="20" fill="{accent}" opacity=".94"/>
    </g>
    """


def project_cover(project: dict, css_class: str = "project-cover") -> str:
    name = html.escape(project.get("name", "Untitled"))
    accent = _color(project.get("accent"), "#6C4CF1")
    secondary = _color(project.get("secondary"), "#C4B5FD")
    motif = project.get("motif", "sun")
    project_id = re.sub(r"[^a-zA-Z0-9_-]", "", project.get("id", "project"))
    lines = _title_lines(name, 16 if len(name) > 12 else 18)
    size = 58 if len(lines[0]) <= 10 else 47 if len(lines[0]) <= 14 else 38
    tspans = "".join(
        f'<tspan x="36" dy="{0 if index == 0 else size + 4}">{line}</tspan>'
        for index, line in enumerate(lines)
    )
    title_y = 255 - (len(lines) - 1) * (size + 4)
    genre = html.escape(project.get("genre", "Board game").upper())
    players = html.escape(str(project.get("players", "")))
    return f"""
    <svg xmlns="http://www.w3.org/2000/svg" class="{css_class}" viewBox="0 0 600 320" role="img" aria-label="{name} cover artwork" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="bg-{project_id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#14111B"/>
          <stop offset=".58" stop-color="#191524"/>
          <stop offset="1" stop-color="{accent}" stop-opacity=".52"/>
        </linearGradient>
        <pattern id="dots-{project_id}" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="1.2" fill="{secondary}" opacity=".1"/>
        </pattern>
        <linearGradient id="fade-{project_id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset=".42" stop-color="#100D17" stop-opacity="0"/>
          <stop offset="1" stop-color="#100D17" stop-opacity=".92"/>
        </linearGradient>
        <linearGradient id="scrim-{project_id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#100D17" stop-opacity=".82"/>
          <stop offset=".55" stop-color="#100D17" stop-opacity=".34"/>
          <stop offset="1" stop-color="#100D17" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="600" height="320" fill="url(#bg-{project_id})"/>
      <rect width="600" height="320" fill="url(#dots-{project_id})"/>
      {_motif(motif, accent, secondary)}
      <rect width="600" height="320" fill="url(#fade-{project_id})"/>
      <rect width="600" height="86" fill="url(#scrim-{project_id})"/>
      <rect x="22" y="22" width="556" height="276" rx="10" fill="none" stroke="{secondary}" stroke-opacity=".2"/>
      <g font-family="DM Sans, Arial, sans-serif" fill="{secondary}" opacity=".7" font-size="9" letter-spacing="1.8">
        <text x="36" y="48">TABLECRAFT · PROTOTYPE</text>
        <text x="564" y="48" text-anchor="end">{players} PLAYERS</text>
      </g>
      <g font-family="Instrument Serif, Georgia, serif" fill="#FFFFFF">
        <text x="36" y="{title_y}" font-size="{size}" letter-spacing="1">{tspans}</text>
      </g>
      <g font-family="DM Sans, Arial, sans-serif" fill="{secondary}" font-size="9" letter-spacing="1.5">
        <text x="36" y="288">{genre}</text>
        <text x="564" y="288" text-anchor="end">SERIES 01</text>
      </g>
    </svg>
    """


def asset_visual(asset, project: dict, css_class: str = "asset-svg") -> str:
    if isinstance(asset, str):
        # treat as asset id
        from .storage import read_asset
        record = read_asset(asset)
        if isinstance(record, dict):
            asset = record
        else:
            asset = {"name": asset, "kind": "Concept sheet", "accent": None}
    if not isinstance(asset, dict):
        asset = {"name": str(asset), "kind": "Concept sheet", "accent": None}
    accent = _color(asset.get("accent"), _color(project.get("accent"), "#6C4CF1"))
    secondary = _color(project.get("secondary"), "#C4B5FD")
    kind = asset.get("kind", "Concept sheet")
    name = html.escape(asset.get("name", "Untitled asset"))
    motif = asset.get("motif", "board")
    kind_lower = kind.lower()

    if "board" in kind_lower:
        cells = "".join(
            f'<rect x="{76 + col * 48}" y="{58 + row * 38}" width="34" height="26" rx="5" '
            f'fill="{accent if (row + col) % 3 == 0 else "#FFFFFF"}" '
            f'stroke="#211C2E" stroke-width="1" opacity="{0.18 if (row + col) % 3 == 0 else 0.55}"/>'
            for row in range(4)
            for col in range(5)
        )
        path = (
            f'<path d="M93 71 H126 V109 H174 V147 H222 V185 H258" fill="none" '
            f'stroke="{accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
        )
        nodes = "".join(
            f'<circle cx="{x}" cy="{y}" r="6" fill="{accent}" stroke="#FFFFFF" stroke-width="2"/>'
            for x, y in [(93, 71), (126, 109), (174, 147), (258, 185)]
        )
        return f"""
        <svg xmlns="http://www.w3.org/2000/svg" class="{css_class}" viewBox="0 0 480 270" role="img" aria-label="{name}">
          <rect width="480" height="270" rx="10" fill="#F1F0F6"/>
          <rect x="20" y="20" width="440" height="230" rx="8" fill="#FFFFFF" stroke="#DDD9E7"/>
          <text x="38" y="42" font-family="DM Sans, Arial" font-size="9" letter-spacing="1.4" fill="#5F5A6E">{html.escape(name.upper()[:42])}</text>
          {cells}{path}{nodes}
          <g font-family="DM Sans, Arial" font-size="6.5" fill="#5F5A6E">
            <text x="76" y="235">THE FORGE</text><text x="215" y="235">THE ARCHIVE</text><text x="370" y="235">THE MARKET</text>
          </g>
          <circle cx="362" cy="100" r="34" fill="{accent}" opacity=".14"/>
          <circle cx="362" cy="100" r="17" fill="{accent}" opacity=".72"/>
          <text x="362" y="158" text-anchor="middle" font-family="DM Sans, Arial" font-size="7" letter-spacing="1" fill="#5F5A6E">EMBER TRACK</text>
        </svg>
        """

    if "card" in kind_lower:
        return f"""
        <svg xmlns="http://www.w3.org/2000/svg" class="{css_class}" viewBox="0 0 480 270" role="img" aria-label="{name}">
          <rect width="480" height="270" rx="10" fill="#16121F"/>
          <rect width="480" height="270" rx="10" fill="url(#none)" opacity="0"/>
          <g transform="translate(240 135)">
            <g transform="rotate(-13) translate(-100 -4)">
              <rect x="-38" y="-68" width="76" height="112" rx="5" fill="{secondary}" opacity=".68"/>
              <rect x="-32" y="-62" width="64" height="100" rx="3" fill="none" stroke="#16121F" stroke-opacity=".3"/>
            </g>
            <g transform="rotate(12) translate(98 8)">
              <rect x="-38" y="-68" width="76" height="112" rx="5" fill="{accent}" opacity=".76"/>
              <circle cx="0" cy="-17" r="20" fill="none" stroke="#FFFFFF" stroke-opacity=".7"/>
            </g>
            <g>
              <rect x="-58" y="-80" width="116" height="164" rx="7" fill="#FFFFFF" stroke="#14111B" stroke-width="2"/>
              <rect x="-47" y="-68" width="94" height="10" fill="{accent}" opacity=".85"/>
              <circle cx="0" cy="0" r="32" fill="{accent}" opacity=".14"/>
              <circle cx="0" cy="0" r="21" fill="none" stroke="{accent}" stroke-width="2"/>
              <path d="M-12 0 H12 M0 -12 V12" stroke="{accent}" stroke-width="2"/>
              <text x="0" y="67" text-anchor="middle" font-family="DM Sans, Arial" font-size="6.5" letter-spacing="1.2" fill="#5F5A6E">{html.escape(name.upper()[:28])}</text>
            </g>
          </g>
          <text x="24" y="248" font-family="DM Sans, Arial" font-size="8" letter-spacing="1.2" fill="{secondary}" opacity=".7">PRINT PROOF · 63 × 88 MM</text>
        </svg>
        """

    if "token" in kind_lower or "standee" in kind_lower:
        tokens = "".join(
            f'<g transform="translate({155 + (i % 3) * 85} {96 + (i // 3) * 82})">'
            f'<circle r="31" fill="{accent if i % 2 == 0 else secondary}" opacity="{0.95 if i % 2 == 0 else 0.78}"/>'
            f'<circle r="24" fill="none" stroke="#14111B" stroke-width="1.4" opacity=".45"/>'
            f'<circle r="8" fill="#14111B" opacity=".6"/></g>'
            for i in range(6)
        )
        return f"""
        <svg xmlns="http://www.w3.org/2000/svg" class="{css_class}" viewBox="0 0 480 270" role="img" aria-label="{name}">
          <rect width="480" height="270" rx="10" fill="#F1F0F6"/>
          <rect x="18" y="18" width="444" height="234" rx="8" fill="#FFFFFF" stroke="#DDD9E7"/>
          {tokens}
          <text x="28" y="242" font-family="DM Sans, Arial" font-size="8" letter-spacing="1.1" fill="#5F5A6E">{html.escape(name.upper()[:44])}</text>
          <text x="452" y="242" text-anchor="end" font-family="DM Sans, Arial" font-size="8" letter-spacing="1.1" fill="#5F5A6E">2MM PUNCHBOARD</text>
        </svg>
        """

    if "tile" in kind_lower:
        tiles = "".join(
            f'<g transform="translate({80 + (i % 4) * 82} {52 + (i // 4) * 52})">'
            f'<rect width="74" height="44" rx="5" fill="{accent if i % 4 == 0 else "#FFFFFF"}" '
            f'stroke="#211C2E" stroke-opacity=".35"/>'
            f'<path d="M8 22 H66" stroke="{secondary if i % 4 == 0 else accent}" stroke-width="3" opacity=".8"/>'
            f'<circle cx="16" cy="13" r="4" fill="{secondary if i % 4 == 0 else accent}" opacity=".7"/></g>'
            for i in range(8)
        )
        return f"""
        <svg xmlns="http://www.w3.org/2000/svg" class="{css_class}" viewBox="0 0 480 270" role="img" aria-label="{name}">
          <rect width="480" height="270" rx="10" fill="#F1F0F6"/>
          <rect x="18" y="18" width="444" height="234" rx="8" fill="#FFFFFF" stroke="#DDD9E7"/>
          {tiles}
          <text x="28" y="242" font-family="DM Sans, Arial" font-size="8" letter-spacing="1.1" fill="#5F5A6E">{html.escape(name.upper()[:44])}</text>
        </svg>
        """

    # Box covers and concept sheets
    return f"""
    <svg xmlns="http://www.w3.org/2000/svg" class="{css_class}" viewBox="0 0 480 270" role="img" aria-label="{name}">
      <defs>
        <linearGradient id="assetbg-{re.sub(r'[^a-zA-Z0-9]', '', asset.get('id', 'a'))}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#14111B"/>
          <stop offset="1" stop-color="{accent}" stop-opacity=".55"/>
        </linearGradient>
      </defs>
      <rect width="480" height="270" rx="10" fill="url(#assetbg-{re.sub(r'[^a-zA-Z0-9]', '', asset.get('id', 'a'))})"/>
      <g opacity=".9">{_motif(motif, accent, secondary)}</g>
      <rect x="18" y="18" width="444" height="234" rx="8" fill="none" stroke="{secondary}" stroke-opacity=".24"/>
      <text x="32" y="44" font-family="DM Sans, Arial" font-size="8" letter-spacing="1.6" fill="{secondary}">CONCEPT PROOF</text>
      <text x="32" y="222" font-family="Instrument Serif, Georgia" font-size="28" fill="#FFFFFF">{name[:34]}</text>
      <text x="32" y="242" font-family="DM Sans, Arial" font-size="7.5" letter-spacing="1.2" fill="{secondary}" opacity=".8">{kind.upper()} · {html.escape(asset.get('format', 'SVG'))}</text>
    </svg>
    """


def project_cover_image(project: dict, css_class: str = "project-cover") -> str:
    alt = f"{project.get('name', 'Untitled')} cover artwork"
    return svg_image(project_cover(project, css_class=css_class), css_class, alt)


def asset_image(asset: dict, project: dict, css_class: str = "asset-svg") -> str:
    alt = asset.get("name", "Board game asset")
    return svg_image(asset_visual(asset, project, css_class=css_class), css_class, alt)


def status_class(status: str) -> str:
    lowered = status.lower()
    if any(word in lowered for word in ("print", "final", "passed", "ready")):
        return "status-good"
    if any(word in lowered for word in ("review", "tuning", "development", "progress")):
        return "status-warm"
    if any(word in lowered for word in ("draft", "sketch", "new", "prototype", "work")):
        return "status-cool"
    return "status-neutral"


def relative_time(value: str | None) -> str:
    if not value:
        return "recently"
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        delta = datetime.now(UTC) - moment
    except ValueError:
        return "recently"
    seconds = max(0, int(delta.total_seconds()))
    if seconds < 90:
        return "just now"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h ago"
    days = hours // 24
    if days < 14:
        return f"{days}d ago"
    weeks = days // 7
    return f"{weeks}w ago"


def progress_bar(value: int, color: str = "#6C4CF1", css_class: str = "") -> str:
    value = max(0, min(100, int(value)))
    return (
        f'<div class="progress-track {css_class}"><span style="width:{value}%;'
        f'background:{_color(color, "#6C4CF1")}"></span></div>'
    )


def strip_markdown(text: str, limit: int = 260) -> str:
    plain = re.sub(r"[*_`#>]", "", text)
    plain = re.sub(r"\s+", " ", plain).strip()
    return plain if len(plain) <= limit else plain[: limit - 1].rsplit(" ", 1)[0] + "…"


def markdown_to_html(text: str) -> str:
    """Small, safe markdown subset used inside custom HTML cards."""
    escaped = html.escape(text.strip())
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped, flags=re.S)
    escaped = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<em>\1</em>", escaped)
    escaped = re.sub(r"`([^`\n]+)`", r"<code>\1</code>", escaped)

    blocks = re.split(r"\n\s*\n", escaped)
    output: list[str] = []
    for block in blocks:
        stripped = block.strip()
        if not stripped:
            continue
        heading = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading:
            level = min(4, len(heading.group(1)) + 1)
            output.append(f"<h{level}>{heading.group(2)}</h{level}>")
            continue
        lines = stripped.splitlines()
        if all(line.strip().startswith(("- ", "* ")) for line in lines if line.strip()):
            items = "".join(f"<li>{line.strip()[2:]}</li>" for line in lines if line.strip())
            output.append(f"<ul>{items}</ul>")
            continue
        output.append("<p>" + "<br>".join(lines) + "</p>")
    return "".join(output)
