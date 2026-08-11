// Tetris — plain canvas, no assets, no dependencies.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 340
const H = canvas.height;         // 460
const HUD_H = 40;

const COLS = 10;
const ROWS = 20;
const CELL = 20;
const BOARD_X = 12;
const BOARD_Y = 48;
const PANEL_X = BOARD_X + COLS * CELL + 12;      // 224

const DROP_START = 800;          // ms per row at level 1
const DROP_PER_LEVEL = 70;       // and how much quicker each level is
const DROP_MIN = 90;
const LINES_PER_LEVEL = 10;
const LINE_SCORES = [0, 100, 300, 500, 800];     // by number of rows cleared at once

const SWIPE_MIN = 24;            // px before a drag counts as a gesture
const RESTART_DELAY = 400;

// Each piece is a set of cells inside an n×n box, so one rotation routine
// covers them all: (x, y) -> (n - 1 - y, x).
const SHAPES = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: '#5bc8f5' },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: '#ffd93d' },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: '#b06cf0' },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: '#6ee7a8' },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: '#ff5f56' },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: '#4d7cff' },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: '#ff9f43' },
};

// --- State ------------------------------------------------------------------
let board, piece, nextType, bag, score, lines, level, state, dropTimer, overAt;
let best = Number(localStorage.getItem('tetris-best')) || 0;

function reset() {
  board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  bag = [];
  score = 0;
  lines = 0;
  level = 1;
  dropTimer = 0;
  overAt = 0;
  nextType = pullFromBag();
  spawn();
  state = 'ready';
}

// A 7-bag randomiser: every piece shows up once before any repeats, which
// avoids the long droughts pure random gives you.
function pullFromBag() {
  if (!bag.length) {
    bag = Object.keys(SHAPES);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
}

function spawn() {
  const type = nextType;
  nextType = pullFromBag();
  const shape = SHAPES[type];
  piece = {
    cells: shape.cells.map((c) => c.slice()),
    n: shape.n,
    color: shape.color,
    x: Math.floor((COLS - shape.n) / 2),
    y: 0,
  };
  if (collides(piece.cells, piece.x, piece.y)) gameOver();
}

function collides(cells, px, py) {
  for (const [cx, cy] of cells) {
    const bx = px + cx;
    const by = py + cy;
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    if (by >= 0 && board[by][bx]) return true;
  }
  return false;
}

function dropInterval() {
  return Math.max(DROP_MIN, DROP_START - (level - 1) * DROP_PER_LEVEL);
}

// --- Moves ------------------------------------------------------------------
function moveBy(dx) {
  if (state !== 'playing') return;
  if (!collides(piece.cells, piece.x + dx, piece.y)) piece.x += dx;
}

function rotate() {
  if (state !== 'playing') return;
  const turned = piece.cells.map(([x, y]) => [piece.n - 1 - y, x]);
  // Simple wall kick: if the rotation doesn't fit, try nudging sideways
  // before giving up on it.
  for (const kick of [0, -1, 1, -2, 2]) {
    if (!collides(turned, piece.x + kick, piece.y)) {
      piece.cells = turned;
      piece.x += kick;
      return;
    }
  }
}

function softDrop() {
  if (state !== 'playing') return;
  if (collides(piece.cells, piece.x, piece.y + 1)) {
    lock();
  } else {
    piece.y++;
    score++;
    dropTimer = 0;
  }
}

function hardDrop() {
  if (state !== 'playing') return;
  while (!collides(piece.cells, piece.x, piece.y + 1)) {
    piece.y++;
    score += 2;
  }
  lock();
}

function ghostY() {
  let y = piece.y;
  while (!collides(piece.cells, piece.x, y + 1)) y++;
  return y;
}

function lock() {
  for (const [cx, cy] of piece.cells) {
    const by = piece.y + cy;
    if (by >= 0) board[by][piece.x + cx] = piece.color;
  }
  clearLines();
  dropTimer = 0;
  spawn();
}

function clearLines() {
  const kept = board.filter((row) => row.some((c) => !c));
  const cleared = ROWS - kept.length;
  if (!cleared) return;

  while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(null));
  board = kept;
  lines += cleared;
  score += LINE_SCORES[cleared] * level;
  level = Math.floor(lines / LINES_PER_LEVEL) + 1;
  if (score > best) {
    best = score;
    localStorage.setItem('tetris-best', String(best));
  }
}

function gameOver() {
  state = 'over';
  overAt = performance.now();
  if (score > best) {
    best = score;
    localStorage.setItem('tetris-best', String(best));
  }
}

// --- Input ------------------------------------------------------------------
function tap() {
  if (state === 'ready') state = 'playing';
  else if (state === 'playing') rotate();
  else if (state === 'over' && performance.now() - overAt > RESTART_DELAY) reset();
}

window.addEventListener('keydown', (e) => {
  const c = e.code;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space',
       'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(c)) e.preventDefault();

  if (state === 'ready' && (c === 'Space' || c === 'Enter')) { state = 'playing'; return; }
  if (state === 'over') { if (c === 'Space' || c === 'Enter') tap(); return; }

  if (c === 'ArrowLeft' || c === 'KeyA') moveBy(-1);
  else if (c === 'ArrowRight' || c === 'KeyD') moveBy(1);
  else if (c === 'ArrowUp' || c === 'KeyW') rotate();
  else if (c === 'ArrowDown' || c === 'KeyS') softDrop();
  else if (c === 'Space') hardDrop();
});

// Touch: drag sideways to slide the piece a cell at a time, flick down to
// hard drop, tap to rotate.
let touch = null;
canvas.addEventListener('pointerdown', (e) => {
  touch = { x: e.clientX, y: e.clientY, cells: 0, dropped: false };
});
canvas.addEventListener('pointermove', (e) => {
  if (!touch || state !== 'playing') return;
  const cellCss = canvas.getBoundingClientRect().width / W * CELL;
  const wanted = Math.trunc((e.clientX - touch.x) / cellCss);
  while (touch.cells < wanted) { moveBy(1); touch.cells++; }
  while (touch.cells > wanted) { moveBy(-1); touch.cells--; }
});
canvas.addEventListener('pointerup', (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  const t = touch;
  touch = null;

  if (state !== 'playing') { tap(); return; }
  if (dy > SWIPE_MIN && Math.abs(dy) > Math.abs(dx)) hardDrop();
  else if (!t.cells && Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) tap();
});

// --- Update -----------------------------------------------------------------
function update(dt) {
  if (state !== 'playing') return;
  dropTimer += dt;
  while (dropTimer >= dropInterval() && state === 'playing') {
    dropTimer -= dropInterval();
    if (collides(piece.cells, piece.x, piece.y + 1)) lock();
    else piece.y++;
  }
}

// --- Draw -------------------------------------------------------------------
function drawCell(bx, by, color, alpha) {
  if (by < 0) return;
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(BOARD_X + bx * CELL + 1, BOARD_Y + by * CELL + 1, CELL - 2, CELL - 2, 3);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function label(str, x, y, size, color, align) {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = align || 'left';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function text(str, y, size, color) {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.strokeText(str, W / 2, y);
  ctx.fillStyle = color;
  ctx.fillText(str, W / 2, y);
}

function drawNext() {
  const shape = SHAPES[nextType];
  const size = 14;
  const boxX = PANEL_X;
  const boxY = BOARD_Y + 26;
  ctx.fillStyle = '#0e1520';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, 104, 66, 6);
  ctx.fill();

  // Centre the piece on its occupied cells, not its whole box, so the I and
  // O pieces don't sit off to one side.
  const xs = shape.cells.map((c) => c[0]);
  const ys = shape.cells.map((c) => c[1]);
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * size;
  const h = (Math.max(...ys) - Math.min(...ys) + 1) * size;
  const ox = boxX + (104 - w) / 2 - Math.min(...xs) * size;
  const oy = boxY + (66 - h) / 2 - Math.min(...ys) * size;

  ctx.fillStyle = shape.color;
  for (const [cx, cy] of shape.cells) {
    ctx.beginPath();
    ctx.roundRect(ox + cx * size + 1, oy + cy * size + 1, size - 2, size - 2, 3);
    ctx.fill();
  }
}

function draw() {
  ctx.fillStyle = '#12161f';
  ctx.fillRect(0, 0, W, H);

  // HUD — score centred, best right, top-left clear for the "All games" link.
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8ecf3';
  ctx.fillText(`Score ${score}`, W / 2, 27);
  label(`Best ${best}`, W - 12, 27, 14, '#7c8aa3', 'right');

  // Board
  ctx.fillStyle = '#0e1520';
  ctx.beginPath();
  ctx.roundRect(BOARD_X - 4, BOARD_Y - 4, COLS * CELL + 8, ROWS * CELL + 8, 6);
  ctx.fill();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      drawCell(x, y, board[y][x] || '#182234');
    }
  }

  if (state !== 'over') {
    const gy = ghostY();
    for (const [cx, cy] of piece.cells) drawCell(piece.x + cx, gy + cy, piece.color, 0.22);
    for (const [cx, cy] of piece.cells) drawCell(piece.x + cx, piece.y + cy, piece.color);
  }

  // Side panel
  label('NEXT', PANEL_X, BOARD_Y + 14, 12, '#7c8aa3');
  drawNext();
  label('LINES', PANEL_X, BOARD_Y + 122, 12, '#7c8aa3');
  label(String(lines), PANEL_X, BOARD_Y + 148, 22, '#e8ecf3');
  label('LEVEL', PANEL_X, BOARD_Y + 186, 12, '#7c8aa3');
  label(String(level), PANEL_X, BOARD_Y + 212, 22, '#e8ecf3');

  if (state === 'ready' || state === 'over') {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.92)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    if (state === 'ready') {
      text('Tetris', 180, 34, '#fff');
      text('← → move · ↑ rotate · space drop', 218, 12, '#cdd6e4');
      text('or drag to move, tap to rotate,', 240, 12, '#cdd6e4');
      text('swipe down to drop', 258, 12, '#cdd6e4');
      text('Tap or press Space to start', 296, 14, '#fff');
    } else {
      text('Game Over', 200, 34, '#fff');
      text(`Score ${score}   ·   Best ${best}`, 238, 16, '#cdd6e4');
      text(`Lines ${lines}   ·   Level ${level}`, 264, 14, '#cdd6e4');
      text('Tap or press Space to play again', 300, 14, '#cdd6e4');
    }
  }
}

// --- Loop -------------------------------------------------------------------
let lastTime = performance.now();

function frame(now) {
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
