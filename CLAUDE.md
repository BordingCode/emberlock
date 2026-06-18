# Emberlock — project guide for Claude

A vanilla **ES-module** PWA: a **Warlock-style lava-shove arena brawler** rendered to
`<canvas>` (twin-stick, knockback-into-lava). No build step. Repo: `BordingCode/emberlock`
(branch **main**), GitHub Pages (`bordingcode.github.io/emberlock`).

## Before working
Read the shared game-dev knowledge base: **`~/cc/gamedev-kb/INDEX.md`** (lowercase `cc`).
Especially `patterns/canvas-engine-games.md`, `patterns/game-loop-and-timing.md`,
`patterns/mobile-ios-safari.md`, and `checklists/new-canvas-game.md` + `ship-checklist.md`.

## Architecture
- `js/main.js` — boot, twin-stick input (`TwinStick`, pointerId-tracked), render glue.
- `js/game/world.js` — the sim (`step(dt)`), hit/knockback/stagger logic.
- `js/game/data.js` — all tuning in `C`, plus Spells / Rivals / Embers data rows.
- `js/engine/`, `js/audio.js` (procedural).

## The feel triad (do not break)
Knockback is a **coupled triad** in `js/game/data.js` `C` — tune the three together:
`FB_IMPULSE: 430`, `STAGGER: 0.27`, `KB_DECEL: 900`. These are the shipped values.

## Deploy convention — every change MUST
- **Bump the SW `CACHE` string** in `sw.js` (e.g. `emberlock-v8`→`v9`) **and** bump the
  `?v=` query on changed `<link>`/`<script>` tags in `index.html`. Both are required (it uses
  `?v=` busting) or stale code is served — even browser tests pass on stale files.
- Be **committed and pushed** to `main`.

## Test hooks (in `js/main.js`)
`window.__game` (live game; `__game.quickFight(n)` jumps to a fight) and `window.__errors`
(assert empty). Verify in a real browser (local server + Playwright). No test/ dir.

## Notes
- Phone-first: twin-stick multi-touch with `pointercancel` handling; audio on first gesture.
- localStorage save: `emberlock_v1`.
