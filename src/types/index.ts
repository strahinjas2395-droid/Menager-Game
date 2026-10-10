/**
 * Football Manager Continental — Core Type Definitions
 * All game data shapes. Stats are 1-20 (no overall rating anywhere).
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum PrimaryPosition {
  GK = "GK",
  RB = "RB",
  CB = "CB",
  LB = "LB",
  CDM = "CDM",
  CM = "CM",
  CAM = "CAM",
  RW = "RW",
  LW = "LW",
  ST = "ST",
}

export enum PlaystyleTag {
  ClinicalFinisher = "ClinicalFinisher",
  Poacher = "Poacher",
  TargetMan = "TargetMan",
  Playmaker = "Playmaker",
  BoxToBox = "BoxToBox",
  BallWinner = "BallWinner",
  Dribbler = "Dribbler",
  Winger = "Winger",
  Crosser = "Crosser",
  LongShotSpecialist = "LongShotSpecialist",
  SetPieceSpecialist = "SetPieceSpecialist",
  AerialThreat = "AerialThreat",
  BallPlayingDefender = "BallPlayingDefender",
  Sweeper = "Sweeper",
  FullBackRunner = "FullBackRunner",
  PressingForward = "PressingForward",
  CreativeInsideForward = "CreativeInsideForward",
  /** Explodes into open grass with longer touches and tries to win foot races. */
  PaceAbuser = "PaceAbuser",
  /** Sees and executes passes into a runner's future path. */
  ThroughBallSpecialist = "ThroughBallSpecialist",
  /** Uses first touch, balance and composure to escape pressure. */
  PressResistant = "PressResistant",
  /** Times movement between and beyond defensive lines. */
  SpaceInterpreter = "SpaceInterpreter",
  /** Controls difficult or fast service without killing the attack. */
  FirstTouchSpecialist = "FirstTouchSpecialist",
  /** Reaches the byline and deliberately finds late runners. */
  CutbackSpecialist = "CutbackSpecialist",
  /** Reads passing lanes early and steps in before the receiver. */
  Interceptor = "Interceptor",
  Leader = "Leader",
}

export enum Personality {
  Professional = "Professional",
  Ambitious = "Ambitious",
  Perfectionist = "Perfectionist",
  Relaxed = "Relaxed",
  Spirited = "Spirited",
  Reserved = "Reserved",
  FairlyProfessional = "FairlyProfessional",
  Temperamental = "Temperamental",
  Mercenary = "Mercenary",
  Flaky = "Flaky",
}

export enum ManagerPersonality {
  Normal = "Normal",
  Ambitious = "Ambitious",
  LaidBack = "LaidBack",
  Demanding = "Demanding",
  MediaShy = "MediaShy",
  Motivational = "Motivational",
  TacticallyObsessed = "TacticallyObsessed",
}

export enum TempoSetting {
  VerySlow = 0,
  Slow = 1,
  Normal = 2,
  Fast = 3,
  VeryFast = 4,
}

export enum DefensiveLine {
  VeryDeep = 0,
  Deep = 1,
  Normal = 2,
  High = 3,
  VeryHigh = 4,
}

export enum PressingIntensity {
  None = 0,
  Low = 1,
  Standard = 2,
  High = 3,
  Extreme = 4,
}

export enum WidthSetting {
  VeryNarrow = 0,
  Narrow = 1,
  Normal = 2,
  Wide = 3,
  VeryWide = 4,
}

export enum MentalityLevel {
  UltraDefensive = 0,
  Defensive = 1,
  Cautious = 2,
  Balanced = 3,
  Positive = 4,
  Attacking = 5,
  UltraAttacking = 6,
}

export enum PlayStyle {
  PossessionBased = "PossessionBased",
  TikiTaka = "TikiTaka",
  DirectCounterAttack = "DirectCounterAttack",
  GegenpressingStyle = "GegenpressingStyle",
  LongBallDirect = "LongBallDirect",
  WingPlay = "WingPlay",
  ParkTheBus = "ParkTheBus",
  TotalFootball = "TotalFootball",
  RouteOne = "RouteOne",
  Balanced = "Balanced",
}

export enum Difficulty {
  Beginner = "Beginner",
  Amateur = "Amateur",
  SemiPro = "SemiPro",
  Professional = "Professional",
  WorldClass = "WorldClass",
  Legendary = "Legendary",
  Ultimate = "Ultimate",
  /** Legacy value retained so careers created before the expanded ladder load safely. */
  Legend = "Legend",
}

export enum CompetitionType {
  League = "League",
  Cup = "Cup",
  Continental = "Continental",
}

export enum MatchEventType {
  KickOff = "KickOff",
  Goal = "Goal",
  Chance = "Chance",
  ShotSaved = "ShotSaved",
  ShotWide = "ShotWide",
  Corner = "Corner",
  ThrowIn = "ThrowIn",
  GoalKick = "GoalKick",
  FreeKick = "FreeKick",
  Foul = "Foul",
  YellowCard = "YellowCard",
  RedCard = "RedCard",
  Substitution = "Substitution",
  HalfTime = "HalfTime",
  FullTime = "FullTime",
  PenaltyGoal = "PenaltyGoal",
  PenaltyMissed = "PenaltyMissed",
  Injury = "Injury",
  Offside = "Offside",
  /** Observable evidence that a natural-language tactical instruction fired. */
  Instruction = "Instruction",
}

export enum TimeWasting {
  Never = "Never",
  Late = "Late",
  Always = "Always",
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface PlayerContract {
  /** Club the player is contracted to */
  clubId: string;
  /** Weekly wage in currency units */
  weeklyWage: number;
  /** Years left on current deal */
  contractYearsRemaining: number;
  /** Estimated market value */
  transferValue: number;
}

export type InjurySeverity = "Knock" | "Minor" | "Moderate" | "Serious";
export type InjurySource = "match" | "training";
export type TrainingDevelopmentFocus = "Attacking" | "Defending" | "Possession" | "Physical" | "SetPieces";
export type TeamTrainingFocus = "Balanced" | "Recovery" | TrainingDevelopmentFocus;
export type TrainingIntensity = "Low" | "Normal" | "High";

export interface PlayerInjury {
  id: string;
  name: string;
  bodyArea: string;
  severity: InjurySeverity;
  source: InjurySource;
  occurredSeason: number;
  occurredWeek: number;
  totalWeeks: number;
  weeksRemaining: number;
  rehabProgress: number;
}

export interface Player {
  // Identity
  id: string;
  /** Free-text manager note; interpreted to a validated cached tactical plan. */
  individualInstructions?: string;
  firstName: string;
  lastName: string;
  nationality: string;
  /** 16-38 */
  age: number;
  /** cm */
  height: number;
  /** kg */
  weight: number;
  preferredFoot: "Left" | "Right";

  // Position
  primaryPosition: PrimaryPosition;
  secondaryPositions: PrimaryPosition[];

  // Technical (1-20)
  ballControl: number;
  dribbling: number;
  shortPassing: number;
  longPassing: number;
  crossing: number;
  finishing: number;
  longShots: number;
  heading: number;
  freeKickAccuracy: number;
  penaltyTaking: number;
  technique: number;
  volleying: number;

  // Physical (1-20)
  pace: number;
  acceleration: number;
  strength: number;
  jumping: number;
  agility: number;
  balance: number;
  naturalFitness: number;

  // Mental (1-20)
  anticipation: number;
  composure: number;
  concentration: number;
  creativity: number;
  decisions: number;
  determination: number;
  flair: number;
  leadership: number;
  offTheBall: number;
  positioning: number;
  teamwork: number;
  workRate: number;
  aggression: number;
  bravery: number;

  // Defensive (1-20)
  marking: number;
  tackling: number;
  slideTackling: number;
  interceptions: number;
  aerialDuels: number;

  // Goalkeeping (1-20)
  reflexes: number;
  shotStopping: number;
  oneOnOnes: number;
  communication: number;
  punching: number;
  throwing: number;
  kicking: number;
  handling: number;
  sweeping: number;
  distributionGK: number;

  // Playstyles
  playstyles: PlaystyleTag[];

  // Contract
  contract: PlayerContract;

  // Personal
  /** 0-100 physical readiness; optional only for careers saved before fitness existed. */
  condition?: number;
  /** 0-100 match rhythm built through training and appearances. */
  matchSharpness?: number;
  /** Active medical absence; null/omitted means available. */
  injury?: PlayerInjury | null;
  /** Accumulated focus work used for gradual, attribute-specific development. */
  trainingProgress?: Partial<Record<TrainingDevelopmentFocus, number>>;
  /** 0-100 */
  morale: number;
  personality: Personality;
  /** 1-100 */
  reputation: number;

  // Development (hidden)
  /** 4-20, hidden potential */
  potentialCeiling: number;
  /** growth multiplier */
  developmentRate: number;
  isYouth: boolean;

  shirtNumber: number;

  // Season stats (current season)
  seasonStats: PlayerSeasonStats;
}

export interface PlayerSeasonStats {
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  /** last match rating 1-10, 0 = no appearance */
  lastRating: number;
}

// ---------------------------------------------------------------------------
// Club / League / Manager
// ---------------------------------------------------------------------------

export interface ClubFacilities {
  /** 1-10 */
  training: number;
  /** 1-10 */
  youth: number;
  /** 1-10 */
  stadium: number;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  stadiumName: string;
  stadiumCapacity: number;
  leagueId: string;
  /** transfer budget */
  budget: number;
  wageBudget: number;
  /** 1-100 */
  reputation: number;
  fanBaseSize: number;
  playerIds: string[];
  managerId: string;
  facilities: ClubFacilities;
  /** 1-20 league position (season state, 0 = not set) */
  leaguePosition: number;
}

export interface League {
  id: string;
  name: string;
  nation: string;
  nationFlag: string;
  /** 1 = strongest */
  tier: number;
  /** 0-100 */
  reputation: number;
  clubIds: string[];
}

export interface Manager {
  id: string;
  firstName: string;
  lastName: string;
  nationality: string;
  personality: ManagerPersonality;
  /** 1-100 */
  reputation: number;
  clubId: string;
  formation: string;
  playStyle: PlayStyle;
  /** 1-20, affects in-match adjustments */
  tacticalFlexibility: number;
}

// ---------------------------------------------------------------------------
// Tactics
// ---------------------------------------------------------------------------

export interface FormationSlot {
  role: string;
  baseX: number;
  baseY: number;
}

export interface Formation {
  name: string;
  positions: FormationSlot[];
}

export interface SetPieceTakers {
  cornerLeftId: string | null;
  cornerRightId: string | null;
  freeKickId: string | null;
  penaltyId: string | null;
  captainId: string | null;
}

export type PlayerDuty = "Defend" | "Support" | "Attack";

export type TacticalPlayerRole =
  | "Goalkeeper"
  | "SweeperKeeper"
  | "CentralDefender"
  | "BallPlayingDefender"
  | "Stopper"
  | "CoverDefender"
  | "WideCentreBack"
  | "FullBack"
  | "WingBack"
  | "InvertedFullBack"
  | "Anchor"
  | "HalfBack"
  | "BallWinningMidfielder"
  | "DeepLyingPlaymaker"
  | "CentralMidfielder"
  | "BoxToBoxMidfielder"
  | "Mezzala"
  | "AdvancedPlaymaker"
  | "AttackingMidfielder"
  | "ShadowStriker"
  | "Winger"
  | "InsideForward"
  | "InvertedWinger"
  | "WidePlaymaker"
  | "AdvancedForward"
  | "PressingForward"
  | "TargetForward"
  | "Poacher"
  | "FalseNine"
  | "CompleteForward"
  | "DeepLyingForward";

export interface PlayerRoleAssignment {
  role: TacticalPlayerRole;
  duty: PlayerDuty;
}

export interface TacticalDirectives {
  // Shape and movement
  holdPosition?: boolean;
  forwardRuns?: boolean;
  roam?: boolean;
  stayWide?: boolean;
  cutInside?: boolean;
  /** A genuine defensive assignment, even when the player's nominal role is attacking. */
  defensiveDuty?: boolean;

  // Decisions in possession
  shootFromDistance?: boolean;
  avoidShooting?: boolean;
  dribbleMore?: boolean;
  dribbleLess?: boolean;
  riskyPasses?: boolean;
  shortPassing?: boolean;
  directPassing?: boolean;
  targetMan?: boolean;
  earlyCross?: boolean;
  switchPlay?: boolean;
  /** Clear rather than trying to retain the ball in dangerous defensive situations. */
  clearImmediately?: boolean;

  // Work without the ball
  tightMarking?: boolean;
  pressHard?: boolean;
  pressLess?: boolean;
  conserveEnergy?: boolean;

  // Deliberate service to a teammate. The id is validated against the current squad.
  preferredTargetId?: string;
  preferredTargetName?: string;
  /** 0..1; values near 1 make the recipient the first option whenever plausible. */
  targetPriority?: number;
  targetDelivery?: "ground" | "aerial" | "mixed";
}

export type MatchPlanPressing = "normal" | "pressOnReceive" | "standOff";
export type MatchPlanShowOnto = "normal" | "inside" | "outside" | "weakFoot";
export type MatchPlanAttackApproach = "none" | "pace" | "dribble" | "aerial";

/** A fixture-specific plan against one exact, validated opponent. */
export interface OpponentPlayerPlan {
  targetPlayerId: string;
  targetPlayerName: string;
  /** Exact player charged with the primary marking job; omitted for zonal cover. */
  markerPlayerId?: string;
  markerPlayerName?: string;
  tightMarking: boolean;
  pressing: MatchPlanPressing;
  showOnto: MatchPlanShowOnto;
  doubleTeam: boolean;
  preventCrosses: boolean;
  attackApproach: MatchPlanAttackApproach;
}

export interface OpponentMatchPlan {
  fixtureId: string;
  source: "user" | "ai";
  instructions: OpponentPlayerPlan[];
}

export interface OpponentPlanChangeRecord {
  side: "home" | "away";
  minute: number;
  plan: OpponentMatchPlan;
}

export interface TacticalPlayerAssignment {
  playerId: string;
  playerName: string;
  directives: TacticalDirectives;
}

export interface TacticalInstructionInterpretation {
  schemaVersion: 1;
  input: string;
  scope: "team" | "player";
  subjectPlayerId?: string;
  contextFingerprint: string;
  /** Applies to the whole team for team notes, or to the selected subject. */
  directives: TacticalDirectives;
  /** A team note may address a named/numbered/role-specific player or group. */
  assignments?: TacticalPlayerAssignment[];
  /** Short, manager-facing statements generated from the semantic result. */
  understood: string[];
  /** Meaning that the current simulation cannot represent safely. */
  unsupported: string[];
  /** local-ai runs in the browser; ai is retained for older saves/test adapters. */
  source: "local-ai" | "ai" | "offline";
  model?: string;
  createdAt: number;
}

export interface TacticalInstructionCache {
  team?: TacticalInstructionInterpretation;
  players: Record<string, TacticalInstructionInterpretation>;
}

export interface TacticalSetup {
  formation: string;
  playStyle: PlayStyle;
  tempo: TempoSetting;
  passingLength: TempoSetting; // reuse 0-4 scale (VeryShort -> VeryDirect)
  defensiveLine: DefensiveLine;
  pressing: PressingIntensity;
  width: WidthSetting;
  mentality: MentalityLevel;
  timeWasting: TimeWasting;
  offsideTrap: boolean;
  counterAttack: boolean;
  /** Natural-language instruction for the whole side. */
  teamInstructions?: string;
  /** Validated semantic plans. Text remains the source of truth; stale entries are ignored. */
  instructionCache?: TacticalInstructionCache;
  /** Explicit role/duty overrides by player id; omitted entries use a position/style-aware default. */
  playerRoles?: Record<string, PlayerRoleAssignment>;
  /** playerId -> pitch position override (x,y in 0-1000 / 0-650) */
  positionOverrides: Record<string, { x: number; y: number }>;
  setPieces: SetPieceTakers;
}

// ---------------------------------------------------------------------------
// Fixtures / Matches / Standings
// ---------------------------------------------------------------------------

export interface Fixture {
  id: string;
  competitionType: CompetitionType;
  /** league id, "cup", or "continental" */
  competitionId: string;
  round: number;
  week: number;
  homeClubId: string;
  awayClubId: string;
  played: boolean;
  homeGoals: number;
  awayGoals: number;
  /** penalties result for knockouts, null if not decided by pens */
  homePens?: number;
  awayPens?: number;
  /** continental group name ("A".."H") for group fixtures */
  group?: string;
}

export interface CupState {
  /** next round to schedule: 1=R1 2=R2 3=QF 4=SF 5=F, 0 = finished */
  round: number;
  championId: string | null;
}

export interface ContinentalGroup {
  name: string;
  clubIds: string[];
}

export interface ContinentalState {
  /** populated at season start (8 groups of 4) */
  groups: ContinentalGroup[];
  /** 1=R16, 2=QF, 3=SF, 4=Final, 5=done */
  koRound: number;
  championId: string | null;
}

export interface Standing {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  clubId?: string;
  playerId?: string;
  text: string;
}

export interface MatchStats {
  possessionHome: number;
  shotsHome: number;
  shotsOnTargetHome: number;
  passesAttemptedHome: number;
  passesCompletedHome: number;
  tacklesHome: number;
  foulsHome: number;
  cornersHome: number;
  carriesHome: number;
  throwInsHome: number;
  crossesHome: number;
  throughBallsHome: number;
  dribblesAttemptedHome: number;
  dribblesCompletedHome: number;
  knockOnsHome: number;
  possessionAway: number;
  shotsAway: number;
  shotsOnTargetAway: number;
  passesAttemptedAway: number;
  passesCompletedAway: number;
  tacklesAway: number;
  foulsAway: number;
  cornersAway: number;
  carriesAway: number;
  throwInsAway: number;
  crossesAway: number;
  throughBallsAway: number;
  dribblesAttemptedAway: number;
  dribblesCompletedAway: number;
  knockOnsAway: number;
}

export const MATCH_HEATMAP_COLUMNS = 12;
export const MATCH_HEATMAP_ROWS = 8;

/** Durable action ledger for one footballer in one match. */
export interface PlayerMatchAnalysis {
  playerId: string;
  clubId: string;
  side: "home" | "away";
  playerName: string;
  shirtNumber: number;
  position: string;
  /** Structured tactical job used in this appearance; absent from legacy reports. */
  tacticalRole?: TacticalPlayerRole;
  duty?: PlayerDuty;
  started: boolean;
  minuteOn: number;
  minuteOff: number;
  minutesPlayed: number;
  rating: number;
  conditionBefore?: number;
  conditionAfter?: number;
  touches: number;
  carries: number;
  passesAttempted: number;
  passesCompleted: number;
  passesFailed: number;
  keyPasses: number;
  throughBalls: number;
  crossesAttempted: number;
  crossesCompleted: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;
  dribblesAttempted: number;
  dribblesCompleted: number;
  possessionLost: number;
  tacklesAttempted: number;
  tacklesWon: number;
  interceptions: number;
  recoveries: number;
  clearances: number;
  blocks: number;
  aerialDuels: number;
  aerialDuelsWon: number;
  foulsCommitted: number;
  foulsWon: number;
  offsides: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  distanceCoveredKm: number;
  sprints: number;
  /** Row-major 12x8 samples, always viewed with this player's team attacking right. */
  heatmap: number[];
}

export type TacticalEventType =
  | "pass"
  | "throughBall"
  | "cross"
  | "carry"
  | "dribble"
  | "shot"
  | "clearance"
  | "tackle"
  | "interception"
  | "recovery"
  | "foul"
  | "save";

export type TacticalEventOutcome =
  | "attempted"
  | "complete"
  | "failed"
  | "won"
  | "lost"
  | "goal"
  | "saved"
  | "blocked"
  | "wide"
  | "foul";

export type TacticalMatchPhase =
  | "buildUp"
  | "settledAttack"
  | "counterAttack"
  | "defensiveTransition"
  | "setPiece";

/** Durable, coordinate-level action captured directly by the simulation. */
export interface TacticalEvent {
  id: string;
  second: number;
  minute: number;
  side: "home" | "away";
  clubId: string;
  type: TacticalEventType;
  outcome: TacticalEventOutcome;
  playerId?: string;
  relatedPlayerId?: string;
  /** Team-oriented coordinates: the acting side always attacks from x=0 to x=1000. */
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  pressure: number;
  phase: TacticalMatchPhase;
  possessionId: number;
  sequenceIndex: number;
  qualifier?: string;
  expectedGoals?: number;
}

export interface TacticalTeamSummary {
  side: "home" | "away";
  expectedGoals: number;
  passesAttempted: number;
  passesCompleted: number;
  progressivePasses: number;
  finalThirdEntries: number;
  boxEntries: number;
  highRegains: number;
  turnovers: number;
  pressingActions: number;
  possessionSequences: number;
  averageSequenceActions: number;
  directAttacks: number;
  leftChannelActions: number;
  centralChannelActions: number;
  rightChannelActions: number;
  fieldTilt: number;
  ppda: number;
}

export interface PassNetworkEdge {
  side: "home" | "away";
  fromPlayerId: string;
  toPlayerId: string;
  completed: number;
  progressive: number;
}

export interface MatchInjuryRecord {
  playerId: string;
  playerName: string;
  clubId: string;
  side: "home" | "away";
  minute: number;
  name: string;
  bodyArea: string;
  severity: InjurySeverity;
  recoveryWeeks: number;
}

export interface TacticalChangeRecord {
  side: "home" | "away";
  clubId: string;
  minute: number;
  source: "user" | "ai";
  reason: string;
  formationBefore: string;
  formationAfter: string;
  changes: string[];
  playerOffId?: string;
  playerOnId?: string;
}

/** Versioned telemetry embedded in a result so reports survive future seasons. */
export interface MatchAnalysis {
  /** v1 contained player totals; v2 adds coordinate-level tactical events. */
  schemaVersion: 1 | 2;
  heatmapColumns: typeof MATCH_HEATMAP_COLUMNS;
  heatmapRows: typeof MATCH_HEATMAP_ROWS;
  generatedAtMinute: number;
  initialHomeFormation: string;
  initialAwayFormation: string;
  finalHomeFormation: string;
  finalAwayFormation: string;
  players: Record<string, PlayerMatchAnalysis>;
  tacticalChanges: TacticalChangeRecord[];
  /** Event stream and derived tactical views are optional on legacy reports. */
  tacticalEvents?: TacticalEvent[];
  teamSummaries?: {
    home: TacticalTeamSummary;
    away: TacticalTeamSummary;
  };
  passNetworks?: {
    home: PassNetworkEdge[];
    away: PassNetworkEdge[];
  };
  injuries?: MatchInjuryRecord[];
  initialHomePlayStyle?: PlayStyle;
  initialAwayPlayStyle?: PlayStyle;
  finalHomePlayStyle?: PlayStyle;
  finalAwayPlayStyle?: PlayStyle;
  /** Fixture plans actually used by each side, retained for post-match review. */
  opponentPlans?: {
    home?: OpponentMatchPlan;
    away?: OpponentMatchPlan;
  };
  /** Initial and live plan versions in the order they physically took effect. */
  opponentPlanChanges?: OpponentPlanChangeRecord[];
}

export interface MatchResult {
  fixtureId: string;
  homeClubId: string;
  awayClubId: string;
  homeGoals: number;
  awayGoals: number;
  homePens?: number;
  awayPens?: number;
  stats: MatchStats;
  ratings: Record<string, number>;
  events: MatchEvent[];
  /** Added in save schema v1.1; absent on reports recorded by older careers. */
  analysis?: MatchAnalysis;
  /** Historical display metadata survives fixture regeneration at season end. */
  seasonYear?: number;
  week?: number;
  competitionLabel?: string;
  homeClubName?: string;
  awayClubName?: string;
}

// ---------------------------------------------------------------------------
// Inbox / News
// ---------------------------------------------------------------------------

export interface InboxMessage {
  id: string;
  week: number;
  subject: string;
  body: string;
  read: boolean;
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export interface TransferOffer {
  id: string;
  playerId: string;
  fromClubId: string;
  toClubId: string;
  amount: number;
  status: "pending" | "accepted" | "rejected" | "countered";
  counterAmount?: number;
  week: number;
}

export interface ContractOffer {
  playerId: string;
  wage: number;
  years: number;
}

// ---------------------------------------------------------------------------
// Save game
// ---------------------------------------------------------------------------

export interface SeasonState {
  seasonYear: number;
  currentWeek: number;
  totalWeeks: number;
  transferWindowOpen: boolean;
}

export interface WorldDatabase {
  players: Record<string, Player>;
  clubs: Record<string, Club>;
  leagues: Record<string, League>;
  managers: Record<string, Manager>;
  fixtures: Record<string, Fixture>;
}

export interface ManagerMemoryPlayer {
  playerId: string;
  playerName: string;
  meetings: number;
  goals: number;
  assists: number;
  averageRating: number;
  shots: number;
  keyPasses: number;
  lastSeenSeason: number;
  lastSeenWeek: number;
}

export interface ManagerMemoryEncounter {
  fixtureId: string;
  seasonYear: number;
  week: number;
  result: "W" | "D" | "L";
  goalsFor: number;
  goalsAgainst: number;
  userFormation: string;
  userPlayStyle: PlayStyle;
  userExpectedGoals: number;
  userFieldTilt: number;
  userHighRegains: number;
  topThreatPlayerIds: string[];
}

/** Persistent knowledge held by one exact AI manager across fixtures/seasons. */
export interface PersistentManagerMemory {
  schemaVersion: 1;
  managerId: string;
  clubId: string;
  meetings: number;
  lastUpdatedSeason: number;
  lastUpdatedWeek: number;
  encounters: ManagerMemoryEncounter[];
  observedFormations: Record<string, number>;
  observedPlayStyles: Partial<Record<PlayStyle, number>>;
  playerKnowledge: Record<string, ManagerMemoryPlayer>;
  tacticalLessons: string[];
  confidence: number;
}

export interface TrainingPlan {
  intensity: TrainingIntensity;
  teamFocus: TeamTrainingFocus;
  /** Exact players excused from normal work for this week's recovery. */
  restPlayerIds: string[];
  /** Optional identity-bound individual development work. */
  individualFocus: Record<string, TrainingDevelopmentFocus>;
  /** Guards imported/replayed state from processing one calendar week twice. */
  lastProcessed?: string;
}

export interface TrainingWeekReport {
  seasonYear: number;
  week: number;
  conditionImproved: string[];
  developed: { playerId: string; attribute: string; amount: number }[];
  injuries: string[];
  returned: string[];
}

export interface GameSave {
  version: number;
  seed: number;
  managerName: string;
  managerNationality: string;
  difficulty: Difficulty;
  userClubId: string;
  season: SeasonState;
  world: WorldDatabase;
  tacticalSetup: TacticalSetup;
  cup: CupState;
  continental: ContinentalState;
  inbox: InboxMessage[];
  offers: TransferOffer[];
  /** Permanent user-match reports keyed by fixtureId, retained across seasons. */
  results: Record<string, MatchResult>;
  /** User-authored, fixture-specific plans. Optional for pre-feature saves. */
  opponentPlans?: Record<string, OpponentMatchPlan>;
  /** Knowledge accumulated by exact AI manager identity. Optional for older careers. */
  managerMemories?: Record<string, PersistentManagerMemory>;
  /** Weekly workload and development configuration. Optional for older careers. */
  trainingPlan?: TrainingPlan;
  trainingHistory?: TrainingWeekReport[];
  settings: GameSettings;
  savedAt: number;
}

export interface GameSettings {
  /** Legacy setting retained only so older imported saves remain readable; match pace is now fixed. */
  defaultMatchSpeed?: 1 | 2 | 4 | 8;
  soundVolume: number;
  musicVolume: number;
  vibration: boolean;
  autoPressConference: boolean;
}
