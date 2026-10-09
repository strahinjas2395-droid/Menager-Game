# Football Manager Continental

A full football-management simulation game for the browser — build your dynasty across
league, cup, and continental competitions.

**Stack:** Next.js 14 · TypeScript (strict) · Tailwind CSS · Zustand · Phaser 3 · Vitest

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run typecheck  # tsc --noEmit
npm test           # vitest (40 specs)
npm run build      # production build
```

## The game

- **20 leagues across 15 nations** (5 nations have two divisions with promotion/relegation),
  400 clubs, ~10,000 generated players — all deterministic from a seed.
- **42-week season**: 38 double round-robin league weeks, domestic cup rounds
  (weeks 7/14/21/28/35), an 8-group continental championship with single-leg knockouts
  (weeks 30/33/36/40), and transfer windows in weeks 1–4 and 19–22.
- **Live matches**: pure-TypeScript engine simulated in a Web Worker at 10 Hz, rendered as
  dots on a Phaser pitch — pause, 1/2/4/8× speed, skip, half-time subs, live stats and
  commentary, extra time & penalty shootouts in knockouts.
- **Tactics**: 32 formations, draggable pitch positions, team instructions, play styles,
  set-piece takers and captain.
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
