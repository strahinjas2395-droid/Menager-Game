import { describe, expect, it } from "vitest";
import { MatchEventType, type GameSettings } from "@/types";
import {
  audioCueForMatchEvent,
  resolveMatchAudioPreferences,
} from "@/services/matchAudio";

describe("match audio", () => {
  it("honours the master switch and safely defaults older career settings", () => {
    expect(resolveMatchAudioPreferences({ soundVolume: 0.65, musicVolume: 0.25 })).toEqual({
      enabled: true,
      effectsVolume: 0.65,
      ambienceVolume: 0.25,
    });

    const muted: GameSettings = {
      audioEnabled: false,
      soundVolume: 0.9,
      musicVolume: 0.8,
      vibration: true,
      autoPressConference: false,
    };
    expect(resolveMatchAudioPreferences(muted)).toMatchObject({
      enabled: false,
      effectsVolume: 0.9,
      ambienceVolume: 0.8,
    });
  });

  it("clamps imported volume values to the playable range", () => {
    expect(resolveMatchAudioPreferences({ soundVolume: 4, musicVolume: -2 })).toEqual({
      enabled: true,
      effectsVolume: 1,
      ambienceVolume: 0,
    });
  });

  it("maps important match events without sounding every instruction line", () => {
    expect(audioCueForMatchEvent(MatchEventType.Goal)).toBe("goal");
    expect(audioCueForMatchEvent(MatchEventType.ShotSaved)).toBe("save");
    expect(audioCueForMatchEvent(MatchEventType.FreeKick)).toBe("whistle");
    expect(audioCueForMatchEvent(MatchEventType.Foul)).toBeNull();
    expect(audioCueForMatchEvent(MatchEventType.HalfTime)).toBe("doubleWhistle");
    expect(audioCueForMatchEvent(MatchEventType.FullTime)).toBe("fullTimeWhistle");
    expect(audioCueForMatchEvent(MatchEventType.KickOff)).toBeNull();
    expect(audioCueForMatchEvent(MatchEventType.Instruction)).toBeNull();
  });
});
