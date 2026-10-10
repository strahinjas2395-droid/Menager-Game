import { MatchEventType, type GameSettings, type MatchEvent } from "@/types";

export interface MatchAudioPreferences {
  enabled: boolean;
  effectsVolume: number;
  ambienceVolume: number;
}

export type MatchAudioCue =
  | "whistle"
  | "doubleWhistle"
  | "fullTimeWhistle"
  | "kick"
  | "goal"
  | "chance"
  | "save"
  | "miss"
  | "restart"
  | "card";

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Runtime-safe preferences for current and pre-audio career saves. */
export function resolveMatchAudioPreferences(
  settings?: Partial<GameSettings> | null,
): MatchAudioPreferences {
  const soundVolume = typeof settings?.soundVolume === "number" && Number.isFinite(settings.soundVolume)
    ? settings.soundVolume
    : 0.7;
  const ambienceVolume = typeof settings?.musicVolume === "number" && Number.isFinite(settings.musicVolume)
    ? settings.musicVolume
    : 0.4;
  return {
    enabled: settings?.audioEnabled !== false,
    effectsVolume: clamp01(soundVolume),
    ambienceVolume: clamp01(ambienceVolume),
  };
}

/** Match commentary events intentionally map to a small, non-repetitive sound palette. */
export function audioCueForMatchEvent(type: MatchEventType): MatchAudioCue | null {
  switch (type) {
    case MatchEventType.Goal:
    case MatchEventType.PenaltyGoal:
      return "goal";
    case MatchEventType.Chance:
      return "chance";
    case MatchEventType.ShotSaved:
      return "save";
    case MatchEventType.ShotWide:
    case MatchEventType.PenaltyMissed:
      return "miss";
    case MatchEventType.Corner:
    case MatchEventType.GoalKick:
    case MatchEventType.ThrowIn:
      return "restart";
    case MatchEventType.FreeKick:
    case MatchEventType.Substitution:
      return "whistle";
    // Foul/offside commentary is immediately followed by the physical free-kick
    // event; sounding both would produce an artificial doubled whistle.
    case MatchEventType.Foul:
    case MatchEventType.Offside:
      return null;
    case MatchEventType.YellowCard:
    case MatchEventType.RedCard:
      return "card";
    case MatchEventType.HalfTime:
      return "doubleWhistle";
    case MatchEventType.FullTime:
      return "fullTimeWhistle";
    // Kickoff timing comes from the physical phase: whistle while the ball is
    // stationary, then a separate kick exactly when it leaves the centre spot.
    case MatchEventType.KickOff:
    case MatchEventType.Injury:
    case MatchEventType.Instruction:
    default:
      return null;
  }
}

interface QueuedCue {
  cue: MatchAudioCue;
  queuedAt: number;
}

type AudioContextConstructor = new (contextOptions?: AudioContextOptions) => AudioContext;

function browserAudioContext(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? candidate.webkitAudioContext ?? null;
}

/**
 * Lightweight procedural match audio. It ships no copyrighted recordings and
 * performs no network requests: Web Audio synthesizes crowd texture, whistles,
 * kicks and reactions locally. Browsers that require a gesture are handled by
 * `unlock`, while stale blocked sounds are discarded instead of replayed late.
 */
export class MatchAudioController {
  private preferences: MatchAudioPreferences;
  private context: AudioContext | null = null;
  private effectsGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private crowdSource: AudioBufferSourceNode | null = null;
  private crowdLfo: OscillatorNode | null = null;
  private pending: QueuedCue[] = [];
  private disposed = false;

  constructor(settings?: Partial<GameSettings> | null) {
    this.preferences = resolveMatchAudioPreferences(settings);
  }

  updateSettings(settings?: Partial<GameSettings> | null): void {
    this.preferences = resolveMatchAudioPreferences(settings);
    this.applyVolumes();
    if (this.preferences.enabled) {
      void this.unlock();
    } else {
      this.pending = [];
      void this.context?.suspend().catch(() => undefined);
    }
  }

  /** Best-effort autoplay; a later pointer/key gesture can call unlock again. */
  async start(): Promise<boolean> {
    return this.unlock();
  }

  async unlock(): Promise<boolean> {
    if (this.disposed || !this.preferences.enabled) return false;
    const context = this.ensureContext();
    if (!context) return false;
    try {
      if (context.state === "suspended") await context.resume();
    } catch {
      return false;
    }
    if (context.state !== "running") return false;
    this.startCrowd();
    this.flushPending();
    return true;
  }

  playEvent(event: MatchEvent | MatchEventType): void {
    const type = typeof event === "string" ? event : event.type;
    const cue = audioCueForMatchEvent(type);
    if (cue) this.playCue(cue);
  }

  playCue(cue: MatchAudioCue): void {
    if (this.disposed || !this.preferences.enabled) return;
    const context = this.ensureContext();
    if (!context) return;
    if (context.state !== "running") {
      this.pending.push({ cue, queuedAt: Date.now() });
      this.pending = this.pending.slice(-8);
      void this.unlock();
      return;
    }
    this.renderCue(cue);
  }

  async stop(): Promise<void> {
    this.disposed = true;
    this.pending = [];
    try { this.crowdSource?.stop(); } catch { /* already stopped */ }
    try { this.crowdLfo?.stop(); } catch { /* already stopped */ }
    this.crowdSource = null;
    this.crowdLfo = null;
    const context = this.context;
    this.context = null;
    this.effectsGain = null;
    this.ambienceGain = null;
    this.masterGain = null;
    if (context && context.state !== "closed") {
      await context.close().catch(() => undefined);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context && this.context.state !== "closed") return this.context;
    const AudioContextClass = browserAudioContext();
    if (!AudioContextClass || this.disposed) return null;
    try {
      const context = new AudioContextClass({ latencyHint: "interactive" });
      const master = context.createGain();
      const effects = context.createGain();
      const ambience = context.createGain();
      effects.connect(master);
      ambience.connect(master);
      master.connect(context.destination);
      this.context = context;
      this.masterGain = master;
      this.effectsGain = effects;
      this.ambienceGain = ambience;
      this.applyVolumes();
      return context;
    } catch {
      return null;
    }
  }

  private applyVolumes(): void {
    const context = this.context;
    if (!context) return;
    const at = context.currentTime;
    const enabled = this.preferences.enabled ? 1 : 0;
    this.masterGain?.gain.setTargetAtTime(enabled, at, 0.025);
    this.effectsGain?.gain.setTargetAtTime(
      Math.pow(this.preferences.effectsVolume, 1.15) * 0.58,
      at,
      0.025,
    );
    this.ambienceGain?.gain.setTargetAtTime(
      Math.pow(this.preferences.ambienceVolume, 1.18) * 0.2,
      at,
      0.08,
    );
  }

  private startCrowd(): void {
    const context = this.context;
    const destination = this.ambienceGain;
    if (!context || !destination || this.crowdSource || this.preferences.ambienceVolume <= 0) return;

    const seconds = 3;
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const data = buffer.getChannelData(0);
    let filtered = 0;
    for (let i = 0; i < data.length; i++) {
      // Correlated noise reads as distant bodies/air rather than harsh static.
      filtered = filtered * 0.985 + (Math.random() * 2 - 1) * 0.15;
      data[i] = filtered * 0.72 + (Math.random() * 2 - 1) * 0.035;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const movement = context.createGain();
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 620;
    filter.Q.value = 0.38;
    movement.gain.value = 0.72;
    lfo.type = "sine";
    lfo.frequency.value = 0.085;
    lfoDepth.gain.value = 0.18;
    lfo.connect(lfoDepth);
    lfoDepth.connect(movement.gain);
    source.connect(filter);
    filter.connect(movement);
    movement.connect(destination);
    source.start();
    lfo.start();
    this.crowdSource = source;
    this.crowdLfo = lfo;
  }

  private flushPending(): void {
    const now = Date.now();
    const fresh = this.pending.filter((item) => now - item.queuedAt <= 4_000);
    this.pending = [];
    fresh.forEach(({ cue }, index) => {
      // Keep a newly-unlocked burst intelligible rather than stacking it all at once.
      this.renderCue(cue, index * 0.08);
    });
  }

  private renderCue(cue: MatchAudioCue, delay = 0): void {
    const context = this.context;
    if (!context || context.state !== "running") return;
    const at = context.currentTime + delay;
    switch (cue) {
      case "whistle":
        this.whistle(at, 0.25);
        break;
      case "doubleWhistle":
        this.whistle(at, 0.22);
        this.whistle(at + 0.36, 0.3);
        break;
      case "fullTimeWhistle":
        this.whistle(at, 0.2);
        this.whistle(at + 0.32, 0.2);
        this.whistle(at + 0.66, 0.48);
        break;
      case "kick":
        this.kick(at);
        break;
      case "goal":
        this.noiseBurst(at, 2.25, 0.72, 950, "lowpass");
        this.tone(at, 330, 440, 0.5, 0.12, "sawtooth");
        this.tone(at + 0.16, 440, 660, 0.7, 0.1, "sawtooth");
        break;
      case "chance":
        this.noiseBurst(at, 0.55, 0.32, 1_250, "bandpass");
        this.tone(at, 210, 285, 0.34, 0.055, "sine");
        break;
      case "save":
        this.kick(at);
        this.noiseBurst(at + 0.03, 0.48, 0.28, 880, "bandpass");
        break;
      case "miss":
        this.noiseBurst(at, 0.72, 0.3, 720, "lowpass");
        this.tone(at, 260, 155, 0.55, 0.05, "sine");
        break;
      case "restart":
        this.noiseBurst(at, 0.12, 0.11, 520, "lowpass");
        break;
      case "card":
        this.whistle(at, 0.16);
        this.whistle(at + 0.22, 0.27);
        break;
    }
  }

  private whistle(at: number, duration: number): void {
    this.tone(at, 1_850, 2_120, duration, 0.13, "square");
    this.tone(at, 2_760, 2_940, duration, 0.047, "sine");
  }

  private kick(at: number): void {
    this.tone(at, 105, 48, 0.115, 0.18, "sine");
    this.noiseBurst(at, 0.075, 0.2, 430, "lowpass");
  }

  private tone(
    at: number,
    fromHz: number,
    toHz: number,
    duration: number,
    peak: number,
    type: OscillatorType,
  ): void {
    const context = this.context;
    const destination = this.effectsGain;
    if (!context || !destination) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, fromHz), at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, toHz), at + duration);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.min(0.025, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private noiseBurst(
    at: number,
    duration: number,
    peak: number,
    frequency: number,
    filterType: BiquadFilterType,
  ): void {
    const context = this.context;
    const destination = this.effectsGain;
    if (!context || !destination) return;
    const frameCount = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = filterType === "bandpass" ? 0.7 : 0.35;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.min(0.08, duration * 0.25));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination);
    source.start(at);
    source.stop(at + duration + 0.02);
  }
}
