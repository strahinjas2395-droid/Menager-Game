/**
 * Game store — career state, week flow, persistence.
 * Components select `state.save` (replaced on every mutation) so nested
 * primitive selectors always recompute.
 */
import { create } from "zustand";
import {
  CompetitionType,
  Difficulty,
  GameMode,
  MatchEventType,
  MentalityLevel,
  PlayStyle,
  PressingIntensity,
  TempoSetting,
  DefensiveLine,
  WidthSetting,
  TimeWasting,
  type Fixture,
  type GameSave,
  type GameSettings,
  type InboxMessage,
  type League,
  type Manager,
  type MatchResult,
  type OpponentMatchPlan,
  type Player,
  type TacticalSetup,
  type TeamTrainingFocus,
  type TrainingDevelopmentFocus,
  type TrainingIntensity,
} from "@/types";
import { randomSeed, SeededRNG, clamp } from "@/database/rng";
import { generateAllLeagues, hashStr } from "@/database/leagueGenerator";
import { generateSeasonFixtures, TOTAL_WEEKS, simulateWeekAI, userFixturesForWeek, fixturesForWeek, advanceCup, advanceContinental, applyPromotionRelegation, processSeasonEnd, transferWindowOpen } from "@/engine/seasonManager";
import { calculateStandings } from "@/engine/leagueEngine";
import { buildTeamSide, type TeamSide } from "@/engine/matchSimulator";
import { buildInstructionRoster, compileInstructionPlans } from "@/engine/directives";
import { sanitizeOpponentMatchPlan } from "@/engine/matchPlan";
import { adaptTacticsToManagerMemory, rememberManagerMatch } from "@/engine/managerMemory";
import {
  applyMatchLoad,
  defaultTrainingPlan,
  injuryFromMatchRecord,
  isPlayerAvailable,
  normalizeWorldFitness,
  playerCondition,
  playerSharpness,
  processWeeklyTraining,
} from "@/engine/fitness";
import { saveGame, loadGame, deleteSave } from "@/database/storage";
import { aiTransferActivity } from "@/engine/transferEngine";
import { CONTINENTAL_ID } from "@/engine/continentalEngine";
import { CUP_ID, CUP_ROUND_NAMES } from "@/engine/cupEngine";

const SAVE_VERSION = 1;

export function defaultTactics(formation = "4-3-3"): TacticalSetup {
  return {
    formation,
    playStyle: PlayStyle.Balanced,
    tempo: TempoSetting.Normal,
    passingLength: TempoSetting.Normal,
    defensiveLine: DefensiveLine.Normal,
    pressing: PressingIntensity.Standard,
    width: WidthSetting.Normal,
    mentality: MentalityLevel.Balanced,
    timeWasting: TimeWasting.Late,
    offsideTrap: false,
    counterAttack: false,
    teamInstructions: "",
    instructionCache: { players: {} },
    playerRoles: {},
    positionOverrides: {},
    setPieces: {
      cornerLeftId: null,
      cornerRightId: null,
      freeKickId: null,
      penaltyId: null,
      captainId: null,
    },
  };
}

const DEFAULT_SETTINGS: GameSettings = {
  audioEnabled: true,
  soundVolume: 0.7,
  musicVolume: 0.4,
  vibration: true,
  autoPressConference: false,
};

/** Fill settings introduced after the original save schema without invalidating careers. */
export function normalizeGameSettings(settings?: Partial<GameSettings> | null): GameSettings {
  const soundVolume = typeof settings?.soundVolume === "number" && Number.isFinite(settings.soundVolume)
    ? clamp(settings.soundVolume, 0, 1)
    : DEFAULT_SETTINGS.soundVolume;
  const musicVolume = typeof settings?.musicVolume === "number" && Number.isFinite(settings.musicVolume)
    ? clamp(settings.musicVolume, 0, 1)
    : DEFAULT_SETTINGS.musicVolume;
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    audioEnabled: settings?.audioEnabled !== false,
    soundVolume,
    musicVolume,
    vibration: settings?.vibration !== false,
    autoPressConference: settings?.autoPressConference === true,
  };
}

/** Map an AI manager's identity to a full TacticalSetup. */
export function tacticsFromManager(manager: Manager): TacticalSetup {
  const t = defaultTactics(manager.formation);
  t.playStyle = manager.playStyle;
  switch (manager.playStyle) {
    case PlayStyle.GegenpressingStyle:
      t.pressing = PressingIntensity.High;
      t.tempo = TempoSetting.Fast;
      t.defensiveLine = DefensiveLine.High;
      t.mentality = MentalityLevel.Positive;
      break;
    case PlayStyle.PossessionBased:
      t.tempo = TempoSetting.Slow;
      t.passingLength = TempoSetting.VerySlow;
      t.width = WidthSetting.Normal;
      break;
    case PlayStyle.TikiTaka:
      t.tempo = TempoSetting.Fast;
      t.passingLength = TempoSetting.VerySlow;
      t.pressing = PressingIntensity.High;
      break;
    case PlayStyle.ParkTheBus:
      t.mentality = MentalityLevel.UltraDefensive;
      t.defensiveLine = DefensiveLine.VeryDeep;
      t.pressing = PressingIntensity.Low;
      t.timeWasting = TimeWasting.Always;
      break;
    case PlayStyle.LongBallDirect:
    case PlayStyle.RouteOne:
      t.passingLength = TempoSetting.VeryFast;
      t.tempo = TempoSetting.Fast;
      break;
    case PlayStyle.WingPlay:
      t.width = WidthSetting.VeryWide;
      break;
    case PlayStyle.DirectCounterAttack:
      t.counterAttack = true;
      t.defensiveLine = DefensiveLine.Deep;
      t.mentality = MentalityLevel.Cautious;
      break;
    case PlayStyle.TotalFootball:
      t.mentality = MentalityLevel.Attacking;
      t.tempo = TempoSetting.VeryFast;
      t.pressing = PressingIntensity.Extreme;
      break;
    default:
      break;
  }
  if (manager.tacticalFlexibility > 14) t.offsideTrap = true;
  return t;
}

export type AdvanceResult =
  | { type: "match"; fixtureId: string }
  | { type: "none" }
  | { type: "seasonEnd" };

interface GameState {
  ready: boolean;
  saveExists: boolean;
  save: GameSave | null;
  /** user fixtures still to play in the current week */
  weekQueue: Fixture[];

  init: () => Promise<void>;
  newCareer: (params: {
    managerName: string;
    managerNationality: string;
    difficulty: Difficulty;
    gameMode?: GameMode;
    leagueId: string;
    clubId: string;
  }) => Promise<void>;
  continueCareer: () => Promise<void>;
  backToMenu: () => Promise<void>;
  deleteCareer: () => Promise<void>;
  advanceWeek: () => AdvanceResult;
  recordUserMatch: (result: MatchResult) => AdvanceResult;
  updateTactics: (t: TacticalSetup) => Promise<void>;
  updatePlayerInstructions: (instructions: Record<string, string>) => Promise<void>;
  updateOpponentPlan: (fixtureId: string, plan: OpponentMatchPlan) => Promise<OpponentMatchPlan | null>;
  updateTrainingPlan: (changes: { intensity?: TrainingIntensity; teamFocus?: TeamTrainingFocus }) => Promise<void>;
  togglePlayerRest: (playerId: string) => Promise<void>;
  setIndividualTraining: (playerId: string, focus?: TrainingDevelopmentFocus) => Promise<void>;
  markAllInboxRead: () => void;
  addMessage: (subject: string, body: string) => void;
  saveNow: () => Promise<void>;
  replaceSave: (save: GameSave) => Promise<void>;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildWorldFromGeneration(gen: ReturnType<typeof generateAllLeagues>): GameSave["world"] {
  const world: GameSave["world"] = {
    players: {},
    clubs: {},
    leagues: {},
    managers: {},
    fixtures: {},
  };
  for (const p of gen.players) world.players[p.id] = p;
  for (const c of gen.clubs) world.clubs[c.id] = c;
  for (const l of gen.leagues) world.leagues[l.id] = l;
  for (const m of gen.managers) world.managers[m.id] = m;
  return world;
}

export const useGameStore = create<GameState>((set, get) => {
  const commit = (mutate: (save: GameSave) => void) => {
    const save = get().save;
    if (!save) return;
    mutate(save);
    set({ save: { ...save } });
  };

  const persist = async () => {
    const save = get().save;
    if (save) await saveGame(save);
  };

  /** End-of-week bookkeeping: competition progression, news, week advance. */
  const finishWeek = (save: GameSave): boolean => {
    const week = save.season.currentWeek;

    // competition progression (may add fixtures)
    const cupAdv = advanceCup(save.world.fixtures ? Object.values(save.world.fixtures) : [], save.cup, save.world);    // advanceCup works on shared objects; re-key after any additions
    if (cupAdv.added.length) {
      for (const f of cupAdv.added) save.world.fixtures[f.id] = f;
    }
    save.cup = cupAdv.cup;

    const contAdv = advanceContinental(Object.values(save.world.fixtures), save.continental);
    if (contAdv.added.length) {
      for (const f of contAdv.added) save.world.fixtures[f.id] = f;
    }
    save.continental = contAdv.continental;

    // AI transfer activity during open windows (every other window week)
    if (save.season.transferWindowOpen && week % 2 === 1) {
      const rng = new SeededRNG((save.seed + week * 77) >>> 0);
      const moves = aiTransferActivity(save.world, {
        userClubId: save.userClubId,
        rng,
        moves: rng.int(2, 5),
      });
      for (const m of moves) {
        const p = save.world.players[m.playerId];
        const to = save.world.clubs[m.to];
        const from = save.world.clubs[m.from];
        if (!p || !to) continue;
        save.inbox.unshift({
          id: `msg-${m.playerId}-${week}`,
          week,
          subject: `Transfer: ${p.firstName} ${p.lastName} → ${to.shortName}`,
          body: `${to.name} have signed ${p.firstName} ${p.lastName} from ${from?.name ?? "a club"} for €${(m.fee / 1_000_000).toFixed(1)}M.`,
          read: false,
        });
      }
    }

    // Recovery, rehabilitation and training advance exactly once with each career week.
    save.trainingPlan ??= defaultTrainingPlan();
    save.trainingHistory ??= [];
    const trainingReport = processWeeklyTraining(
      save.world,
      save.userClubId,
      save.trainingPlan,
      save.season.seasonYear,
      week,
      save.seed,
    );
    save.trainingHistory.push(trainingReport);
    save.trainingHistory = save.trainingHistory.slice(-52);
    for (const playerId of trainingReport.injuries) {
      const player = save.world.players[playerId];
      if (!player?.injury) continue;
      save.inbox.unshift({
        id: `msg-training-injury-${playerId}-${save.season.seasonYear}-${week}`,
        week,
        subject: `Training injury: ${player.firstName} ${player.lastName}`,
        body: `${player.firstName} suffered a ${player.injury.name.toLowerCase()} and is expected out for ${player.injury.weeksRemaining} week${player.injury.weeksRemaining === 1 ? "" : "s"}.`,
        read: false,
      });
    }
    for (const playerId of trainingReport.returned) {
      const player = save.world.players[playerId];
      if (!player) continue;
      save.inbox.unshift({
        id: `msg-fitness-return-${playerId}-${save.season.seasonYear}-${week}`,
        week,
        subject: `${player.firstName} ${player.lastName} cleared to return`,
        body: "The medical team has made the player available for selection. Match sharpness may still need rebuilding.",
        read: false,
      });
    }

    // season end
    if (week >= TOTAL_WEEKS) {
      processSeasonEnd(save.world, new SeededRNG(randomSeed()), save.season.seasonYear);
      applyPromotionRelegation(
        save.world.leagues,
        save.world.clubs,
        Object.values(save.world.fixtures),
        calculateStandings,
      );
      save.world.fixtures = {};
      // Completed-match reports retain the plan used; stale fixture-keyed
      // drafts must not leak into a regenerated season with reusable IDs.
      save.opponentPlans = {};
      const next = generateSeasonFixtures(save.world, save.userClubId, (save.seed ^ (save.season.seasonYear + 1)) >>> 0);
      for (const f of next.fixtures) save.world.fixtures[f.id] = f;
      save.cup = next.cup;
      save.continental = next.continental;
      save.season = {
        seasonYear: save.season.seasonYear + 1,
        currentWeek: 1,
        totalWeeks: TOTAL_WEEKS,
        transferWindowOpen: transferWindowOpen(1),
      };
      save.inbox.unshift({
        id: uid("msg"),
        week: 1,
        subject: `Season ${save.season.seasonYear} begins!`,
        body: "A new season is under way. Pre-season friendlies are behind you — the league campaign starts now. Good luck, gaffer!",
        read: false,
      });
      return true;
    }

    save.season = {
      ...save.season,
      currentWeek: week + 1,
      transferWindowOpen: transferWindowOpen(week + 1),
    };
    return false;
  };

  return {
    ready: false,
    saveExists: false,
    save: null,
    weekQueue: [],

    init: async () => {
      await get().continueCareer();
      set({ ready: true });
    },

    newCareer: async (params) => {
      const seed = randomSeed();
      const gameMode = params.gameMode ?? GameMode.Modern;
      const gen = generateAllLeagues(seed, gameMode);
      const world = buildWorldFromGeneration(gen);
      const club = world.clubs[params.clubId];
      if (!club) throw new Error("Club not found");
      const manager = world.managers[club.managerId];

      const comps = generateSeasonFixtures(world, params.clubId, seed);
      for (const f of comps.fixtures) world.fixtures[f.id] = f;

      const save: GameSave = {
        version: SAVE_VERSION,
        seed,
        gameMode,
        managerName: params.managerName,
        managerNationality: params.managerNationality,
        difficulty: params.difficulty,
        userClubId: params.clubId,
        season: {
          seasonYear: 2026,
          currentWeek: 1,
          totalWeeks: TOTAL_WEEKS,
          transferWindowOpen: transferWindowOpen(1),
        },
        world,
        tacticalSetup: defaultTactics(manager?.formation ?? "4-3-3"),
        cup: comps.cup,
        continental: comps.continental,
        inbox: [
          {
            id: uid("msg"),
            week: 1,
            subject: `Welcome to ${club.name}!`,
            body: `The board is delighted to appoint you as manager of ${club.name}. Expectations are high — the board expects a competitive season. Your squad is ready for the campaign opener.`,
            read: false,
          },
        ],
        offers: [],
        results: {},
        opponentPlans: {},
        managerMemories: {},
        trainingPlan: defaultTrainingPlan(),
        trainingHistory: [],
        settings: { ...DEFAULT_SETTINGS },
        savedAt: Date.now(),
      };

      set({ save, weekQueue: [], saveExists: true });
      await saveGame(save);
    },

    continueCareer: async () => {
      const existing = await loadGame();
      if (existing) {
        // Careers created before selectable databases used the mixed-era layer.
        existing.gameMode ??= GameMode.Iconic;
        existing.opponentPlans ??= {};
        existing.managerMemories ??= {};
        existing.trainingPlan ??= defaultTrainingPlan();
        existing.trainingHistory ??= [];
        existing.settings = normalizeGameSettings(existing.settings);
        normalizeWorldFitness(existing.world);
        set({ save: existing, saveExists: true, weekQueue: [] });
      }
    },

    backToMenu: async () => {
      await persist();
      set({ save: null, weekQueue: [] });
    },

    deleteCareer: async () => {
      await deleteSave();
      set({ save: null, saveExists: false, weekQueue: [] });
    },

    advanceWeek: () => {
      const save = get().save;
      if (!save) return { type: "none" };
      const week = save.season.currentWeek;

      // Quick-sim every AI fixture of the week first
      simulateWeekAI(
        Object.values(save.world.fixtures),
        week,
        save.world,
        save.userClubId,
        new SeededRNG((save.seed + week * 31) >>> 0),
      );

      const userFixtures = userFixturesForWeek(Object.values(save.world.fixtures), week, save.userClubId);
      if (userFixtures.length === 0) {
        const seasonEnd = finishWeek(save);
        set({ save: { ...save }, weekQueue: [] });
        void persist();
        return seasonEnd ? { type: "seasonEnd" } : { type: "none" };
      }

      set({ save: { ...save }, weekQueue: userFixtures });
      return { type: "match", fixtureId: userFixtures[0].id };
    },

    recordUserMatch: (result) => {
      const save = get().save;
      if (!save) return { type: "none" };

      const fixture = save.world.fixtures[result.fixtureId];
      if (!fixture) return { type: "none" };

      // apply score
      fixture.homeGoals = result.homeGoals;
      fixture.awayGoals = result.awayGoals;
      fixture.homePens = result.homePens;
      fixture.awayPens = result.awayPens;
      fixture.played = true;
      save.results[fixture.id] = {
        ...result,
        seasonYear: result.seasonYear ?? save.season.seasonYear,
        week: result.week ?? fixture.week,
        competitionLabel: result.competitionLabel ?? competitionLabelFor(fixture, save),
        homeClubName: result.homeClubName ?? save.world.clubs[fixture.homeClubId]?.name ?? fixture.homeClubId,
        awayClubName: result.awayClubName ?? save.world.clubs[fixture.awayClubId]?.name ?? fixture.awayClubId,
      };

      const opponentClubId = fixture.homeClubId === save.userClubId ? fixture.awayClubId : fixture.homeClubId;
      const opponentClub = save.world.clubs[opponentClubId];
      const opponentManager = opponentClub ? save.world.managers[opponentClub.managerId] : undefined;
      if (opponentManager) {
        save.managerMemories ??= {};
        save.managerMemories[opponentManager.id] = rememberManagerMatch(
          save.managerMemories[opponentManager.id],
          {
            manager: opponentManager,
            fixture,
            result,
            userClubId: save.userClubId,
            seasonYear: save.season.seasonYear,
            week: fixture.week,
          },
        );
      }

      // Detailed reports are authoritative for appearances, goals, assists and
      // discipline. Older saves/results retain the event-based fallback.
      if (result.analysis) {
        for (const report of Object.values(result.analysis.players)) {
          const p = save.world.players[report.playerId];
          if (!p) continue;
          p.seasonStats.appearances += 1;
          p.seasonStats.lastRating = report.rating;
          p.seasonStats.goals += report.goals;
          p.seasonStats.assists += report.assists;
          p.seasonStats.yellowCards += report.yellowCards;
          p.seasonStats.redCards += report.redCards;
          applyMatchLoad(p, report);
        }
        for (const injury of result.analysis.injuries ?? []) {
          const player = save.world.players[injury.playerId];
          if (!player) continue;
          player.injury = injuryFromMatchRecord(injury, save.season.seasonYear, fixture.week);
          player.condition = Math.min(playerCondition(player), 58);
          save.inbox.unshift({
            id: `msg-match-injury-${fixture.id}-${player.id}`,
            week: fixture.week,
            subject: `Injury update: ${player.firstName} ${player.lastName}`,
            body: `${injury.name} — ${injury.severity.toLowerCase()}. The medical team expects ${injury.recoveryWeeks} week${injury.recoveryWeeks === 1 ? "" : "s"} of recovery.`,
            read: false,
          });
        }
      } else {
        const participants = Object.keys(result.ratings);
        for (const pid of participants) {
          const p = save.world.players[pid];
          if (!p) continue;
          p.seasonStats.appearances += 1;
          p.seasonStats.lastRating = result.ratings[pid];
          p.condition = Number(clamp(playerCondition(p) - 18, 28, 100).toFixed(1));
          p.matchSharpness = Number(clamp(playerSharpness(p) + 7, 0, 100).toFixed(1));
        }
        for (const e of result.events) {
          if (e.type === MatchEventType.Goal || e.type === MatchEventType.PenaltyGoal) {
            if (e.playerId && save.world.players[e.playerId]) {
              save.world.players[e.playerId].seasonStats.goals += 1;
            }
          }
          if (e.type === MatchEventType.YellowCard && e.playerId && save.world.players[e.playerId]) {
            save.world.players[e.playerId].seasonStats.yellowCards += 1;
          }
        }
      }

      // morale swing
      const userIsHome = fixture.homeClubId === save.userClubId;
      const userGoals = userIsHome ? result.homeGoals : result.awayGoals;
      const oppGoals = userIsHome ? result.awayGoals : result.homeGoals;
      const delta = userGoals > oppGoals ? 4 : userGoals < oppGoals ? -4 : 1;
      const club = save.world.clubs[save.userClubId];
      for (const pid of club?.playerIds ?? []) {
        const p = save.world.players[pid];
        if (p) p.morale = clamp(p.morale + delta, 10, 100);
      }

      // news
      const oppId = userIsHome ? fixture.awayClubId : fixture.homeClubId;
      const opp = save.world.clubs[oppId];
      const userScore = `${userGoals}-${oppGoals}`;
      save.inbox.unshift({
        id: uid("msg"),
        week: save.season.currentWeek,
        subject:
          userGoals > oppGoals
            ? `Victory! ${club?.shortName} ${userScore} ${opp?.shortName}`
            : userGoals < oppGoals
              ? `Defeat: ${club?.shortName} ${userScore} ${opp?.shortName}`
              : `Draw: ${club?.shortName} ${userScore} ${opp?.shortName}`,
        body: describeResult(fixture, save),
        read: false,
      });

      // pop queue
      const queue = get().weekQueue.filter((f) => f.id !== fixture.id);
      if (queue.length > 0) {
        set({ save: { ...save }, weekQueue: queue });
        void persist();
        return { type: "match", fixtureId: queue[0].id };
      }

      const seasonEnd = finishWeek(save);
      set({ save: { ...save }, weekQueue: [] });
      void persist();
      return seasonEnd ? { type: "seasonEnd" } : { type: "none" };
    },

    updateTactics: async (t) => {
      commit((save) => {
        save.tacticalSetup = t;
      });
      await persist();
    },

    updatePlayerInstructions: async (instructions) => {
      commit((save) => {
        const club = save.world.clubs[save.userClubId];
        if (!club) return;
        for (const playerId of club.playerIds) {
          const p = save.world.players[playerId];
          if (!p || !(playerId in instructions)) continue;
          const text = instructions[playerId].trim();
          if (text) p.individualInstructions = text;
          else delete p.individualInstructions;
        }
      });
      await persist();
    },

    updateOpponentPlan: async (fixtureId, plan) => {
      const save = get().save;
      const fixture = save?.world.fixtures[fixtureId];
      if (!save || !fixture || (fixture.homeClubId !== save.userClubId && fixture.awayClubId !== save.userClubId)) {
        return null;
      }
      const opponentClubId = fixture.homeClubId === save.userClubId ? fixture.awayClubId : fixture.homeClubId;
      const ownPlayers = (save.world.clubs[save.userClubId]?.playerIds ?? [])
        .map((id) => save.world.players[id])
        .filter((player): player is Player => !!player);
      const opponentPlayers = (save.world.clubs[opponentClubId]?.playerIds ?? [])
        .map((id) => save.world.players[id])
        .filter((player): player is Player => !!player);
      const sanitized = sanitizeOpponentMatchPlan(plan, fixtureId, ownPlayers, opponentPlayers, "user");
      commit((current) => {
        current.opponentPlans ??= {};
        current.opponentPlans[fixtureId] = sanitized;
      });
      await persist();
      return sanitized;
    },

    updateTrainingPlan: async (changes) => {
      commit((save) => {
        save.trainingPlan ??= defaultTrainingPlan();
        if (changes.intensity) save.trainingPlan.intensity = changes.intensity;
        if (changes.teamFocus) save.trainingPlan.teamFocus = changes.teamFocus;
      });
      await persist();
    },

    togglePlayerRest: async (playerId) => {
      commit((save) => {
        if (!save.world.clubs[save.userClubId]?.playerIds.includes(playerId)) return;
        save.trainingPlan ??= defaultTrainingPlan();
        const resting = new Set(save.trainingPlan.restPlayerIds);
        if (resting.has(playerId)) resting.delete(playerId);
        else resting.add(playerId);
        save.trainingPlan.restPlayerIds = [...resting];
      });
      await persist();
    },

    setIndividualTraining: async (playerId, focus) => {
      commit((save) => {
        if (!save.world.clubs[save.userClubId]?.playerIds.includes(playerId)) return;
        save.trainingPlan ??= defaultTrainingPlan();
        if (focus) save.trainingPlan.individualFocus[playerId] = focus;
        else delete save.trainingPlan.individualFocus[playerId];
      });
      await persist();
    },

    markAllInboxRead: () => {
      commit((save) => {
        for (const m of save.inbox) m.read = true;
      });
    },

    addMessage: (subject, body) => {
      commit((save) => {
        save.inbox.unshift({
          id: uid("msg"),
          week: save.season.currentWeek,
          subject,
          body,
          read: false,
        });
      });
    },

    saveNow: async () => {
      await persist();
    },

    replaceSave: async (save) => {
      save.gameMode ??= GameMode.Iconic;
      save.trainingPlan ??= defaultTrainingPlan();
      save.trainingHistory ??= [];
      save.settings = normalizeGameSettings(save.settings);
      normalizeWorldFitness(save.world);
      set({ save: { ...save }, weekQueue: [], saveExists: true });
      await saveGame(save);
    },
  };
});

function competitionLabelFor(fixture: Fixture, save: GameSave): string {
  return fixture.competitionType === CompetitionType.League
    ? save.world.leagues[fixture.competitionId]?.name ?? "League"
    : fixture.competitionType === CompetitionType.Cup
      ? `Cup — ${CUP_ROUND_NAMES[fixture.round] ?? "Round"}`
      : fixture.round > 10
        ? continentalRoundName(fixture.round - 10)
        : `Continental — Group ${fixture.group ?? ""}`;
}

function describeResult(fixture: Fixture, save: GameSave): string {
  const home = save.world.clubs[fixture.homeClubId];
  const away = save.world.clubs[fixture.awayClubId];
  const comp =
    fixture.competitionType === CompetitionType.League
      ? save.world.leagues[fixture.competitionId]?.name ?? "League"
      : fixture.competitionType === CompetitionType.Cup
        ? `${CUP_ROUND_NAMES[fixture.round] ?? "Cup"} (${save.world.leagues[home?.leagueId ?? ""]?.name ?? ""} Cup)`
        : fixture.group
          ? `Continental group ${fixture.group}`
          : "Continental Championship";
  return `${home?.name} ${fixture.homeGoals} - ${fixture.awayGoals} ${away?.name}\nCompetition: ${comp}\nAttendance: ${home?.stadiumCapacity ? Math.round(home.stadiumCapacity * 0.85).toLocaleString() : "-"}`;
}

// ---------------------------------------------------------------------------
// Match context helpers (used by the match screen)
// ---------------------------------------------------------------------------

export interface MatchContext {
  fixture: Fixture;
  home: TeamSide;
  away: TeamSide;
  seed: number;
  competitionLabel: string;
}

export function getMatchContext(save: GameSave, fixtureId: string): MatchContext | null {
  const fixture = save.world.fixtures[fixtureId];
  if (!fixture) return null;

  const build = (clubId: string, isHome: boolean, isUser: boolean): TeamSide => {
    const club = save.world.clubs[clubId]!;
    const squad = club.playerIds
      .map((id) => save.world.players[id])
      .filter((p): p is Player => !!p);
    const manager = save.world.managers[club.managerId] ?? {
      id: "",
      firstName: "AI",
      lastName: "Manager",
      nationality: "Bretherland",
      personality: 0 as never,
      reputation: 50,
      clubId,
      formation: "4-3-3",
      playStyle: PlayStyle.Balanced,
      tacticalFlexibility: 8,
    };
    const managerMemory = isUser ? undefined : save.managerMemories?.[manager.id];
    const tactics = isUser
      ? save.tacticalSetup
      : adaptTacticsToManagerMemory(tacticsFromManager(manager), managerMemory, save.difficulty).tactics;
    const side = buildTeamSide({
      clubId,
      name: club.name,
      shortName: club.shortName,
      primaryColor: club.primaryColor,
      secondaryColor: club.secondaryColor,
      isHome,
      squad,
      tactics,
      isUserTeam: isUser,
      manager: {
        id: manager.id,
        name: `${manager.firstName} ${manager.lastName}`,
        tacticalFlexibility: manager.tacticalFlexibility,
        reputation: manager.reputation,
      },
    });

    if (!isUser && managerMemory) side.managerMemory = managerMemory;

    if (isUser) {
      side.opponentPlan = save.opponentPlans?.[fixtureId];
      const roster = buildInstructionRoster(
        squad,
        side.starters,
        side.roles,
        side.displayNumbers,
        tactics.playerRoles,
        tactics.playStyle,
      );
      const plans = compileInstructionPlans(
        squad,
        tactics.teamInstructions ?? "",
        tactics.instructionCache,
        roster,
        tactics.teamDirectiveOverrides,
        tactics.playerDirectiveOverrides,
      );
      side.teamDirectives = plans.teamDirectives;
      side.directives = plans.playerDirectives;
    }

    // apply user's dragged pitch positions (drawn in home orientation)
    const overrides = tactics.positionOverrides;
    if (isUser && Object.keys(overrides).length > 0) {
      side.basePositions = side.basePositions.map((pos, i) => {
        const pid = side.starters[i]?.id;
        const o = pid ? overrides[pid] : undefined;
        if (!o) return pos;
        return isHome ? { x: o.x, y: o.y } : { x: 1000 - o.x, y: o.y };
      });
    }
    return side;
  };

  const competitionLabel = competitionLabelFor(fixture, save);

  return {
    fixture,
    home: build(fixture.homeClubId, true, fixture.homeClubId === save.userClubId),
    away: build(fixture.awayClubId, false, fixture.awayClubId === save.userClubId),
    seed: (hashStr(fixture.id) ^ save.seed) >>> 0,
    competitionLabel,
  };
}

function continentalRoundName(round: number): string {
  return ["", "Round of 16", "Quarter Final", "Semi Final", "Final"][round] ?? "Knockout";
}

export function leagueTableOf(save: GameSave, leagueId: string) {
  const league: League | undefined = save.world.leagues[leagueId];
  if (!league) return [];
  return calculateStandings(Object.values(save.world.fixtures), leagueId, league.clubIds);
}

export function fixturesOf(save: GameSave, competitionId: string): Fixture[] {
  return Object.values(save.world.fixtures).filter((f) => f.competitionId === competitionId);
}

export { fixturesForWeek, CONTINENTAL_ID, CUP_ID };
