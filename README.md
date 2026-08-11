# Mini Games

**Play at <https://avzanwar.github.io/mini-games/>**

A collection of small browser games — plain HTML, CSS and JavaScript. No frameworks,
no build step, no dependencies. Every file runs straight from a static server, and
each game works with both a mouse/keyboard and touch.

## Games

- **Flappy Bird** (`games/flappy-bird/`) — tap or press Space to flap.
- **Snake** (`games/snake/`) — swipe or use the arrow keys to turn.
- **Breakout** (`games/breakout/`) — drag or use the arrow keys to steer the paddle.
- **2048** (`games/2048/`) — swipe or use the arrow keys to slide tiles.
- **Tetris** (`games/tetris/`) — arrow keys, or drag to move and tap to rotate.
- **Minesweeper** (`games/minesweeper/`) — tap to clear, long-press or right-click to flag.
- **Connect Four** (`games/connect-four/`) — tap a column to drop a disc; play the CPU.
- **Asteroids** (`games/asteroids/`) — arrow keys and space, or the on-screen thumb buttons.
- **Solitaire** (`games/solitaire/`) — Klondike; tap a card, then tap where to put it.

## Run locally

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

(Opening `index.html` directly via `file://` mostly works too, but a server is
closer to how it behaves when deployed.)

## Adding a game

1. Create `games/<your-game>/` with an `index.html`, `style.css` and `game.js`.
2. Copy a card into the `<ul class="games">` list in the root `index.html`.

Keep links relative (`../../`, `games/foo/`) so the site works when it's served
from a sub-path like GitHub Pages.

## Deploying

GitHub Pages is already enabled for this repo, serving `main` from the root — so
every push to `main` redeploys <https://avzanwar.github.io/mini-games/> a minute or
so later. There is no build step and no workflow file; the files are served as-is.
