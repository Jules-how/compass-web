#!/usr/bin/env python3
"""Load trade-specific lists from switchflow-offer/verticals/{trade}.md.

Offer-wide engine rules stay in the Python jobs. Anything that changes by
vertical (specialties, shop-sign tails, identity, trade noun, aliases) is
owned by that markdown file.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

VERTICALS_DIR = Path(__file__).resolve().parent.parent / "switchflow-offer" / "verticals"

_ALIAS_RE = re.compile(r"^-\s*`([^`]+)`\s*->\s*`([^`]+)`\s*$")


@dataclass(frozen=True)
class VerticalSpec:
    trade: str
    path: Path
    trade_flags: tuple[str, ...]
    trade_nouns: tuple[str, ...]
    identity: str
    specialties: tuple[str, ...]
    shop_sign_words: tuple[str, ...]
    shop_sign_phrases: tuple[str, ...]
    aliases: tuple[tuple[str, str], ...]
    slogans: tuple[str, ...]


def _backticks(text: str) -> list[str]:
    seen: list[str] = []
    for hit in re.findall(r"`([^`]+)`", text):
        phrase = hit.strip()
        if phrase and phrase not in seen:
            seen.append(phrase)
    return seen


def _section_body(md: str, heading_pred) -> str:
    lines = md.splitlines()
    start = None
    for i, line in enumerate(lines):
        if line.startswith("## ") and heading_pred(line):
            start = i + 1
            break
    if start is None:
        return ""
    chunk: list[str] = []
    for line in lines[start:]:
        if line.startswith("## "):
            break
        chunk.append(line)
    return "\n".join(chunk)


def _bullet_backticks(body: str, label: str) -> tuple[str, ...]:
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith(f"- {label.lower()}:"):
            return tuple(_backticks(stripped))
    return ()


def parse_vertical_markdown(md: str, path: Path) -> VerticalSpec:
    flags = tuple(re.findall(r"--trade\s+(\w+)", md))
    if not flags:
        raise ValueError(f"No --trade flag in {path}")

    nouns: list[str] = []
    identity = ""
    slogans: list[str] = []
    for line in md.splitlines():
        if line.lower().startswith("campaign trade noun:"):
            nouns = _backticks(line)
        elif line.lower().startswith("identity:"):
            ticks = _backticks(line)
            identity = ticks[0] if ticks else ""
        elif line.lower().startswith("slogan shops:"):
            slogans = [s.lower() for s in _backticks(line)]

    specialties = tuple(_backticks(_section_body(md, lambda h: h.startswith("## 2.") and "Specialty" in h)))
    shop_body = _section_body(md, lambda h: "Shop-sign" in h)
    words = tuple(w.lower() for w in _bullet_backticks(shop_body, "Words"))
    phrases = _bullet_backticks(shop_body, "Phrases")

    aliases: list[tuple[str, str]] = []
    alias_body = _section_body(md, lambda h: "alias" in h.lower())
    for line in alias_body.splitlines():
        match = _ALIAS_RE.match(line.strip())
        if match:
            aliases.append((match.group(1), match.group(2)))

    return VerticalSpec(
        trade=flags[0],
        path=path,
        trade_flags=flags,
        trade_nouns=tuple(nouns),
        identity=identity,
        specialties=specialties,
        shop_sign_words=words,
        shop_sign_phrases=phrases,
        aliases=tuple(aliases),
        slogans=tuple(slogans),
    )


@lru_cache(maxsize=1)
def load_all_verticals() -> tuple[VerticalSpec, ...]:
    if not VERTICALS_DIR.is_dir():
        raise SystemExit(f"Vertical specs not found at {VERTICALS_DIR}")
    specs = []
    for path in sorted(VERTICALS_DIR.glob("*.md")):
        specs.append(parse_vertical_markdown(path.read_text(encoding="utf-8"), path))
    if not specs:
        raise SystemExit(f"No vertical specs in {VERTICALS_DIR}")
    return tuple(specs)


def vertical_for_trade(campaign_trade: str) -> VerticalSpec:
    flag = (campaign_trade or "").strip().lower()
    if not flag:
        raise SystemExit("Need --trade to load switchflow-offer/verticals/")
    for spec in load_all_verticals():
        if flag in spec.trade_flags:
            return spec
    raise SystemExit(f"No vertical spec with `--trade {flag}` in {VERTICALS_DIR}")


def specialties_for_trade(campaign_trade: str) -> tuple[str, ...]:
    return tuple(sorted(vertical_for_trade(campaign_trade).specialties, key=len, reverse=True))


_CITY_PLACEHOLDER_RE = re.compile(r"\s+in\s+\[[^\]]*\]\s*$")


@lru_cache(maxsize=16)
def maps_terms_for_trade(campaign_trade: str) -> tuple[str, ...]:
    """Vortex searchStringsArray terms from the vertical file's Maps query bullet.

    City never appears in a term; the run's city goes in locationQueries /
    customGeolocation. Tolerates the retired `term in [City, State, Australia]`
    shape by stripping the bracket placeholder.
    """
    spec = vertical_for_trade(campaign_trade)
    md = spec.path.read_text(encoding="utf-8")
    body = _section_body(md, lambda h: h.startswith("## 1.") and "maps" in h.lower())
    for line in body.splitlines():
        stripped = line.strip()
        if not stripped.lower().startswith("- **search"):
            continue
        # Drop the bold label and any parenthetical note before the terms, so
        # backticked words inside the note (e.g. `locationQueries`) are not
        # mistaken for search terms.
        text = re.sub(r"^-\s*\*\*[^*]*\*\*\s*", "", stripped)
        text = re.sub(r"^\([^)]*\)\s*:?\s*", "", text)
        text = text.lstrip(":").strip()
        terms = []
        for term in _backticks(text):
            term = _CITY_PLACEHOLDER_RE.sub("", term).strip()
            if term:
                terms.append(term)
        return tuple(terms)
    return ()


def primary_trade_noun(campaign_trade: str) -> str:
    nouns = vertical_for_trade(campaign_trade).trade_nouns
    if not nouns:
        return campaign_trade.strip().title()
    return nouns[0]


def all_shop_sign_words() -> frozenset[str]:
    words: set[str] = set()
    for spec in load_all_verticals():
        words.update(spec.shop_sign_words)
    return frozenset(words)


def all_shop_sign_phrases() -> tuple[str, ...]:
    phrases: list[str] = []
    seen: set[str] = set()
    for spec in load_all_verticals():
        for phrase in spec.shop_sign_phrases:
            key = phrase.lower()
            if key not in seen:
                seen.add(key)
                phrases.append(phrase)
    return tuple(sorted(phrases, key=len, reverse=True))


def all_company_aliases() -> tuple[tuple[str, str], ...]:
    aliases: list[tuple[str, str]] = []
    for spec in load_all_verticals():
        aliases.extend(spec.aliases)
    return tuple(aliases)


def all_slogan_shops() -> frozenset[str]:
    slogans: set[str] = set()
    for spec in load_all_verticals():
        slogans.update(spec.slogans)
    return frozenset(slogans)


def identity_for_trade(campaign_trade: str) -> str:
    spec = vertical_for_trade(campaign_trade)
    if not spec.identity:
        raise SystemExit(f"{spec.path} is missing an Identity regex")
    return spec.identity


def other_trade_identities(campaign_trade: str) -> tuple[str, ...]:
    flag = (campaign_trade or "").strip().lower()
    others: list[str] = []
    for spec in load_all_verticals():
        if flag in spec.trade_flags:
            continue
        if spec.identity:
            others.append(spec.identity)
    return tuple(others)
