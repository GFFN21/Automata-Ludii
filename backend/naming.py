from __future__ import annotations

import re
from hashlib import sha1

ADJECTIVES = [
    "Gilded",
    "Hollow",
    "Salt",
    "Velvet",
    "Drowned",
    "Copper",
    "Quiet",
    "Wild",
    "Broken",
    "Phoenix",
    "Amber",
    "Midnight",
]
NOUNS = [
    "Orchard",
    "Meridian",
    "Harbor",
    "Archive",
    "Canopy",
    "Crown",
    "Signal",
    "Garden",
    "Passage",
    "Table",
    "Lantern",
    "Atlas",
]

KEYWORD_TITLES = [
    ({"bee", "bees", "hive", "honey", "pollinate"}, "Hive & Harvest"),
    ({"ocean", "sea", "tide", "island", "lighthouse", "wave"}, "Tidebound"),
    ({"space", "planet", "orbit", "star", "moon", "galaxy", "rocket"}, "Orbital Wake"),
    ({"pirate", "ship", "sail", "treasure"}, "Salt & Ruin"),
    ({"garden", "flower", "plant", "bloom", "forest"}, "Everbloom"),
    ({"ghost", "haunt", "spirit", "afterlife"}, "The Quiet House"),
    ({"train", "rail", "locomotive"}, "Last Stop"),
    ({"food", "restaurant", "cook", "chef", "kitchen"}, "Table for None"),
    ({"dragon", "fantasy", "magic", "wizard"}, "Ash & Aether"),
    ({"heist", "thief", "robbery", "vault"}, "The Velvet Job"),
    ({"volcano", "sun", "fire", "ember"}, "Emberfall"),
    ({"museum", "artifact", "archaeology"}, "The Long Exhibit"),
    ({"weather", "storm", "cloud"}, "Gathering Storm"),
    ({"city", "urban", "neighborhood"}, "Common Ground"),
    ({"farm", "harvest", "crop"}, "First Frost"),
    ({"detective", "mystery", "murder"}, "A Small Alibi"),
    ({"dinosaur", "fossil", "prehistoric"}, "Deep Time"),
    ({"radio", "signal", "frequency"}, "Dead Air"),
]


def title_from_brief(brief: str) -> str:
    text = brief.lower()
    for keywords, title in KEYWORD_TITLES:
        if any(keyword in text for keyword in keywords):
            return title
    digest = int(sha1(brief.encode("utf-8")).hexdigest()[:8], 16)
    return f"The {ADJECTIVES[digest % len(ADJECTIVES)]} {NOUNS[(digest // 11) % len(NOUNS)]}"


def short_phrase(prompt: str, max_words: int = 6) -> str:
    cleaned = re.sub(r"^(please\s+)?(can you\s+)?(help me\s+)?", "", prompt.strip(), flags=re.I)
    cleaned = re.sub(r"[.!?]+$", "", cleaned)
    words = cleaned.split()
    if not words:
        return "Design update"
    phrase = " ".join(words[:max_words])
    if len(words) > max_words:
        phrase += "…"
    return phrase[0].upper() + phrase[1:]


def detect_asset_kind(prompt: str) -> tuple[str, str]:
    text = prompt.lower()
    if any(word in text for word in ("card", "deck", "hand")):
        return "Cards", "cards"
    if any(word in text for word in ("board", "map", "field", "grid", "track")):
        return "Game board", "board"
    if any(word in text for word in ("token", "meeple", "marker", "coin")):
        return "Tokens", "tokens"
    if any(word in text for word in ("tile", "hex")):
        return "Tiles", "tiles"
    return "Concept sheet", "board"
