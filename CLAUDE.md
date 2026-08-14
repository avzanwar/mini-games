# Mini Games — project notes

Handoff notes for picking this project up in a fresh session. Everything here
was true as of the "Group the hub by genre" commit; run `git log --oneline` for
the full history.

- **Live:** <https://avzanwar.github.io/mini-games/>
- **Repo:** <https://github.com/avzanwar/mini-games> (branch `main`)
- **Status:** 14 games, all finished and deployed. Nothing is half-built.

---

## Ground rules

These constraints shaped every decision and should be kept unless deliberately
revisited:

1. **Plain HTML, CSS and JavaScript.** No framework, no bundler, no npm, no
   dependencies. Files are served exactly as they sit on disk.
2. **No asset files anywhere.** No images, no audio, no fonts — verifiably zero.
   Everything is drawn with canvas primitives, or is an emoji / Unicode glyph.
   The entire site is ~340 KB of source across 16 JS files.
3. **Every game works with touch and with mouse/keyboard.** Not one or the
   other — both, in the same build.
4. **Keep the code simple.** This was the original brief and it still holds.
   Games are 240–450 lines each, single file, no shared runtime.
5. **Relative links only** (`../../`, `games/foo/`). The site is served from the
   `/mini-games/` sub-path on GitHub Pages; absolute paths would break it.

There is deliberately **no shared engine**. Each game repeats a small amount of
loop/scaling boilerplate. That was a choice: it keeps any one game readable on
its own and means changing one can never break another.

---

## Layout

```
mini-games/
  index.html          hub: genre sections + filter chips
  style.css           hub styling only
  hub.js              genre filter (the hub's only JS)
  README.md           player-facing
  CLAUDE.md           this file
  .gitignore
  games/<name>/
    index.html        canvas + back link + script tags
    style.css         centring and canvas scaling
    game.js           the whole game
```

Only exception: `games/word-guess/` also has `words.js` (the 679-word answer
list), loaded before `game.js`.

---

## Hub architecture

`index.html` holds one `<section class="genre" data-genre="...">` per genre,
each with an `<h2>`, a one-line note, and a `<ul class="games">` of cards.
Above them is a `<nav class="filters">` of `<button class="chip"
data-filter="...">` with a count.

`hub.js` toggles `section.hidden` to filter, mirrors the state onto the chips'
`aria-pressed`, and remembers the choice in `localStorage['hub-filter']`.

**Sections are visible by default and the script only ever hides them**, so with
JavaScript off the page degrades to a grouped list rather than an empty one.
Keep that property.

Current genres: `arcade` (5), `puzzle` (4), `strategy` (2), `cards` (2),
`sports` (1).

### Adding a game

1. `games/<name>/` with `index.html`, `style.css`, `game.js` — copy the closest
   existing game as a skeleton.
2. Add a card to the right genre's `<ul class="games">` in the root
   `index.html`.
3. **Bump that genre's chip count and the "All" count.** These are hand-written
   and will silently drift otherwise.
4. Add a line to the README under the matching genre heading.
5. New genre? Add a `<section class="genre" data-genre="x">` and a matching
   chip — `hub.js` discovers both by query, no code change needed.

---

## The shared game skeleton

Every game follows the same shape. If you are writing a new one, follow it.

### Canvas scaling

The canvas has a **fixed logical resolution** in its `width`/`height`
attributes, and CSS scales it to fit the viewport:

```css
canvas {
  aspect-ratio: 9 / 14;      /* must match width/height */
  height: 100%;
  max-height: 100vh;
  max-width: 100vw;
  touch-action: none;        /* stops tapping from scrolling the page */
  display: block;
}
```

Drawing code therefore works in logical pixels only and never thinks about
device pixels or DPR. To convert a pointer event to logical coordinates:

```js
const r = canvas.getBoundingClientRect();
const x = (e.clientX - r.left) * (W / r.width);
const y = (e.clientY - r.top)  * (H / r.height);
```

### The back link and the HUD rule

Each game page has `<a class="back" href="../../">← All games</a>`, positioned
`fixed` at the top-left — it is **DOM, not canvas**.

> **The top-left corner of every canvas HUD must stay clear.** On a phone the
> canvas fills the width and the back link sits on top of it.

Convention: primary readout (score/status) **centred**, secondary readout
(best/lives/wave) **right-aligned**, nothing on the left. This was found the
hard way — Snake originally put "Score 0" top-left and the link landed on it.

### Loop and state

```js
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);   // clamp!
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
```

The `dt` clamp matters: without it, returning to a backgrounded tab delivers one
enormous frame and objects teleport through walls. Games needing precision
(Mini Golf, Doodle Jump) substep further inside `update`.

Every game has a small state machine, usually `'ready' | 'playing' | 'over'`,
with variations (`tower-defense` uses `building | wave | over`, `mini-golf`
uses `aim | rolling | sunk | done`, `sudoku` starts at `menu`).

There are three loop shapes, so check which one a game uses before editing:

| Shape | Games | Notes |
|---|---|---|
| Full `update(dt)` + `draw()` | flappy-bird, snake, breakout, asteroids, doodle-jump, tetris, connect-four, tower-defense, mini-golf | real-time; these are the ones that need the `dt` clamp |
| Draw-only rAF loop | minesweeper, solitaire, sudoku, word-guess | turn-based, but loop so a clock or timed message keeps ticking. No `dt` anywhere |
| No loop at all | 2048 | fully turn-based; `draw()` is called from the input handler |

### Tuning constants

Each `game.js` opens with a labelled constants block (speeds, sizes, costs,
spawn rates). Balance changes should happen there, not scattered through the
code.

### Persistence

One `localStorage` key per game, read at load, written on a new best.

| Game | Key | Shape |
|---|---|---|
| Flappy Bird | `flappy-best` | number |
| Snake | `snake-best` | number |
| Breakout | `breakout-best` | number |
| 2048 | `2048-best` | number |
| Tetris | `tetris-best` | number |
| Minesweeper | `minesweeper-best` | number (seconds; `null` means unset) |
| Connect Four | `connect4-record` | JSON `{w,l,d}` |
| Asteroids | `asteroids-best` | number |
| Solitaire | `solitaire-best` | number (fastest win in seconds; `null` means unset) |
| Sudoku | `sudoku-best` | JSON, best seconds per difficulty |
| Word Guess | `wordguess-stats` | JSON `{played,won,streak,best}` |
| Doodle Jump | `doodle-best` | number (metres) |
| Tower Defense | `td-best` | number (waves) |
| Mini Golf | `golf-best` | number (total shots) |
| Hub | `hub-filter` | string genre |

JSON-shaped values are read inside `try/catch` with a sane default, so a corrupt
or absent entry can't break the page.

---

## Inventory

| Game | Path | Genre | Canvas | Lines | Controls |
|---|---|---|---|---|---|
| Flappy Bird | `flappy-bird` | arcade | 400×600 | 246 | tap / Space |
| Snake | `snake` | arcade | 400×440 | 253 | swipe / arrows |
| Breakout | `breakout` | arcade | 400×560 | 274 | drag / arrows |
| Asteroids | `asteroids` | arcade | 360×560 | 428 | arrows+Space / on-canvas thumb buttons |
| Doodle Jump | `doodle-jump` | arcade | 340×560 | 379 | drag / arrows |
| Tetris | `tetris` | puzzle | 340×460 | 357 | arrows / drag+tap+swipe |
| 2048 | `2048` | puzzle | 400×460 | 239 | swipe / arrows |
| Minesweeper | `minesweeper` | puzzle | 340×392 | 287 | tap; long-press or right-click to flag |
| Sudoku | `sudoku` | puzzle | 360×510 | 407 | tap / digits+arrows |
| Connect Four | `connect-four` | strategy | 340×340 | 310 | tap a column / keys 1-7 |
| Tower Defense | `tower-defense` | strategy | 360×560 | 445 | tap to buy and place |
| Solitaire | `solitaire` | cards | 360×560 | 394 | tap card, tap destination |
| Word Guess | `word-guess` | cards | 360×560 | 280 | on-screen or physical keyboard |
| Mini Golf | `mini-golf` | sports | 360×560 | 371 | drag back from ball to putt |

Notable internals worth knowing before editing:

- **Sudoku** generates puzzles at run time: fill by randomised backtracking, then
  remove cells one at a time, putting back any whose removal would allow a
  second solution. Easy/Medium/Hard = 42/32/26 givens, ~3/23/78 ms.
- **Connect Four** CPU: take a win, else block one, else avoid a move that hands
  you a win, else favour the centre. Beatable ~40% by sensible play.
- **Tower Defense** waves are deterministic by design (genre-standard; lets you
  learn from a loss).
- **Doodle Jump** guarantees the climb is possible — dependable platforms stay
  within `MAX_SAFE_GAP` vertically and `MAX_SIDE_STEP` sideways, because a
  bounce only buys ~0.6 s of steering.
- **Word Guess** does **not** dictionary-check guesses (deliberate: a real word
  is never wrongly rejected). Scoring is two-pass so duplicate letters behave.
- **Mini Golf** physics substeps at 1/240 s so a hard shot can't tunnel a wall.

---

## Running and deploying

```sh
python3 -m http.server 8000     # from the repo root
```

Then <http://localhost:8000>. `file://` mostly works but a server matches
production.

Deploy is just `git push`. GitHub Pages serves `main` from the root; there is no
workflow file and no build. A push is live in 1–3 minutes:

```sh
gh api repos/avzanwar/mini-games/pages/builds/latest --jq '.status'
```

---

## Testing

There is **no test framework and no test directory** — deliberately, to keep the
shipped repo dependency-free. Games were tested by driving the real code
headlessly in Node with a stubbed DOM. This found genuine bugs in nearly every
game and is strongly worth continuing.

Save this outside the repo (or add `tests/` to `.gitignore`) as e.g.
`/tmp/harness.js`, and run it **from the repo root** so the relative path
resolves. Set the stub's `width`/`height` to the game's real canvas size (see
the inventory table) — the game reads them into its `W`/`H` and all its layout
maths follows from there.

This exact template is verified working against `flappy-bird`:

```js
const fs = require('fs');
const target = 'games/flappy-bird/game.js';        // and match the size below

const noop = () => {};
const ctx = new Proxy({}, { get: (t, k) =>
  k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop });
const canvas = {
  width: 400, height: 600, getContext: () => ctx, addEventListener: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }),
};
const store = {};
global.document = { getElementById: () => canvas };
global.window = { addEventListener: noop };
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = noop;          // stops the render loop

// Top-level `let` in a classic script is not a global, so re-export via
// getters/setters appended to the source.
const src = fs.readFileSync(target, 'utf8') + `
;globalThis.API = {
  reset: () => reset(), update: (dt) => update(dt),
  get state(){return state;}, set state(v){state=v;},
  /* ...whatever the test needs... */
};`;
new Function(src)();
const A = globalThis.API;

A.reset();
A.state = 'playing';
for (let i = 0; i < 3600; i++) A.update(1 / 60);   // a minute of play
console.log(A.state);
```

Patterns that paid off:

- **Invariant soaks.** Run tens of thousands of frames or random taps, asserting
  the world stays sane (no NaN, nothing escapes the playfield, card count stays
  52, foundations always build ace-up). Found the Solitaire crash and the
  Doodle Jump platform leak.
- **Autopilot playability tests.** Write a bot that plays competently and check
  it gets a reasonable distance. This is how the Doodle Jump unreachable-platform
  bug and the Mini Golf one-shot holes were found — both were invisible to
  unit tests and to a screenshot.
- **Bot quality is a confounder.** Three separate "the game is broken" findings
  turned out to be weak bots. If the bot fails, suspect the bot first: for maze-
  like courses score positions by *path distance through open ground* (BFS over
  a nav grid), never straight-line distance.

### Browser checks

Two traps cost real time:

- **Exceptions thrown inside an event listener do not propagate to
  `dispatchEvent`.** A `try/catch` around a simulated tap catches nothing. Count
  errors with a `window.addEventListener('error', ...)` listener instead, and
  always read the console.
- **Screenshot coordinates are not CSS pixels.** The ratio has been 0.847–0.875
  in practice. Compute it (`shotWidth / window.innerWidth`) rather than
  assuming 1:1, or clicks land in the wrong place and look like game bugs.

---

## Known gaps

- **No real-device testing.** Layouts were verified at a 420×860 viewport for
  the first few games; Chrome then refused to resize for the rest of the build.
  The responsive CSS is structurally identical across games, but nothing has
  been touched on an actual phone.
- **Sports has one game, strategy has two.** The genre grouping makes the thin
  spots obvious.
- No sound anywhere (would be the first use of WebAudio; still needs no asset
  files).
- No shared high-score or profile view across games.
- The hub chip counts are hand-maintained and can drift from reality.

## Plausible next steps

- A game for the thin genres — Space Invaders, Pac-Man or Frogger (arcade),
  Reversi or Checkers (strategy), Bubble Shooter (sports/aim).
- Simon would add audio, which nothing currently uses.
- A small "stats" page reading every game's `localStorage` key into one view.
- Generate the hub from a manifest so counts and genres cannot drift — worth it
  once there are ~20 games, overkill before that.
