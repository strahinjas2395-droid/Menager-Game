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
  Amateur = "Amateur",
  SemiPro = "SemiPro",
  Professional = "Professional",
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

export interface Player {
  // Identity
  id: string;
  /** Free-text individual instructions from the manager; parsed by engine/directives.ts */
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
  possessionAway: number;
  shotsAway: number;
  shotsOnTargetAway: number;
  passesAttemptedAway: number;
  passesCompletedAway: number;
  tacklesAway: number;
  foulsAway: number;
  cornersAway: number;
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
  /** quick-sim results keyed by fixtureId */
  results: Record<string, MatchResult>;
  settings: GameSettings;
  savedAt: number;
}

export interface GameSettings {
  defaultMatchSpeed: 1 | 2 | 4 | 8;
  soundVolume: number;
  musicVolume: number;
  vibration: boolean;
  autoPressConference: boolean;
}
