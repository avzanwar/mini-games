# Mini Games

**Play at <https://avzanwar.github.io/mini-games/>**

A collection of small browser games — plain HTML, CSS and JavaScript. No frameworks,
no build step, no dependencies. Every file runs straight from a static server, and
each game works with both a mouse/keyboard and touch.

## Games

Grouped by genre, the same way the hub page is.

### Arcade
- **Flappy Bird** (`games/flappy-bird/`) — tap or press Space to flap.
- **Snake** (`games/snake/`) — swipe or use the arrow keys to turn.
- **Breakout** (`games/breakout/`) — drag or use the arrow keys to steer the paddle.
- **Asteroids** (`games/asteroids/`) — arrow keys and space, or the on-screen thumb buttons.
- **Doodle Jump** (`games/doodle-jump/`) — endless climb; arrow keys or drag to steer.

### Puzzle
- **Tetris** (`games/tetris/`) — arrow keys, or drag to move and tap to rotate.
- **2048** (`games/2048/`) — swipe or use the arrow keys to slide tiles.
- **Minesweeper** (`games/minesweeper/`) — tap to clear, long-press or right-click to flag.
- **Sudoku** (`games/sudoku/`) — three difficulties, pencil notes, generated fresh each time.

### Strategy
- **Connect Four** (`games/connect-four/`) — tap a column to drop a disc; play the CPU.
- **Tower Defense** (`games/tower-defense/`) — buy turrets, survive the waves.

### Cards & words
- **Solitaire** (`games/solitaire/`) — Klondike; tap a card, then tap where to put it.
- **Word Guess** (`games/word-guess/`) — six tries at a five-letter word.

### Sports
- **Mini Golf** (`games/mini-golf/`) — nine holes; drag back from the ball to putt.

## Run locally

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

(Opening `index.html` directly via `file://` mostly works too, but a server is
closer to how it behaves when deployed.)

## Adding a game

1. Create `games/<your-game>/` with an `index.html`, `style.css` and `game.js`.
2. Copy a card into the `<ul class="games">` of whichever `<section class="genre">`
   it belongs to in the root `index.html`, and bump that genre's count in the
   filter chip at the top (and the total on the "All" chip).
3. If it needs a genre that does not exist yet, add a new `<section class="genre"
   data-genre="...">` and a matching chip. `hub.js` picks both up automatically.

Keep links relative (`../../`, `games/foo/`) so the site works when it's served
from a sub-path like GitHub Pages.

## Deploying

GitHub Pages is already enabled for this repo, serving `main` from the root — so
every push to `main` redeploys <https://avzanwar.github.io/mini-games/> a minute or
so later. There is no build step and no workflow file; the files are served as-is.
