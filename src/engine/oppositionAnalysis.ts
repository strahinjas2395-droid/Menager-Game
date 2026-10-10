import {
  ManagerPersonality,
  PlayStyle,
  PlaystyleTag,
  type Fixture,
  type GameSave,
  type Manager,
  type Player,
  type TacticalSetup,
} from "@/types";
import type { TeamSide } from "@/engine/matchSimulator";
import { adaptTacticsToManagerMemory } from "@/engine/managerMemory";

export interface OppositionPlayerReport {
  playerId: string;
  name: string;
  position: string;
  shirtNumber: number;
  age: number;
  likelyRole: string;
  form: string;
  appearances: number;
  goals: number;
  assists: number;
  lastRating: number;
  keyAttributes: { label: string; value: number }[];
  playstyles: PlaystyleTag[];
  threatLabel: string;
  previousMeetings: number;
}

export interface OppositionReport {
  fixtureId: string;
  opponentClubId: string;
  opponentName: string;
  opponentShortName: string;
  primaryColor: string;
  venue: "Home" | "Away";
  coach: {
    name: string;
    nationality: string;
    personality: string;
    reputation: number;
    tacticalFlexibility: number;
    adaptability: string;
  };
  expectedFormation: string;
  playStyle: PlayStyle;
  tacticalDetails: { label: string; value: string }[];
  dangerousPlayers: OppositionPlayerReport[];
  expectedXI: OppositionPlayerReport[];
  strengths: { title: string; detail: string }[];
  weaknesses: { title: string; detail: string }[];
  likelyThreats: string[];
  seasonRecord: {
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    cleanSheets: number;
  };
  recentForm: { fixtureId: string; opponent: string; result: "W" | "D" | "L"; score: string }[];
  managerMemory: {
    meetings: number;
    confidence: number;
    lastResult?: "W" | "D" | "L";
    lastScore?: string;
    lessons: string[];
    adaptations: string[];
    rememberedPlayers: { playerId: string; name: string; meetings: number; goals: number; assists: number; averageRating: number }[];
  } | null;
}

interface Dimension {
  key: "pace" | "creation" | "finishing" | "aerial" | "defending" | "workRate" | "setPieces";
  value: number;
}

const FALLBACK_MANAGER: Manager = {
  id: "unknown-manager",
  firstName: "Unknown",
  lastName: "Coach",
  nationality: "Unknown",
  personality: ManagerPersonality.Normal,
  reputation: 50,
  clubId: "",
  formation: "4-3-3",
  playStyle: PlayStyle.Balanced,
  tacticalFlexibility: 8,
};

/** Build a deterministic pre-match dossier from career data and the expected XI. */
export function buildOppositionReport(
  save: GameSave,
  fixture: Fixture,
  opponentTeam: TeamSide,
): OppositionReport {
  const opponentId = opponentTeam.clubId;
  const club = save.world.clubs[opponentId];
  const manager = (club && save.world.managers[club.managerId]) ?? {
    ...FALLBACK_MANAGER,
    clubId: opponentId,
  };
  const previousMeetings = new Map<string, number>();
  for (const result of Object.values(save.results ?? {})) {
    for (const player of Object.values(result.analysis?.players ?? {})) {
      if (player.clubId === opponentId) {
        previousMeetings.set(player.playerId, (previousMeetings.get(player.playerId) ?? 0) + 1);
      }
    }
  }

  const expectedXI = opponentTeam.starters.map((player, index) =>
    playerReport(player, opponentTeam.roles[index] ?? player.primaryPosition, previousMeetings.get(player.id) ?? 0),
  );
  const ranked = opponentTeam.starters
    .map((player, index) => ({
      player,
      index,
      score: threatScore(player, opponentTeam.roles[index] ?? player.primaryPosition),
    }))
    .sort((a, b) => b.score - a.score);
  const dangerousIds = new Set(ranked.slice(0, 4).map(({ player }) => player.id));
  const withThreatLabels = expectedXI.map((player) => ({
    ...player,
    threatLabel: dangerousIds.has(player.playerId) ? threatReason(save.world.players[player.playerId]) : player.threatLabel,
  }));
  const dangerousPlayers = ranked.slice(0, 4).map(({ player }) =>
    withThreatLabels.find((report) => report.playerId === player.id)!,
  );

  const dimensions = teamDimensions(opponentTeam.starters);
  const strengths = [...dimensions]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((dimension) => dimensionCopy(dimension, true));
  const weaknesses = [...dimensions]
    .sort((a, b) => a.value - b.value)
    .slice(0, 2)
    .map((dimension) => dimensionCopy(dimension, false));
  const allFixtures = Object.values(save.world.fixtures);
  const played = allFixtures
    .filter((candidate) => candidate.played && (candidate.homeClubId === opponentId || candidate.awayClubId === opponentId))
    .sort((a, b) => b.week - a.week || b.id.localeCompare(a.id));
  const seasonRecord = recordFromFixtures(played, opponentId);
  const recentForm = played.slice(0, 5).map((candidate) => {
    const home = candidate.homeClubId === opponentId;
    const gf = home ? candidate.homeGoals : candidate.awayGoals;
    const ga = home ? candidate.awayGoals : candidate.homeGoals;
    const otherId = home ? candidate.awayClubId : candidate.homeClubId;
    return {
      fixtureId: candidate.id,
      opponent: save.world.clubs[otherId]?.shortName ?? otherId,
      result: (gf > ga ? "W" : gf < ga ? "L" : "D") as "W" | "D" | "L",
      score: `${gf}-${ga}`,
    };
  });
  const memory = save.managerMemories?.[manager.id];
  const latestMemory = memory?.encounters.at(-1);
  const rememberedPlayers = Object.values(memory?.playerKnowledge ?? {})
    .filter((known) => save.world.clubs[save.userClubId]?.playerIds.includes(known.playerId))
    .sort((a, b) => b.averageRating - a.averageRating || b.goals - a.goals)
    .slice(0, 4)
    .map((known) => ({
      playerId: known.playerId,
      name: known.playerName,
      meetings: known.meetings,
      goals: known.goals,
      assists: known.assists,
      averageRating: known.averageRating,
    }));
  const memoryAdaptation = adaptTacticsToManagerMemory(opponentTeam.tactics, memory, save.difficulty);

  return {
    fixtureId: fixture.id,
    opponentClubId: opponentId,
    opponentName: opponentTeam.name,
    opponentShortName: opponentTeam.shortName,
    primaryColor: opponentTeam.primaryColor,
    venue: fixture.homeClubId === save.userClubId ? "Home" : "Away",
    coach: {
      name: `${manager.firstName} ${manager.lastName}`,
      nationality: manager.nationality,
      personality: humanize(manager.personality),
      reputation: manager.reputation,
      tacticalFlexibility: manager.tacticalFlexibility,
      adaptability: manager.tacticalFlexibility >= 16
        ? "Highly adaptive — expect early system changes"
        : manager.tacticalFlexibility >= 11
          ? "Flexible — reacts to score and match trends"
          : "Principled — usually stays close to the original plan",
    },
    expectedFormation: opponentTeam.tactics.formation,
    playStyle: opponentTeam.tactics.playStyle,
    tacticalDetails: tacticalDetails(opponentTeam.tactics),
    dangerousPlayers,
    expectedXI: withThreatLabels,
    strengths,
    weaknesses,
    likelyThreats: likelyThreats(opponentTeam.tactics.playStyle, dangerousPlayers),
    seasonRecord,
    recentForm,
    managerMemory: memory ? {
      meetings: memory.meetings,
      confidence: memory.confidence,
      lastResult: latestMemory?.result,
      lastScore: latestMemory ? `${latestMemory.goalsFor}-${latestMemory.goalsAgainst}` : undefined,
      lessons: [...memory.tacticalLessons],
      adaptations: memoryAdaptation.reasons,
      rememberedPlayers,
    } : null,
  };
}

function playerReport(player: Player, role: string, previousMeetings: number): OppositionPlayerReport {
  return {
    playerId: player.id,
    name: `${player.firstName} ${player.lastName}`,
    position: player.primaryPosition,
    shirtNumber: player.shirtNumber,
    age: player.age,
    likelyRole: role,
    form: player.seasonStats.appearances === 0
      ? "No senior form"
      : player.seasonStats.lastRating >= 7.5
        ? "Excellent"
        : player.seasonStats.lastRating >= 7
          ? "Strong"
          : player.seasonStats.lastRating >= 6.4
            ? "Steady"
            : "Vulnerable",
    appearances: player.seasonStats.appearances,
    goals: player.seasonStats.goals,
    assists: player.seasonStats.assists,
    lastRating: player.seasonStats.lastRating,
    keyAttributes: keyAttributes(player, role),
    playstyles: [...(player.playstyles ?? [])],
    threatLabel: threatReason(player),
    previousMeetings,
  };
}

function threatScore(player: Player, role: string): number {
  const form = player.seasonStats.lastRating > 0 ? (player.seasonStats.lastRating - 6) * 5 : 0;
  const output = player.seasonStats.goals * 1.6 + player.seasonStats.assists * 1.2;
  if (role === "GK") return player.reflexes + player.shotStopping + player.oneOnOnes + form;
  if (["CB", "RB", "LB", "RWB", "LWB"].includes(role)) {
    return player.tackling + player.interceptions + player.positioning + player.pace * 0.55 + form + output;
  }
  if (["ST", "CF", "RW", "LW"].includes(role)) {
    return player.finishing * 1.25 + player.pace + player.offTheBall + player.dribbling * 0.7 + form + output;
  }
  return player.creativity + player.shortPassing + player.decisions + player.workRate * 0.55 + form + output;
}

function keyAttributes(player: Player, role: string): { label: string; value: number }[] {
  const values: { label: string; value: number }[] = role === "GK"
    ? [
        { label: "Reflexes", value: player.reflexes },
        { label: "Shot stopping", value: player.shotStopping },
        { label: "One-on-ones", value: player.oneOnOnes },
      ]
    : ["CB", "RB", "LB", "RWB", "LWB"].includes(role)
      ? [
          { label: "Tackling", value: player.tackling },
          { label: "Interceptions", value: player.interceptions },
          { label: "Pace", value: player.pace },
        ]
      : ["ST", "CF", "RW", "LW"].includes(role)
        ? [
            { label: "Finishing", value: player.finishing },
            { label: "Pace", value: player.pace },
            { label: "Off the ball", value: player.offTheBall },
          ]
        : [
            { label: "Creativity", value: player.creativity },
            { label: "Passing", value: player.shortPassing },
            { label: "Decisions", value: player.decisions },
          ];
  return values.sort((a, b) => b.value - a.value);
}

function threatReason(player: Player | undefined): string {
  if (!player) return "Monitor closely";
  const styles = player.playstyles ?? [];
  if (styles.includes(PlaystyleTag.PaceAbuser)) return "Explosive runs and knock-ons behind the line";
  if (styles.includes(PlaystyleTag.LongShotSpecialist)) return "Dangerous from long range";
  if (styles.includes(PlaystyleTag.Crosser)) return "High-quality service from wide areas";
  if (styles.includes(PlaystyleTag.ThroughBallSpecialist)) return "Creates chances with passes beyond the defence";
  if (styles.includes(PlaystyleTag.ClinicalFinisher)) return "Clinical inside the penalty area";
  if (styles.includes(PlaystyleTag.AerialThreat)) return "Major target on crosses and set pieces";
  if (player.finishing >= 15) return "Primary finishing threat";
  if (player.creativity >= 15) return "Creative hub between the lines";
  if (player.pace >= 16) return "Can attack space at speed";
  return "Influential in their expected role";
}

function teamDimensions(players: Player[]): Dimension[] {
  const outfield = players.filter((player) => player.primaryPosition !== "GK");
  const average = (pick: (player: Player) => number) =>
    outfield.length ? outfield.reduce((sum, player) => sum + pick(player), 0) / outfield.length : 0;
  return [
    { key: "pace", value: average((player) => (player.pace + player.acceleration) / 2) },
    { key: "creation", value: average((player) => (player.creativity + player.shortPassing + player.decisions) / 3) },
    { key: "finishing", value: average((player) => (player.finishing + player.longShots + player.offTheBall) / 3) },
    { key: "aerial", value: average((player) => (player.heading + player.jumping + player.aerialDuels) / 3) },
    { key: "defending", value: average((player) => (player.tackling + player.interceptions + player.positioning) / 3) },
    { key: "workRate", value: average((player) => (player.workRate + player.teamwork + player.naturalFitness) / 3) },
    { key: "setPieces", value: average((player) => (player.crossing + player.freeKickAccuracy + player.heading) / 3) },
  ];
}

function dimensionCopy(dimension: Dimension, strength: boolean): { title: string; detail: string } {
  const copy: Record<Dimension["key"], [string, string, string]> = {
    pace: ["Transition speed", "Fast runners can exploit a high line.", "Limited acceleration makes recovery runs vulnerable."],
    creation: ["Chance creation", "Several players can find progressive and through passes.", "Pressure on the main creator can disrupt their supply."],
    finishing: ["Final-third quality", "Attackers combine movement with credible shooting.", "Finishing output is less reliable than their build-up."],
    aerial: ["Aerial presence", "Crosses and dead balls carry a strong aerial threat.", "They can be challenged in the air at both ends."],
    defending: ["Defensive reading", "The expected XI reads danger and tackles well.", "Direct runners can expose their defensive timing."],
    workRate: ["Intensity", "Work rate supports sustained pressing and recovery.", "Their shape may fade when tempo and transitions rise."],
    setPieces: ["Set-piece delivery", "Delivery and heading make restarts dangerous.", "Dead-ball quality is not a leading weapon."],
  };
  const [title, strongDetail, weakDetail] = copy[dimension.key];
  return { title, detail: strength ? strongDetail : weakDetail };
}

function tacticalDetails(tactics: TacticalSetup): { label: string; value: string }[] {
  return [
    { label: "Formation", value: tactics.formation },
    { label: "Identity", value: humanize(tactics.playStyle) },
    { label: "Mentality", value: scaleLabel(tactics.mentality, ["Ultra defensive", "Defensive", "Cautious", "Balanced", "Positive", "Attacking", "Ultra attacking"]) },
    { label: "Tempo", value: scaleLabel(tactics.tempo, ["Very slow", "Slow", "Normal", "Fast", "Very fast"]) },
    { label: "Passing", value: scaleLabel(tactics.passingLength, ["Very short", "Short", "Mixed", "Direct", "Very direct"]) },
    { label: "Defensive line", value: scaleLabel(tactics.defensiveLine, ["Very deep", "Deep", "Normal", "High", "Very high"]) },
    { label: "Pressing", value: scaleLabel(tactics.pressing, ["None", "Low", "Standard", "High", "Extreme"]) },
    { label: "Width", value: scaleLabel(tactics.width, ["Very narrow", "Narrow", "Normal", "Wide", "Very wide"]) },
    { label: "Transition", value: tactics.counterAttack ? "Counter quickly" : "Keep structure" },
  ];
}

function likelyThreats(style: PlayStyle, dangerous: OppositionPlayerReport[]): string[] {
  const byStyle: Record<PlayStyle, string[]> = {
    [PlayStyle.PossessionBased]: ["Patient overloads around the ball", "Cutbacks after moving the block side to side"],
    [PlayStyle.TikiTaka]: ["Rapid short combinations through midfield", "Third-player runs after give-and-go passes"],
    [PlayStyle.DirectCounterAttack]: ["Immediate balls into space after turnovers", "Fast runners isolating the last defender"],
    [PlayStyle.GegenpressingStyle]: ["Aggressive counter-press after possession loss", "Shots created from high regains"],
    [PlayStyle.LongBallDirect]: ["Early service behind the back line", "Second balls around a physical forward"],
    [PlayStyle.WingPlay]: ["Overlaps and repeated wide deliveries", "Back-post and aerial attacks"],
    [PlayStyle.ParkTheBus]: ["Compact low block followed by selective counters", "Set pieces as a primary route to goal"],
    [PlayStyle.TotalFootball]: ["Rotations that pull markers out of shape", "Multiple runners arriving from midfield"],
    [PlayStyle.RouteOne]: ["Direct balls to a target forward", "Aerial duels and second-ball pressure"],
    [PlayStyle.Balanced]: ["Varied build-up with no single predictable route", "Contextual switches between possession and transition"],
  };
  const playerThreats = dangerous.slice(0, 2).map((player) => `${player.name}: ${player.threatLabel}`);
  return [...(byStyle[style] ?? byStyle[PlayStyle.Balanced]), ...playerThreats];
}

function recordFromFixtures(fixtures: Fixture[], clubId: string): OppositionReport["seasonRecord"] {
  return fixtures.reduce<OppositionReport["seasonRecord"]>((record, fixture) => {
    const home = fixture.homeClubId === clubId;
    const gf = home ? fixture.homeGoals : fixture.awayGoals;
    const ga = home ? fixture.awayGoals : fixture.homeGoals;
    record.played += 1;
    record.goalsFor += gf;
    record.goalsAgainst += ga;
    if (ga === 0) record.cleanSheets += 1;
    if (gf > ga) record.won += 1;
    else if (gf < ga) record.lost += 1;
    else record.drawn += 1;
    return record;
  }, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 });
}

function scaleLabel(value: number, labels: string[]): string {
  return labels[Math.max(0, Math.min(labels.length - 1, Number(value)))] ?? String(value);
}

function humanize(value: string | number): string {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/Style$/, "")
    .trim();
}
