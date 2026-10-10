/**
 * matchWorker — runs MatchSimulator off the main thread.
 * Communicates via postMessage at up to 10 Hz.
 *
 * Main -> worker: init | start | pause | resume | sub | tactics | directives | opponentPlan | resumeHalf
 * Worker -> main: ready | state | event | halfTime | fullTime
 */
import { MatchSimulator, type MatchSnapshot, type Side, type SimOptions, type TeamSide } from "./matchSimulator";
import type { MatchEvent, OpponentMatchPlan, TacticalSetup } from "../types";
import type { PlayerDirectives } from "./directives";

interface InitPayload {
  home: TeamSide;
  away: TeamSide;
  options: SimOptions;
}

type InMsg =
  | { type: "init"; payload: InitPayload }
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "resumeHalf" }
  | { type: "sub"; side: Side; starterIdx: number; benchIdx: number }
  | { type: "tactics"; side: Side; tactics: TacticalSetup; reason?: string }
  | { type: "opponentPlan"; side: Side; plan: OpponentMatchPlan }
  | {
      type: "directives";
      side: Side;
      directives: Record<string, PlayerDirectives>;
      teamDirectives?: PlayerDirectives;
    };

let sim: MatchSimulator | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lastTickAt = 0;

function post(msg: unknown): void {
  (self as unknown as Worker).postMessage(msg);
}

function startLoop(): void {
  if (timer) return;
  lastTickAt = performance.now();
  timer = setInterval(() => {
    const now = performance.now();
    // Use elapsed wall time rather than assuming every interval fires exactly
    // on schedule. A modest cap prevents a backgrounded tab from fast-forwarding
    // through the match when it becomes active again.
    const dtReal = Math.min(0.25, Math.max(0, (now - lastTickAt) / 1_000));
    lastTickAt = now;
    if (!sim) return;
    sim.tick(dtReal);
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
      // Do not consume the centre-spot restart while Phaser is still loading.
      // The page sends `start` only after both the worker snapshot and pitch
      // renderer are ready, guaranteeing the kickoff is actually visible.
      sim.pause();
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
    case "sub":
      sim?.substitute(msg.side, msg.starterIdx, msg.benchIdx);
      if (sim) post({ type: "state", state: sim.getState() });
      break;
    case "tactics":
      sim?.updateTactics(msg.side, msg.tactics, msg.reason);
      if (sim) post({ type: "state", state: sim.getState() });
      break;
    case "directives":
      sim?.updateDirectives(msg.side, msg.directives, msg.teamDirectives);
      break;
    case "opponentPlan":
      sim?.updateOpponentPlan(msg.side, msg.plan);
      if (sim) post({ type: "state", state: sim.getState() });
      break;
  }
};
