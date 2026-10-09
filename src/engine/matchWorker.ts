/**
 * matchWorker — runs MatchSimulator off the main thread.
 * Communicates via postMessage at up to 10 Hz.
 *
 * Main -> worker: init | start | pause | resume | speed | skip | sub | tactics | resumeHalf
 * Worker -> main: ready | state | event | halfTime | fullTime
 */
import { MatchSimulator, type MatchSnapshot, type Side, type TeamSide } from "./matchSimulator";
import type { MatchEvent, TacticalSetup } from "../types";

interface InitPayload {
  home: TeamSide;
  away: TeamSide;
  options: { seed: number; timeScale?: number };
}

type InMsg =
  | { type: "init"; payload: InitPayload }
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "resumeHalf" }
  | { type: "speed"; value: 1 | 2 | 4 | 8 }
  | { type: "skip" }
  | { type: "sub"; side: Side; starterIdx: number; benchIdx: number }
  | { type: "tactics"; side: Side; tactics: TacticalSetup };

let sim: MatchSimulator | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function post(msg: unknown): void {
  (self as unknown as Worker).postMessage(msg);
}

function startLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (!sim) return;
    sim.tick(0.1);
    if (sim.hasNewState()) {
      post({ type: "state", state: sim.getState() satisfies MatchSnapshot });
    }
  }, 100);
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  switch (msg.type) {
    case "init": {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      const { home, away, options } = msg.payload;
      sim = new MatchSimulator(home, away, options);
      sim.onEvent = (e: MatchEvent) => post({ type: "event", event: e });
      sim.onHalfTime = () => {
        post({ type: "halfTime" });
        post({ type: "state", state: sim!.getState() });
      };
      sim.onFullTime = () => {
        post({ type: "state", state: sim!.getState() });
        post({ type: "fullTime", state: sim!.getState() });
      };
      post({ type: "ready" });
      post({ type: "state", state: sim.getState() });
      startLoop();
      break;
    }
    case "start":
      sim?.start();
      startLoop();
      break;
    case "pause":
      sim?.pause();
      break;
    case "resume":
      sim?.resume();
      break;
    case "resumeHalf":
      sim?.resume(); // resumes from halftime into second half
      post({ type: "state", state: sim!.getState() });
      break;
    case "speed":
      if (sim) sim.setSpeed(msg.value);
      break;
    case "skip": {
      if (!sim) break;
      const wasHalf = sim.phase === "halftime";
      if (wasHalf) {
        // skip only works between halves -> just re-sync
        post({ type: "state", state: sim.getState() });
        break;
      }
      sim.skipToStop();
      post({ type: "state", state: sim.getState() });
      if (sim.phase === "halftime") post({ type: "halfTime" });
      if (sim.phase === "fulltime") post({ type: "fullTime", state: sim.getState() });
      break;
    }
    case "sub":
      sim?.substitute(msg.side, msg.starterIdx, msg.benchIdx);
      if (sim) post({ type: "state", state: sim.getState() });
      break;
    case "tactics":
      if (sim) {
        const side = msg.side === "home" ? sim.home : sim.away;
        (side as { tactics: TacticalSetup }).tactics = msg.tactics;
      }
      break;
  }
};
