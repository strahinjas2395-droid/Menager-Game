#!/usr/bin/env python3
"""Build the compact offline real-player roster ledger.

The raw research snapshots are intentionally not committed. This script consumes:
- EA SPORTS FC 26 men's player CSV (detailed current-player snapshot)
- dcaribou/transfermarkt-datasets players/clubs CSVs (CC0 broad coverage)
- optional later Transfermarkt-derived profile/team CSVs for transfer updates

Only factual identity/body/position fields are retained. No source "overall" value is
written to the game database.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable, Iterator

SNAPSHOT_DATE = dt.date(2026, 9, 29)
TARGET_SQUAD_SIZE = 25
# These are lineup-safety minimums, not a rigid artificial squad shape. Once
# they are met, genuine members of the source club always beat a fallback.
BASE_GROUP_REQUIREMENTS = (
    ("goalkeeper", 2),
    ("defender", 5),
    ("midfielder", 4),
    ("forward", 4),
)

FC_LEAGUES_BY_COMPETITION = {
    "GB1": {"Premier League", "EFL Championship", "EFL League One", "EFL League Two"},
    "ES1": {"LALIGA EA SPORTS", "LALIGA HYPERMOTION"},
    "IT1": {"Serie A Enilive", "Serie BKT"},
    "FR1": {"Ligue 1 McDonald's", "Ligue 2 BKT"},
    "L1": {"Bundesliga", "Bundesliga 2", "3. Liga"},
    "NL1": {"Eredivisie"},
    "NO1": {"Eliteserien"},
    "BRA1": {"Libertadores", "Sudamericana"},
    "PO1": {"Liga Portugal"},
    "SC1": {"Scottish Prem"},
    "IR1": {"SSE Airtricity PD"},
    "C1": {"Brack Super League"},
    "TR1": {"Trendyol Süper Lig"},
    "GR1": {"Hellas Liga"},
    "KR1": {"Liga Hrvatska"},
}

COMPETITION_COUNTRY = {
    "GB1": "England",
    "ES1": "Spain",
    "IT1": "Italy",
    "FR1": "France",
    "L1": "Germany",
    "NL1": "Netherlands",
    "NO1": "Norway",
    "BRA1": "Brazil",
    "PO1": "Portugal",
    "SC1": "Scotland",
    "IR1": "Ireland",
    "C1": "Switzerland",
    "TR1": "Türkiye",
    "GR1": "Greece",
    "KR1": "Croatia",
    "SER1": "Serbia",
    "BOS1": "Bosnia-Herzegovina",
    "SL1": "Slovenia",
    "MNE1": "Montenegro",
    "MK1": "North Macedonia",
}

# Transfermarkt's stable club IDs disambiguate names shared by unrelated teams.
CLUB_ID_OVERRIDES = {
    "Arsenal FC": 11,
    "Boavista FC": 2503,
    "Botafogo FR": 537,
    "CR Vasco da Gama": 978,
    "Coritiba FC": 776,
    "Grêmio FBPA": 210,
    "Guarani FC": 1755,
    "SC Internacional": 6600,
    "América Mineiro": 2863,
    "Náutico": 2646,
    "CRB": 11449,
    "CSA": 18545,
    "Red Star Belgrade": 159,
    "FK Partizan Belgrade": 669,
}

PARTICLES = {"da", "das", "de", "del", "della", "den", "der", "di", "do", "dos", "du", "la", "le", "van", "von"}


def clean_source_name(value: str | None) -> str:
    return re.sub(r" \(\d+\)$", "", (value or "").strip())


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    value = value.replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def club_normalized(value: str) -> str:
    value = normalized(value)
    value = re.sub(
        r"\b(fc|cf|sc|ac|afc|fk|nk|sk|bk|as|ss|ssc|sv|vfl|vfb|tsg|rc|cd|ud|ec|cr|se|ao|ge|nfc|nps|gfs|if|il|ff|fbpa)\b",
        " ",
        value,
    )
    value = re.sub(r"\b(1893|1896|1899|1900|1907|1909|1913|1929|1964|07|08)\b", " ", value)
    return " ".join(value.split())


def club_similarity(expected: str, candidate: str) -> float:
    left, right = club_normalized(expected), club_normalized(candidate)
    if left == right:
        return 1.0
    left_tokens, right_tokens = set(left.split()), set(right.split())
    jaccard = len(left_tokens & right_tokens) / max(1, len(left_tokens | right_tokens))
    contained = 1.0 if left in right or right in left else 0.0
    return 0.58 * SequenceMatcher(None, left, right).ratio() + 0.32 * jaccard + 0.10 * contained


def open_csv(path: Path) -> Iterator[dict[str, str]]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as handle:
        yield from csv.DictReader(handle)


def integer(value: str | None, default: int = 0) -> int:
    try:
        return int(float(value or ""))
    except (TypeError, ValueError):
        return default


def number(value: str | None, default: float = 0.0) -> float:
    try:
        parsed = float(value or "")
        return parsed if math.isfinite(parsed) else default
    except (TypeError, ValueError):
        return default


def calculate_age(date_of_birth: str | None) -> int:
    try:
        born = dt.date.fromisoformat((date_of_birth or "")[:10])
    except ValueError:
        return 25
    return SNAPSHOT_DATE.year - born.year - ((SNAPSHOT_DATE.month, SNAPSHOT_DATE.day) < (born.month, born.day))


def split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split()
    if len(parts) <= 1:
        return (parts[0] if parts else "", "")
    split_at = 1
    while split_at < len(parts) - 1 and parts[split_at].lower().rstrip(".") in PARTICLES:
        split_at += 1
    return " ".join(parts[:1]), " ".join(parts[1:])


def map_position(raw: str) -> str:
    value = normalized(raw)
    if "goalkeeper" in value or value == "gk":
        return "GK"
    if "right back" in value or value in {"rb", "rwb"}:
        return "RB"
    if "left back" in value or value in {"lb", "lwb"}:
        return "LB"
    if "centre back" in value or "center back" in value or value == "cb" or value == "defender":
        return "CB"
    if "defensive midfield" in value or value == "cdm":
        return "CDM"
    if "attacking midfield" in value or value in {"cam", "cf"} or "second striker" in value:
        return "CAM"
    if "right midfield" in value or "right winger" in value or value in {"rm", "rw"}:
        return "RW"
    if "left midfield" in value or "left winger" in value or value in {"lm", "lw"}:
        return "LW"
    if "central midfield" in value or "centre midfield" in value or value in {"cm", "midfielder"}:
        return "CM"
    return "ST" if ("forward" in value or "attack" in value or value == "st") else "CM"


def position_group(position: str) -> str:
    if position == "GK":
        return "goalkeeper"
    if position in {"RB", "CB", "LB"}:
        return "defender"
    if position in {"CDM", "CM", "CAM"}:
        return "midfielder"
    return "forward"


def parse_list(value: str | None) -> list[str]:
    if not value:
        return []
    return re.findall(r"['\"]([^'\"]+)['\"]", value)


@dataclass
class Identity:
    source_id: str
    name: str
    age: int
    nationality: str
    position: str
    preferred_foot: str
    height: int
    weight: int
    secondary_positions: list[str] = field(default_factory=list)
    source_club_id: int | None = None
    source_club_name: str = ""
    source_team_name: str = ""
    rank: float = 0.0
    active: bool = True

    @property
    def canonical_name(self) -> str:
        return normalized(self.name)

    @property
    def group(self) -> str:
        return position_group(self.position)

    def compact(self) -> list[object]:
        return [
            self.source_id,
            self.name,
            self.age,
            self.nationality,
            self.position,
            self.preferred_foot,
            self.height,
            self.weight,
            self.secondary_positions,
        ]


@dataclass
class ClubCandidate:
    club_id: int
    name: str
    competition: str = ""
    country: str = ""
    squad_size: int = 0


def load_fc_players(path: Path) -> tuple[dict[str, list[Identity]], dict[str, str]]:
    teams: dict[str, list[Identity]] = defaultdict(list)
    team_leagues: dict[str, str] = {}
    for row in open_csv(path):
        name = (row.get("Name") or "").strip()
        team = (row.get("Team") or "").strip()
        if not name or not team:
            continue
        primary = map_position(row.get("Position") or "")
        secondaries = [map_position(item) for item in parse_list(row.get("Alternative positions"))]
        secondaries = [item for item in dict.fromkeys(secondaries) if item != primary]
        height = integer(re.search(r"(\d+)cm", row.get("Height") or "").group(1) if re.search(r"(\d+)cm", row.get("Height") or "") else None, 178)
        weight = integer(re.search(r"(\d+)kg", row.get("Weight") or "").group(1) if re.search(r"(\d+)kg", row.get("Weight") or "") else None, 75)
        teams[team].append(Identity(
            source_id=f"fc26:{row.get('ID') or normalized(name)}",
            name=name,
            age=integer(row.get("Age"), 25),
            nationality=(row.get("Nation") or "Unknown").strip(),
            position=primary,
            preferred_foot="Left" if (row.get("Preferred foot") or "").lower() == "left" else "Right",
            height=height,
            weight=weight,
            secondary_positions=secondaries,
            source_team_name=team,
            rank=2_000_000 + number(row.get("OVR")) * 10_000 + number(row.get("Rank"), 99_999) * -1,
        ))
        team_leagues[team] = (row.get("League") or "").strip()
    return teams, team_leagues


def load_transfermarkt_players(path: Path) -> dict[int, Identity]:
    players: dict[int, Identity] = {}
    for row in open_csv(path):
        player_id = integer(row.get("player_id"))
        name = clean_source_name(row.get("name") or row.get("player_name"))
        if not player_id or not name:
            continue
        date_of_birth = row.get("date_of_birth") or row.get("Date of birth")
        age = calculate_age(date_of_birth)
        current_club_id = integer(row.get("current_club_id")) or None
        current_club_name = clean_source_name(row.get("current_club_name") or row.get("Current club"))
        position = map_position(row.get("sub_position") or row.get("position") or row.get("Position") or "")
        foot = (row.get("foot") or row.get("Foot") or "").lower()
        players[player_id] = Identity(
            source_id=f"tm:{player_id}",
            name=name,
            age=age,
            nationality=(row.get("country_of_citizenship") or row.get("citizenship") or row.get("Citizenship") or "Unknown").split(",")[0].strip(),
            position=position,
            preferred_foot="Left" if foot == "left" else "Right",
            height=integer(row.get("height_in_cm") or row.get("height") or row.get("Height"), 178),
            weight=75,
            source_club_id=current_club_id,
            source_club_name=current_club_name,
            rank=number(row.get("market_value_in_eur")) + number(row.get("highest_market_value_in_eur")) * 0.04,
            active=integer(row.get("last_season"), 2026) >= 2025 and 15 <= age <= 43 and current_club_name not in {"Retired"},
        )
    return players


def apply_profile_updates(players: dict[int, Identity], path: Path) -> None:
    for row in open_csv(path):
        player_id = integer(row.get("player_id"))
        name = clean_source_name(row.get("player_name"))
        if not player_id or not name:
            continue
        existing = players.get(player_id)
        date_of_birth = row.get("date_of_birth") or ""
        current_club_id = integer(row.get("current_club_id")) or None
        current_club_name = clean_source_name(row.get("current_club_name"))
        full_position = row.get("position") or row.get("player_sub_position") or ""
        updated = Identity(
            source_id=f"tm:{player_id}",
            name=name,
            age=calculate_age(date_of_birth),
            nationality=(row.get("citizenship") or "Unknown").split(",")[0].strip(),
            position=map_position(full_position),
            preferred_foot="Left" if (row.get("foot") or "").lower() == "left" else "Right",
            height=integer(row.get("height"), existing.height if existing else 178),
            weight=existing.weight if existing else 75,
            source_club_id=current_club_id,
            source_club_name=current_club_name,
            rank=(existing.rank if existing else 0.0) + 500,
            active=current_club_name not in {"Retired"} and 15 <= calculate_age(date_of_birth) <= 43,
        )
        players[player_id] = updated


def load_clubs(path: Path) -> dict[int, ClubCandidate]:
    clubs: dict[int, ClubCandidate] = {}
    for row in open_csv(path):
        club_id = integer(row.get("club_id"))
        if not club_id:
            continue
        clubs[club_id] = ClubCandidate(
            club_id=club_id,
            name=clean_source_name(row.get("name") or row.get("club_name")),
            competition=(row.get("domestic_competition_id") or row.get("competition_id") or "").strip(),
            country=(row.get("country_name") or "").strip(),
            squad_size=integer(row.get("squad_size")),
        )
    return clubs


def apply_team_details(clubs: dict[int, ClubCandidate], path: Path) -> None:
    for row in open_csv(path):
        club_id = integer(row.get("club_id"))
        if not club_id:
            continue
        candidate = clubs.setdefault(club_id, ClubCandidate(club_id=club_id, name=clean_source_name(row.get("club_name"))))
        candidate.name = candidate.name or clean_source_name(row.get("club_name"))
        candidate.country = (row.get("country_name") or candidate.country).strip()
        candidate.competition = (row.get("competition_id") or candidate.competition).strip()


def resolve_fc_team(
    expected: str,
    competition: str,
    teams: dict[str, list[Identity]],
    team_leagues: dict[str, str],
) -> tuple[str | None, float]:
    allowed_leagues = FC_LEAGUES_BY_COMPETITION.get(competition)
    if competition and allowed_leagues is None:
        return None, 0.0
    candidates = [
        team for team in teams
        if allowed_leagues is None or team_leagues.get(team) in allowed_leagues
    ]
    ranked = sorted(((club_similarity(expected, team), team) for team in candidates), reverse=True)
    minimum = 0.61 if allowed_leagues else 0.82
    if not ranked or ranked[0][0] < minimum:
        return None, ranked[0][0] if ranked else 0.0
    return ranked[0][1], ranked[0][0]


def resolve_tm_club(expected: str, competition: str, clubs: dict[int, ClubCandidate]) -> tuple[ClubCandidate | None, float]:
    override = CLUB_ID_OVERRIDES.get(expected)
    if override and override in clubs:
        return clubs[override], 1.0
    expected_country = COMPETITION_COUNTRY.get(competition, "")
    ranked: list[tuple[float, ClubCandidate]] = []
    for club in clubs.values():
        similarity = club_similarity(expected, club.name)
        competition_bonus = 0.18 if competition and club.competition == competition else 0.0
        country_bonus = 0.10 if expected_country and normalized(club.country) == normalized(expected_country) else 0.0
        ranked.append((similarity + competition_bonus + country_bonus + min(club.squad_size, 30) / 10_000, club))
    ranked.sort(key=lambda item: item[0], reverse=True)
    if not ranked or ranked[0][0] < 0.64:
        return None, ranked[0][0] if ranked else 0.0
    raw_similarity = club_similarity(expected, ranked[0][1].name)
    if raw_similarity < 0.52:
        return None, raw_similarity
    return ranked[0][1], raw_similarity


def unique_sorted(identities: Iterable[Identity]) -> list[Identity]:
    best: dict[str, Identity] = {}
    for identity in identities:
        if not identity.active or not identity.name or identity.name.lower() in {"unknown", "n/a"}:
            continue
        current = best.get(identity.canonical_name)
        if current is None or identity.rank > current.rank:
            best[identity.canonical_name] = identity
    return sorted(best.values(), key=lambda item: (-item.rank, item.age, item.canonical_name))


def choose_roster(
    exact: list[Identity],
    fallback_by_group: dict[str, list[Identity]],
    used_ids: set[str],
    used_names: set[str],
) -> tuple[list[Identity], int]:
    exact = [item for item in unique_sorted(exact) if item.source_id not in used_ids and item.canonical_name not in used_names]
    by_group = {group: [item for item in exact if item.group == group] for group, _ in BASE_GROUP_REQUIREMENTS}
    chosen: list[Identity] = []
    exact_count = 0

    def take(item: Identity, is_exact: bool) -> None:
        nonlocal exact_count
        chosen.append(item)
        used_ids.add(item.source_id)
        used_names.add(item.canonical_name)
        if is_exact:
            exact_count += 1

    for group, wanted in BASE_GROUP_REQUIREMENTS:
        available = by_group[group]
        while available and sum(item.group == group for item in chosen) < wanted:
            take(available.pop(0), True)
        pool = fallback_by_group[group]
        cursor = 0
        while sum(item.group == group for item in chosen) < wanted:
            while cursor < len(pool) and (pool[cursor].source_id in used_ids or pool[cursor].canonical_name in used_names):
                cursor += 1
            if cursor >= len(pool):
                raise RuntimeError(f"Real-player fallback pool exhausted for {group}")
            take(pool[cursor], False)
            cursor += 1

    leftovers = [item for item in exact if item.source_id not in used_ids and item.canonical_name not in used_names]
    for item in leftovers:
        if len(chosen) >= TARGET_SQUAD_SIZE:
            break
        take(item, True)

    all_fallback = sorted(
        (item for pool in fallback_by_group.values() for item in pool),
        key=lambda item: (-item.rank, item.age, item.canonical_name),
    )
    for item in all_fallback:
        if len(chosen) >= TARGET_SQUAD_SIZE:
            break
        if item.source_id not in used_ids and item.canonical_name not in used_names:
            take(item, False)

    if len(chosen) != TARGET_SQUAD_SIZE:
        raise RuntimeError(f"Expected {TARGET_SQUAD_SIZE} real players, built {len(chosen)}")
    return chosen, exact_count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--club-sources", type=Path, required=True)
    parser.add_argument("--fc26", type=Path, required=True)
    parser.add_argument("--tm-players", type=Path, required=True)
    parser.add_argument("--tm-clubs", type=Path, required=True)
    parser.add_argument("--profiles", type=Path)
    parser.add_argument("--team-details", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--fc26-revision", required=True)
    parser.add_argument("--transfermarkt-revision", required=True)
    args = parser.parse_args()

    sources: dict[str, dict[str, str]] = json.loads(args.club_sources.read_text(encoding="utf-8"))
    fc_teams, fc_leagues = load_fc_players(args.fc26)
    tm_players = load_transfermarkt_players(args.tm_players)
    clubs = load_clubs(args.tm_clubs)
    if args.profiles:
        apply_profile_updates(tm_players, args.profiles)
    if args.team_details:
        apply_team_details(clubs, args.team_details)

    tm_by_club: dict[int, list[Identity]] = defaultdict(list)
    for player in tm_players.values():
        if player.source_club_id:
            tm_by_club[player.source_club_id].append(player)

    all_real_players = unique_sorted([
        *tm_players.values(),
        *(identity for team in fc_teams.values() for identity in team),
    ])

    resolved: dict[str, tuple[str | None, ClubCandidate | None, float, float]] = {}
    for alias, source in sources.items():
        expected = source["club"]
        fc_team, fc_score = resolve_fc_team(
            expected,
            source.get("competition", ""),
            fc_teams,
            fc_leagues,
        )
        tm_club, tm_score = resolve_tm_club(expected, source.get("competition", ""), clubs)
        resolved[alias] = (fc_team, tm_club, fc_score, tm_score)

    # A fallback may never steal a player who belongs to any represented club,
    # even if that club happens to be generated later in the deterministic pass.
    reserved_ids: set[str] = set()
    reserved_names: set[str] = set()
    for fc_team, tm_club, _, _ in resolved.values():
        exact_candidates = [
            *fc_teams.get(fc_team or "", []),
            *tm_by_club.get(tm_club.club_id if tm_club else -1, []),
        ]
        for identity in unique_sorted(exact_candidates):
            reserved_ids.add(identity.source_id)
            reserved_names.add(identity.canonical_name)
    fallback_by_group = {
        group: [
            identity for identity in all_real_players
            if identity.group == group
            and identity.source_id not in reserved_ids
            and identity.canonical_name not in reserved_names
        ]
        for group, _ in BASE_GROUP_REQUIREMENTS
    }

    # Stronger/more complete exact squads claim identities first. Output is
    # restored to the game's canonical club order below.
    aliases_by_coverage = sorted(
        sources,
        key=lambda alias: -(
            len(fc_teams.get(resolved[alias][0] or "", []))
            + len(tm_by_club.get(resolved[alias][1].club_id if resolved[alias][1] else -1, []))
        ),
    )

    used_ids: set[str] = set()
    used_names: set[str] = set()
    rosters: dict[str, list[list[object]]] = {}
    report: dict[str, object] = {}
    exact_total = 0

    for alias in aliases_by_coverage:
        expected = sources[alias]["club"]
        fc_team, tm_club, fc_score, tm_score = resolved[alias]
        exact: list[Identity] = []
        if fc_team:
            exact.extend(fc_teams[fc_team])
        if tm_club:
            exact.extend(tm_by_club.get(tm_club.club_id, []))
        roster, exact_count = choose_roster(exact, fallback_by_group, used_ids, used_names)
        exact_total += exact_count
        rosters[alias] = [identity.compact() for identity in roster]
        report[alias] = {
            "requestedClub": expected,
            "fcTeam": fc_team,
            "fcLeague": fc_leagues.get(fc_team or ""),
            "fcScore": round(fc_score, 3),
            "transfermarktClubId": tm_club.club_id if tm_club else None,
            "transfermarktClub": tm_club.name if tm_club else None,
            "transfermarktScore": round(tm_score, 3),
            "exactPlayers": exact_count,
            "fallbackPlayers": TARGET_SQUAD_SIZE - exact_count,
        }

    ordered_rosters = {alias: rosters[alias] for alias in sources}
    payload = {
        "schemaVersion": 1,
        "snapshotDate": SNAPSHOT_DATE.isoformat(),
        "sources": [
            {
                "name": "EA SPORTS FC 26 men's player snapshot",
                "repository": "https://github.com/SofiTal/fc26-player-analytics",
                "revision": args.fc26_revision,
            },
            {
                "name": "transfermarkt-datasets (CC0)",
                "repository": "https://github.com/dcaribou/transfermarkt-datasets",
                "revision": args.transfermarkt_revision,
            },
        ],
        "tuple": ["identityId", "fullName", "age", "nationality", "position", "preferredFoot", "height", "weight", "secondaryPositions"],
        "rosters": ordered_rosters,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    summary = {
        "snapshotDate": SNAPSHOT_DATE.isoformat(),
        "clubs": len(rosters),
        "players": sum(len(players) for players in rosters.values()),
        "uniqueIdentityIds": len(used_ids),
        "uniqueNames": len(used_names),
        "clubAssociatedAssignments": exact_total,
        "fallbackAssignments": len(used_ids) - exact_total,
        "clubsWithAtLeast21AssociatedPlayers": sum(1 for item in report.values() if item["exactPlayers"] >= 21),
        "clubsWithNoAssociatedPlayers": sum(1 for item in report.values() if item["exactPlayers"] == 0),
        "clubsDetail": report,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in summary.items() if key != "clubsDetail"}, indent=2))


if __name__ == "__main__":
    main()
