# Football Manager Continental

A full football-management simulation game for the browser — build your dynasty across
league, cup, and continental competitions.

**Stack:** Next.js 14 · TypeScript (strict) · Tailwind CSS · Zustand · Phaser 3 · Puter AI · Vitest

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Natural-language tactics use Puter’s hosted AI from the browser. No developer API key or local model is required; Puter may show a sign-in prompt when the manager first asks AI to interpret an instruction.

Other scripts:

```bash
npm run typecheck  # tsc --noEmit
npm test           # full Vitest suite
npm run build      # production build
```

## The game

- **20 leagues across 15 nations** (5 nations have two divisions with promotion/relegation),
  400 clubs, ~10,000 generated players — all deterministic from a seed.
- **42-week season**: 38 double round-robin league weeks, domestic cup rounds
  (weeks 7/14/21/28/35), an 8-group continental championship with single-leg knockouts
  (weeks 30/33/36/40), and transfer windows in weeks 1–4 and 19–22.
- **Live matches**: pure-TypeScript engine simulated in a Web Worker at 10 Hz, rendered as
  dots on a Phaser pitch with fixed eight-minute halves, pause, live stats and commentary,
  extra time and penalty shootouts in knockouts. A match-day tactical console applies
  formation, style, team instructions, individual instructions and substitutions without
  restarting. A deterministic touchline advisor reads the live score and telemetry, explains
  exact control changes, and can apply them immediately without interrupting play.
- **Tactical simulation**: distinct build-up, settled attack, defensive-block, counterattack
  and counter-press phases; role/formation-aware movement; short combinations, recycling,
  switches, through balls, target-man play, overlaps, crosses and cutbacks; contextual
  long shots and variable ball speeds; explicit air-ball/shadow cues; aerial, shielding,
  tackling and loose-ball duels driven by player attributes.
- **Tactics setup**: 32 formations on a space-efficient vertical board, draggable pitch
  positions, traditional role numbers, tap-to-view player stat cards, dot-based controls,
  set-piece takers, captain, and persistent free-text instructions for both players and the
  whole team. A hosted language model understands open-ended multilingual wording and misspellings,
  resolves names/numbers/roles against the current squad, and submits a strictly validated
  tactical plan. The UI shows understood and unsupported meaning; cached plans keep the
  simulator deterministic and a clearly labelled basic fallback keeps matches playable offline.
- **Instruction-driven behavior**: resolved recipients become strongly preferred passing
  options with requested ground/aerial service; defensive duties can pull a striker into the
  block to track and press; team-wide urgent clearances execute only in credible danger areas.
  Throttled commentary makes those instructions observable during a match.
- **Transfers**: scouting search, bid/counter negotiation, contract demands, and an AI
  transfer market that moves players during open windows.
- **Saves** live in IndexedDB (auto-save after every match) with JSON export/import
  in Settings.

## Structure

```
src/
  types/        core data model (players, clubs, fixtures, saves)
  database/     seeded RNG, name pools, player/league generation, storage
  engine/       match engine (simulator + worker), competitions, transfers
  store/        zustand game store (career lifecycle, week advancement)
  components/   MatchCanvas (Phaser), TopBar, BottomNav
  app/          pages: menu, new-career, hub, squad, tactics, match,
                standings, transfers, settings, credits
```

The match engine is framework-free TypeScript with no React dependencies, so it runs
identically in the worker, in tests, and headless for AI quick-sims.
