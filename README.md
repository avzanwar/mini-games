# Mini Games

A collection of small browser games — plain HTML, CSS and JavaScript. No frameworks,
no build step, no dependencies. Every file runs straight from a static server, and
each game works with both a mouse/keyboard and touch.

## Games

- **Flappy Bird** (`games/flappy-bird/`) — tap or press Space to flap.

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

Push the repo to GitHub and turn on Pages (Settings → Pages → Deploy from branch →
`main` / root). The site lands at `https://<user>.github.io/mini-games/`.
