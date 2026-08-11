// 2048 — plain canvas, no assets, no dependencies.
// Turn-based, so there's no animation loop: every input redraws once.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 400
const H = canvas.height;         // 460
const HUD_H = 60;                // score strip along the top

const N = 4;                     // 4x4 board
const PAD = 12;                  // board edge padding
const GAP = 12;                  // gap between tiles
const CELL = (W - PAD * 2 - GAP * (N - 1)) / N;   // 85

const WIN_VALUE = 2048;
const FOUR_CHANCE = 0.1;         // rest of the time a new tile is a 2
const SWIPE_MIN = 20;            // px of drag before it counts as a swipe

const TILE_COLORS = {
  2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
  32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
  512: '#edc850', 1024: '#edc53f', 2048: '#edc22e',
};

// --- State ------------------------------------------------------------------
let grid, score, state, reachedWin;
let best = Number(localStorage.getItem('2048-best')) || 0;

function reset() {
  grid = new Array(N * N).fill(0);
  score = 0;
  state = 'playing';
  reachedWin = false;
  spawn();
  spawn();
  draw();
}

function spawn() {
  const free = [];
  grid.forEach((v, i) => { if (v === 0) free.push(i); });
  if (!free.length) return;
  grid[free[Math.floor(Math.random() * free.length)]] =
    Math.random() < FOUR_CHANCE ? 4 : 2;
}

// The four lines of cell indices for a direction, each ordered from the edge
// the tiles slide toward. That way one slide routine covers all four moves.
function lines(dir) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const line = [];
    for (let j = 0; j < N; j++) {
      if (dir === 'left') line.push(i * N + j);
      else if (dir === 'right') line.push(i * N + (N - 1 - j));
      else if (dir === 'up') line.push(j * N + i);
      else line.push((N - 1 - j) * N + i);
    }
    out.push(line);
  }
  return out;
}

function move(dir) {
  let moved = false;
  for (const line of lines(dir)) {
    const values = line.map((i) => grid[i]).filter((v) => v !== 0);
    const result = [];
    for (let k = 0; k < values.length; k++) {
      if (values[k] === values[k + 1]) {
        // A tile that has just merged can't merge again this move, so skip
        // its partner rather than looking at it a second time.
        const merged = values[k] * 2;
        result.push(merged);
        score += merged;
        if (merged === WIN_VALUE && !reachedWin) reachedWin = true;
        k++;
      } else {
        result.push(values[k]);
      }
    }
    while (result.length < N) result.push(0);
    line.forEach((idx, k) => {
      if (grid[idx] !== result[k]) moved = true;
      grid[idx] = result[k];
    });
  }
  return moved;
}

function canMove() {
  if (grid.includes(0)) return true;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = grid[r * N + c];
      if (c < N - 1 && v === grid[r * N + c + 1]) return true;
      if (r < N - 1 && v === grid[(r + 1) * N + c]) return true;
    }
  }
  return false;
}

function play(dir) {
  if (state !== 'playing') return;
  if (!move(dir)) return;

  spawn();
  if (score > best) {
    best = score;
    localStorage.setItem('2048-best', String(best));
  }
  if (reachedWin && state === 'playing') state = 'won';
  else if (!canMove()) state = 'over';
  draw();
}

// --- Input ------------------------------------------------------------------
function tap() {
  // The win banner is only a checkpoint — tapping it carries on with the same
  // board, the way the original does.
  if (state === 'won') { state = 'playing'; reachedWin = true; draw(); }
  else if (state === 'over') reset();
}

const KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

window.addEventListener('keydown', (e) => {
  const dir = KEYS[e.code];
  if (dir) {
    e.preventDefault();
    if (state === 'playing') play(dir);
    else tap();
  } else if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    tap();
  }
});

let swipeStart = null;
canvas.addEventListener('pointerdown', (e) => {
  swipeStart = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  if (!swipeStart) return;
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  swipeStart = null;

  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) tap();
  else if (Math.abs(dx) > Math.abs(dy)) play(dx > 0 ? 'right' : 'left');
  else play(dy > 0 ? 'down' : 'up');
});

// --- Draw -------------------------------------------------------------------
function tileXY(i) {
  return {
    x: PAD + (i % N) * (CELL + GAP),
    y: HUD_H + PAD + Math.floor(i / N) * (CELL + GAP),
  };
}

function tileFont(value) {
  const digits = String(value).length;
  if (digits <= 2) return 36;
  if (digits === 3) return 30;
  if (digits === 4) return 25;
  return 20;
}

function text(str, y, size, color) {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.strokeText(str, W / 2, y);
  ctx.fillStyle = color;
  ctx.fillText(str, W / 2, y);
}

function draw() {
  ctx.fillStyle = '#12161f';
  ctx.fillRect(0, 0, W, H);

  // HUD. Score centred and best right, leaving the top-left clear for the
  // "All games" link on a full-width phone screen.
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8ecf3';
  ctx.fillText(`Score ${score}`, W / 2, 32);
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7c8aa3';
  ctx.fillText(`Best ${best}`, W - 14, 32);

  // Board panel
  ctx.fillStyle = '#bbada0';
  ctx.beginPath();
  ctx.roundRect(0, HUD_H, W, H - HUD_H, 10);
  ctx.fill();

  for (let i = 0; i < N * N; i++) {
    const { x, y } = tileXY(i);
    const value = grid[i];

    ctx.fillStyle = value ? (TILE_COLORS[value] || '#3c3a32') : '#cdc1b4';
    ctx.beginPath();
    ctx.roundRect(x, y, CELL, CELL, 6);
    ctx.fill();

    if (!value) continue;
    ctx.fillStyle = value <= 4 ? '#776e65' : (TILE_COLORS[value] ? '#f9f6f2' : '#f9f6f2');
    ctx.font = `bold ${tileFont(value)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), x + CELL / 2, y + CELL / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  if (state === 'won' || state === 'over') {
    ctx.fillStyle = 'rgba(20, 16, 12, 0.72)';
    ctx.beginPath();
    ctx.roundRect(0, HUD_H, W, H - HUD_H, 10);
    ctx.fill();
    text(state === 'won' ? 'You made 2048!' : 'Game Over', 230, 32, '#fff');
    text(`Score ${score}   ·   Best ${best}`, 268, 18, '#e4dcd2');
    text(state === 'won' ? 'Tap or press Space to keep going'
                         : 'Tap or press Space to play again', 304, 15, '#e4dcd2');
  }
}

reset();
