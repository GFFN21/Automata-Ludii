from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha1

from .models import (
    Activity,
    Asset,
    CodeFile,
    Component,
    PlaytestMetric,
    PlaytestReport,
    Project,
    RulesSection,
    Ruleset,
)

PALETTES = [
    ("#6C4CF1", "#C4B5FD", "sun"),
    ("#4C6FFF", "#BFD0FF", "wave"),
    ("#A855F7", "#E9D5FF", "flora"),
    ("#7C3AED", "#C7B9FF", "orbit"),
    ("#5B5BD6", "#D6D3FF", "flora"),
]


def _ago(hours: int) -> str:
    return (datetime.now(UTC) - timedelta(hours=hours)).replace(microsecond=0).isoformat()


def _section(title: str, body: str) -> RulesSection:
    return RulesSection(title=title, body=body)


def _activity(agent: str, action: str, hours: int) -> Activity:
    return Activity(agent=agent, action=action, created_at=_ago(hours))


def _starter_code(project_name: str, genre: str) -> list[CodeFile]:
    simulate = f'''"""Monte Carlo balance harness for {project_name}."""
from dataclasses import dataclass, field
from random import Random

ROUND_LIMIT = 12


@dataclass
class Player:
    name: str
    score: int = 0
    resources: int = 3
    position: int = 0


@dataclass
class GameState:
    players: list[Player]
    round: int = 1
    log: list[str] = field(default_factory=list)

    def clone(self):
        return GameState(
            [Player(p.name, p.score, p.resources, p.position) for p in self.players],
            self.round,
            list(self.log),
        )


def legal_actions(state: GameState, player: Player) -> list[str]:
    actions = ["gather", "build", "trade"]
    if player.resources >= 2:
        actions.append("claim")
    if state.round >= 4:
        actions.append("score")
    return actions


def play(seed: int = 7) -> GameState:
    rng = Random(seed)
    state = GameState([Player("Player 1"), Player("Player 2")])

    while state.round <= ROUND_LIMIT:
        for player in state.players:
            action = rng.choice(legal_actions(state, player))
            if action == "gather":
                player.resources += rng.randint(1, 3)
            elif action == "build":
                player.resources -= 2
                player.score += rng.randint(2, 5)
            elif action == "trade":
                player.resources += 1
                player.score += 1
            elif action == "claim":
                player.resources -= 2
                player.position += 2
                player.score += 4
            elif action == "score":
                player.score += player.position + 1
        state.round += 1

    state.log.append("Final scores: " + ", ".join(f"{{p.name}} {{p.score}}" for p in state.players))
    return state


if __name__ == "__main__":
    results = [play(seed) for seed in range(1_000)]
    wins = sum(result.players[0].score > result.players[1].score for result in results)
    print(f"{project_name} · {genre} · first-player wins: {{wins / len(results):.1%}}")
'''
    balance = f'''"""Balance guardrails for {project_name}."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Target:
    label: str
    minimum: float
    maximum: float


TARGETS = [
    Target("first-player advantage", 0.45, 0.58),
    Target("average game length", 7.0, 11.0),
    Target("meaningful decisions / round", 3.0, 6.0),
]


def evaluate(sample: dict[str, float]) -> list[str]:
    flags = []
    for target in TARGETS:
        value = sample.get(target.label)
        if value is None:
            continue
        if not target.minimum <= value <= target.maximum:
            flags.append(
                f"{{target.label.title()}} is {{value:.2f}}; "
                f"target range is {{target.minimum:.2f}}–{{target.maximum:.2f}}."
            )
    return flags
'''
    components = f'''"""Component manifest for {project_name}.

Keep this in sync with the print export. All dimensions are millimetres.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Component:
    name: str
    quantity: int
    width: float
    height: float
    material: str = "350gsm board"


COMPONENTS = [
    Component("Rulebook", 1, 148, 210, "silk paper"),
    Component("Main board", 1, 420, 420, "greyboard"),
    Component("Player aid", 4, 105, 148, "350gsm board"),
    Component("Token sheet", 2, 148, 210, "2mm punchboard"),
]


def total_weight() -> float:
    return sum(c.quantity * c.width * c.height / 100 for c in COMPONENTS)
'''
    return [
        CodeFile(path="simulation/simulate.py", language="python", code=simulate, description="Monte Carlo playtest harness"),
        CodeFile(path="simulation/balance.py", language="python", code=balance, description="Balance checks and guardrails"),
        CodeFile(path="print/components.py", language="python", code=components, description="Print component manifest"),
    ]


def seed_projects() -> list[dict]:
    emberfall = Project(
        id="emberfall",
        name="Emberfall",
        tagline="Stoke a dying sun before the long night takes the valley.",
        description=(
            "A competitive worker-placement game where rival guilds spend the last "
            "warmth of a collapsing star. Place artisans, bank heat, and choose when "
            "to let the sun go dark."
        ),
        genre="Worker placement",
        players="2–4",
        playtime="60–90 min",
        age="12+",
        status="In development",
        stage="visuals",
        accent="#6C4CF1",
        secondary="#C4B5FD",
        motif="sun",
        progress={"ruleset": 100, "visuals": 64, "simulation": 38},
        created_at=_ago(124),
        updated_at=_ago(2),
        ruleset=Ruleset(
            version="0.8",
            logline="A dying sun, four rival guilds, and twelve turns to decide what is worth saving.",
            pillars=[
                "Every action is a trade between warmth and legacy.",
                "The shared sun track makes cooperation temporary and visible.",
                "The endgame begins when someone chooses to let the light die.",
            ],
            sections=[
                _section(
                    "The Pitch",
                    "The valley of Cinder has one sun left. Each guild tends a different craft, "
                    "but all of them need the Ember to survive the winter. Players place guild "
                    "workers on shared action spaces, gather heat, and convert it into legacy "
                    "before the sun collapses.\n\n"
                    "Emberfall is a tense, interactive worker-placement game for 2–4 players. "
                    "It rewards timing over engine-building: the same warmth that scores points "
                    "also keeps the shared clock moving toward the endgame.",
                ),
                _section(
                    "A Turn in Emberfall",
                    "A round has three phases. **Dawn:** refill action spaces and reveal the "
                    "round's weather token. **Work:** players alternate placing one worker until "
                    "all workers are placed. **Dusk:** resolve the Ember track and discard down "
                    "to five resources.\n\n"
                    "Each player begins with five guild workers and one Master Artisan. The "
                    "Master Artisan can use an occupied space by paying 2 heat, but may never "
                    "use the same space twice in a round.",
                ),
                _section(
                    "The Ember Track",
                    "The sun begins at 8 on the Ember track. Each player may spend heat during "
                    "Dusk to raise the track. At the end of every second round, the sun loses "
                    "heat equal to the number of players. When the track reaches 0, the Long "
                    "Night begins: finish the current round, then score.\n\n"
                    "Critically, any player may spend 3 legacy to lower the Ember track by 1. "
                    "This is the game's pressure valve — and its sharpest threat.",
                ),
                _section(
                    "Actions & Guilds",
                    "Action spaces are divided into three wings: The Forge, The Archive, and The "
                    "Market. Forge spaces generate heat; Archive spaces convert heat into legacy; "
                    "Market spaces trade one resource for another or manipulate turn order.\n\n"
                    "Each guild has a unique passive: the **Ashwrights** gain 1 heat whenever "
                    "another player uses the Forge; the **Luminaries** may peek at the next "
                    "weather token; the **Cinder Wardens** score 2 legacy when the sun drops; "
                    "the **Glass Singers** may place two workers on a single Archive space.",
                ),
                _section(
                    "Endgame & Scoring",
                    "When the Long Night begins, finish the current round. Score legacy, then "
                    "add 1 point per 3 unspent heat. The player with the most legacy becomes the "
                    "Keeper of the Last Light. Ties are broken by the player furthest from the "
                    "starting player, then by most remaining workers.\n\n"
                    "The designer's target is a 52–57% win rate for the starting player across "
                    "1,000 simulated games, and at least three viable strategies in the final round.",
                ),
            ],
            components=[
                Component(name="Main board", count="1", kind="420 × 420 mm", note="Folding greyboard"),
                Component(name="Guild boards", count="4", kind="148 × 105 mm", note="Double-layer"),
                Component(name="Guild workers", count="20", kind="Wooden", note="5 per player"),
                Component(name="Master artisans", count="4", kind="Wooden", note="Screen printed"),
                Component(name="Heat tokens", count="60", kind="Cardboard", note="1 / 3 denominations"),
                Component(name="Legacy dials", count="4", kind="Cardboard", note="0–40"),
                Component(name="Weather deck", count="24", kind="Cards", note="63 × 88 mm"),
                Component(name="Player aids", count="4", kind="Cards", note="A5 reference"),
                Component(name="Rulebook", count="1", kind="Booklet", note="A5, 24 pages"),
            ],
            win_condition="Most legacy after the Long Night. Ties go to the player furthest from the start player.",
            design_notes=[
                "Playtest 07: the shared Ember track creates the right amount of table talk.",
                "Watch the Glass Singers' double-placement — it is currently 4% above target.",
            ],
        ),
        assets=[
            Asset(
                id="asset_ember_cover",
                name="Emberfall — box cover",
                kind="Box cover",
                format="PNG + SVG",
                status="Final",
                accent="#6C4CF1",
                description="Hero illustration and logo lock-up for a 285 × 285 mm box.",
                motif="sun",
                created_at=_ago(18),
            ),
            Asset(
                id="asset_ember_board",
                name="Cinder Valley board",
                kind="Game board",
                format="PDF + SVG",
                status="In review",
                accent="#A78BFA",
                description="Four-player main board with action wings and the Ember track.",
                motif="board",
                created_at=_ago(26),
            ),
            Asset(
                id="asset_ember_cards",
                name="Weather deck",
                kind="Cards",
                format="PDF",
                status="Draft",
                accent="#4C1D95",
                description="24 weather cards. Print-ready with 3 mm bleed and crop marks.",
                motif="cards",
                created_at=_ago(31),
            ),
            Asset(
                id="asset_ember_tokens",
                name="Heat & legacy tokens",
                kind="Tokens",
                format="SVG",
                status="Final",
                accent="#8B5CF6",
                description="Two punchboard sheets with 60 heat and 40 legacy markers.",
                motif="tokens",
                created_at=_ago(42),
            ),
        ],
        code=_starter_code("Emberfall", "Worker placement"),
        playtests=[
            PlaytestReport(
                id="test_ember_01",
                created_at=_ago(21),
                simulations=1000,
                headline="Core loop is stable; first-player edge is 2.1% above target.",
                status="Needs tuning",
                metrics=[
                    PlaytestMetric(label="First-player win", value="58.1%", delta="+2.1 pts"),
                    PlaytestMetric(label="Avg. rounds", value="9.4", delta="On target"),
                    PlaytestMetric(label="Stalled turns", value="1.8%", delta="−0.7 pts"),
                    PlaytestMetric(label="Strategies used", value="4 / 5", delta="Good spread"),
                ],
                findings=[
                    "Glass Singers convert a strong opening into a 64.3% win rate. Reduce their double-placement to once per game.",
                    "Weather token 11 (Ash Storm) stalls the Market wing for an extra round. Consider a 1-heat release valve.",
                    "The Ember track reaches 0 in only 18% of games. Players are choosing to extend the game, which is healthy.",
                ],
                event_log=[
                    "R01 · Ashwrights claim the Forge; Ember 8 → 9.",
                    "R04 · Luminaries trigger a market sweep; 3 legacy gained.",
                    "R08 · First player buys turn order; Ember drops to 3.",
                    "R10 · Long Night begins. Glass Singers win with 27 legacy.",
                ],
            )
        ],
        activity=[
            _activity("Artificer", "Exported the Cinder Valley board to review", 2),
            _activity("Rulesmith", "Closed a loophole in the Master Artisan rule", 6),
            _activity("Playtester", "Ran 1,000 simulations · balance report ready", 21),
        ],
    )

    tidebound = Project(
        id="tidebound",
        name="Tidebound",
        tagline="Keep the lighthouse burning while the island disappears.",
        description=(
            "A fully cooperative tile-laying game for 1–4 players. Rebuild the coastline "
            "together, rescue villagers, and reach the lighthouse before the tide erases "
            "the last path home."
        ),
        genre="Co-op tile laying",
        players="1–4",
        playtime="40–55 min",
        age="10+",
        status="Ready for print",
        stage="simulation",
        accent="#4C6FFF",
        secondary="#A8C4FF",
        motif="wave",
        progress={"ruleset": 100, "visuals": 100, "simulation": 86},
        created_at=_ago(410),
        updated_at=_ago(9),
        ruleset=Ruleset(
            version="1.0",
            logline="The island is sinking. Build a path to the lighthouse before the tide claims it all.",
            pillars=[
                "The board is the clock: every tile placed changes what is reachable.",
                "Players must split attention between people and infrastructure.",
                "Failure is shared, but so is every clever rescue.",
            ],
            sections=[
                _section(
                    "The Island",
                    "Tidebound is played on a shared map assembled from 36 coast tiles. The "
                    "lighthouse sits at the centre. The sea starts at the outer edge; each round "
                    "it advances one ring inward. Players win by having every villager inside "
                    "the lighthouse courtyard when the final tide card is resolved.",
                ),
                _section(
                    "Turns & Tides",
                    "On your turn, place one coast tile, take one of its two actions, and draw the "
                    "next tide card. Tiles show a mix of paths, shallows, and cliffs. Paths must "
                    "connect orthogonally. A tile may never cover a villager.\n\n"
                    "After every player has taken a turn, advance the tide marker one ring and "
                    "resolve the icon on the current ring. Icons trigger floods, supply drops, or "
                    "stranded villagers.",
                ),
                _section(
                    "Rescue Actions",
                    "Actions are printed on tiles: **Bridge** (move one villager two spaces), "
                    "**Signal** (move the lighthouse beam and reveal a supply), **Reinforce** "
                    "(protect a tile from the next tide), and **Search** (draw from the salvage "
                    "deck).\n\n"
                    "Players may give resources to each other at any time, but may not trade "
                    "actions. A villager can carry one supply token.",
                ),
                _section(
                    "The Rising Tide",
                    "The tide deck has 18 cards in three acts. Each card advances the sea and "
                    "adds a complication. The back of each card shows the next act's icon, so "
                    "players can plan one turn ahead.\n\n"
                    "At the start of Act III, flip the lighthouse card. It offers a final choice: "
                    "burn the remaining supplies to hold the sea back for one round, or keep them "
                    "for the rescue score.",
                ),
                _section(
                    "Winning & Losing",
                    "Players win immediately when all six villagers stand in the courtyard and "
                    "the lighthouse is lit. Players lose if the lighthouse floods, if any villager "
                    "is cut off when the sea reaches their tile, or if the tide deck empties.\n\n"
                    "The score is the number of unspent supplies plus one point per reinforced "
                    "tile remaining.",
                ),
            ],
            components=[
                Component(name="Coast tiles", count="36", kind="Hexless squares", note="70 × 70 mm"),
                Component(name="Lighthouse board", count="1", kind="3D standee", note="120 mm tall"),
                Component(name="Villager meeples", count="6", kind="Wooden", note="Two colours"),
                Component(name="Tide deck", count="18", kind="Cards", note="63 × 88 mm"),
                Component(name="Salvage deck", count="32", kind="Cards", note="44 × 68 mm"),
                Component(name="Supply tokens", count="24", kind="Cardboard", note="1 / 3 denominations"),
                Component(name="Tide marker", count="1", kind="Wooden", note="Screen printed"),
                Component(name="Rulebook", count="1", kind="Booklet", note="A5, 20 pages"),
            ],
            win_condition="All six villagers are in the courtyard and the lighthouse is lit before the tide deck empties.",
            design_notes=[
                "Co-op win rate is stable at 58% across three player counts.",
                "The Act III choice consistently creates the best table moment.",
            ],
        ),
        assets=[
            Asset(
                id="asset_tide_cover",
                name="Tidebound — box cover",
                kind="Box cover",
                format="PNG + SVG",
                status="Final",
                accent="#4C6FFF",
                description="Lighthouse hero art with foiled title treatment.",
                motif="wave",
                created_at=_ago(72),
            ),
            Asset(
                id="asset_tide_tiles",
                name="Coast tile set",
                kind="Tiles",
                format="PDF + SVG",
                status="Final",
                accent="#A8C4FF",
                description="All 36 coast tiles across four punchboard sheets.",
                motif="tiles",
                created_at=_ago(79),
            ),
            Asset(
                id="asset_tide_cards",
                name="Tide & salvage decks",
                kind="Cards",
                format="PDF",
                status="Final",
                accent="#243B8F",
                description="50 cards with rounded corners and 3 mm bleed.",
                motif="cards",
                created_at=_ago(88),
            ),
            Asset(
                id="asset_tide_lighthouse",
                name="Lighthouse standee",
                kind="3D standee",
                format="AI + PDF",
                status="In review",
                accent="#8B7CF6",
                description="Double-sided 3D lighthouse with assembly slots.",
                motif="tokens",
                created_at=_ago(102),
            ),
        ],
        code=_starter_code("Tidebound", "Co-op tile laying"),
        playtests=[
            PlaytestReport(
                id="test_tide_01",
                created_at=_ago(12),
                simulations=2500,
                headline="Co-op balance is healthy across 1–4 players.",
                status="Passed",
                metrics=[
                    PlaytestMetric(label="Win rate", value="58.4%", delta="On target"),
                    PlaytestMetric(label="Avg. rounds", value="11.2", delta="−0.4"),
                    PlaytestMetric(label="Clutch wins", value="12.8%", delta="+3.2 pts"),
                    PlaytestMetric(label="Rules queries", value="0.7 / game", delta="−0.2"),
                ],
                findings=[
                    "Three-player games are the tightest experience at 55.9% wins; keep the current tide curve.",
                    "The Signal action is picked 41% of the time. Consider adding a second use to Search.",
                    "No simulation ended in an unreachable state. The tile adjacency rules are sound.",
                ],
                event_log=[
                    "R01 · Path built toward the east cove.",
                    "R05 · First flood; two villagers diverted.",
                    "R09 · Lighthouse lit early; supplies held for score.",
                    "R11 · Final rescue. Win with 7 points.",
                ],
            )
        ],
        activity=[
            _activity("Artificer", "Added crop marks to the lighthouse standee", 9),
            _activity("Playtester", "Ran 2,500 co-op simulations", 12),
            _activity("Lorekeeper", "Rewrote the Act III rules summary", 30),
        ],
    )

    static_bloom = Project(
        id="static-bloom",
        name="Static Bloom",
        tagline="A two-player duel where every card you play changes the field.",
        description=(
            "A compact card duel about cultivating strange flowers in a abandoned radio "
            "station. Draft frequencies, grow patterns across the table, and detonate "
            "them before your rival can harvest."
        ),
        genre="Card duel",
        players="2",
        playtime="20–30 min",
        age="12+",
        status="Prototype",
        stage="ruleset",
        accent="#A855F7",
        secondary="#E9D5FF",
        motif="flora",
        progress={"ruleset": 76, "visuals": 32, "simulation": 12},
        created_at=_ago(64),
        updated_at=_ago(28),
        ruleset=Ruleset(
            version="0.4",
            logline="Two gardeners, one abandoned frequency, and a field of flowers that should not exist.",
            pillars=[
                "Cards are both actions and terrain.",
                "The board grows from the centre, so reach is a resource.",
                "Every card can be harvested — timing is the whole game.",
            ],
            sections=[
                _section(
                    "The Signal",
                    "Static Bloom is a two-player duel played on a 5 × 5 grid. Each player "
                    "brings a 24-card frequency deck. The centre tile begins with a wildflower "
                    "seed. On your turn, play one card from hand, resolve its bloom, then draw "
                    "back to four cards.",
                ),
                _section(
                    "Growing the Field",
                    "Each card has a frequency, a growth pattern, and a harvest value. Place the "
                    "card face-up on an empty tile adjacent to any flower. Its pattern then blooms "
                    "one ring outward, flipping matching frequencies. Flowers only spread along "
                    "connected tiles of the same colour.\n\n"
                    "A card may be played facedown as a seed. Seeds cannot be harvested, but they "
                    "block your opponent's patterns.",
                ),
                _section(
                    "Harvesting",
                    "Harvesting is a free action once per turn: remove one flower from the field "
                    "and score its harvest value. The removed tile becomes dead soil. You may "
                    "harvest a flower you did not plant, but doing so gives the owner one static "
                    "charge.\n\n"
                    "Static charges can be spent to rotate a card, shift a seed, or draw an extra "
                    "card. They never expire.",
                ),
                _section(
                    "The Endgame",
                    "The game ends when the field is full, a player runs out of cards, or either "
                    "player reaches 20 bloom points. Score your harvested flowers total. The "
                    "player with the most points wins; ties go to the player with more flowers "
                    "still on the field.\n\n"
                    "The current prototype targets 22 minutes and a 48–54% first-player win rate.",
                ),
            ],
            components=[
                Component(name="Frequency decks", count="2", kind="Cards", note="24 cards each"),
                Component(name="Field tiles", count="25", kind="Cardboard", note="50 × 50 mm"),
                Component(name="Static charge tokens", count="20", kind="Cardboard", note="Double-sided"),
                Component(name="Bloom score pads", count="2", kind="Paper", note="Reusable"),
                Component(name="Rulebook", count="1", kind="Booklet", note="A6, 12 pages"),
            ],
            win_condition="Most bloom points when the field fills, a deck empties, or a player reaches 20 points.",
            design_notes=[
                "The seed blocking rule is not yet in the quick reference.",
                "Harvesting opponent flowers may be too punishing; test a 2-charge refund.",
            ],
        ),
        assets=[
            Asset(
                id="asset_bloom_cover",
                name="Static Bloom — cover study",
                kind="Box cover",
                format="SVG",
                status="Draft",
                accent="#A855F7",
                description="Early cover direction using radio waveform petals.",
                motif="flora",
                created_at=_ago(34),
            ),
            Asset(
                id="asset_bloom_cards",
                name="Frequency cards — wave 1",
                kind="Cards",
                format="SVG",
                status="Draft",
                accent="#C4B5FD",
                description="Twelve of twenty-four card faces, before icon pass.",
                motif="cards",
                created_at=_ago(37),
            ),
            Asset(
                id="asset_bloom_field",
                name="Field tile pattern",
                kind="Tiles",
                format="SVG",
                status="Sketch",
                accent="#A855F7",
                description="Five-by-five grid study with growth rings.",
                motif="tiles",
                created_at=_ago(45),
            ),
        ],
        code=_starter_code("Static Bloom", "Card duel"),
        playtests=[
            PlaytestReport(
                id="test_bloom_01",
                created_at=_ago(49),
                simulations=300,
                headline="First prototype shows a first-player edge and a narrow strategy spread.",
                status="Needs work",
                metrics=[
                    PlaytestMetric(label="First-player win", value="61.7%", delta="+9.7 pts"),
                    PlaytestMetric(label="Avg. minutes", value="26.4", delta="+4.4"),
                    PlaytestMetric(label="Cards unused", value="7.3", delta="High"),
                    PlaytestMetric(label="Strategies used", value="2 / 6", delta="Narrow"),
                ],
                findings=[
                    "The first player can lock the centre with a cheap seed. Give the second player a free rotation on their first turn.",
                    "Harvest value scales too slowly with card cost; 38% of games end with dead hands.",
                ],
                event_log=[
                    "R02 · Centre locked by Player 1.",
                    "R05 · First harvest; 3 bloom points.",
                    "R09 · Field reaches 19 tiles.",
                    "R12 · Player 1 wins 18–12.",
                ],
            )
        ],
        activity=[
            _activity("Rulesmith", "Drafted the seed-blocking variant", 28),
            _activity("Playtester", "Ran 300 early-rule simulations", 49),
            _activity("Lorekeeper", "Named the four frequency families", 54),
        ],
    )

    return [p.model_dump() for p in (emberfall, tidebound, static_bloom)]


def make_project_from_brief(
    brief: str,
    title: str | None = None,
    players_range: str = "",
    game_type: list[str] | None = None,
    medium: list[str] | None = None,
    style_mood: str = "",
    references: list[dict] | None = None,
) -> dict:
    clean = " ".join(brief.strip().split())
    if not clean and (players_range or game_type or medium or style_mood or references):
        parts = []
        if players_range:
            parts.append(f"Players: {players_range}.")
        if game_type:
            parts.append(f"Type: {', '.join(game_type)}.")
        if medium:
            parts.append(f"Medium: {', '.join(medium)}.")
        if style_mood:
            parts.append(f"Style & mood: {style_mood}.")
        if references:
            parts.append("References: " + "; ".join(f"{r.get('name','')} ({r.get('annotation','')})" for r in references) + ".")
        clean = " ".join(parts) or "A new board game concept."
    digest_source = clean + (title or "")
    digest = int(sha1(digest_source.encode("utf-8")).hexdigest()[:8], 16)
    accent, secondary, motif = PALETTES[digest % len(PALETTES)]
    if not title:
        title = "Untitled Game"
    genre = ", ".join(game_type) if game_type else "In discovery"
    players = players_range or "2–4"

    project = Project(
        id=f"project-{digest % 999999:06d}",
        name=title,
        tagline=clean[:118].rstrip(".") + ("." if not clean[:118].endswith(".") else ""),
        description=clean,
        genre=genre,
        players=players,
        playtime="45–60 min",
        age="12+",
        status="New concept",
        stage="ruleset",
        accent=accent,
        players_range=players_range or "",
        game_type=game_type or [],
        medium=medium or [],
        style_mood=style_mood or "",
        references=references or [],
        secondary=secondary,
        motif=motif,
        progress={"ruleset": 12, "visuals": 0, "simulation": 0},
        ruleset=Ruleset(
            version="0.1",
            logline=clean[:180],
            pillars=[
                "A clear central tension that can be explained in one sentence.",
                "Decisions that create table talk, not downtime.",
                "A physical experience that earns its table presence.",
            ],
            sections=[
                _section(
                    "Design Brief",
                    clean
                    + "\n\nThis is the starting brief. Use the design agent to turn it into a "
                    "playable ruleset, a visual direction, and a virtual playtest plan.",
                ),
                _section(
                    "Open Questions",
                    "What does a player do on their turn? What information is hidden? What "
                    "creates the first difficult decision? Which component carries the theme?",
                ),
            ],
            components=[
                Component(name="Prototype deck", count="TBD", kind="Cards", note="Discovery placeholder"),
                Component(name="Player aids", count="4", kind="Cards", note="Discovery placeholder"),
                Component(name="Main board", count="1", kind="Cardboard", note="Shape TBD"),
            ],
            win_condition="To be defined during the ruleset stage.",
            design_notes=["Created from a studio brief. No playtests yet."],
        ),
        assets=[],
        code=_starter_code(title, "In discovery"),
        playtests=[],
        activity=[
            Activity(agent="Lorekeeper", action="Opened a new concept from your brief"),
        ],
    )
    return project.model_dump()
