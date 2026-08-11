// Minesweeper — plain canvas, no assets, no dependencies.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 340
const H = canvas.height;         // 392
const HUD_H = 48;

const COLS = 9;
const ROWS = 9;
const MINES = 10;
const CELL = 36;
const PAD = (W - COLS * CELL) / 2;   // 8
const BOARD_Y = HUD_H + 8;

const LONG_PRESS_MS = 450;       // hold this long on touch to plant a flag
const DRAG_CANCEL_PX = 12;       // moving this far cancels the press entirely
const RESTART_DELAY = 400;

const NUMBER_COLORS = ['', '#5bc8f5', '#6ee7a8', '#ff5f56', '#b06cf0',
                       '#ff9f43', '#5be8e8', '#e8ecf3', '#9aa5b8'];

// --- State ------------------------------------------------------------------
let mines, counts, revealed, flagged, revealedCount;
let state, minesPlaced, startTime, endTime, overAt;
// null means "no best yet" — 0 is a legitimate time, since a board whose
// mines all cluster together can be cleared by a single opening flood.
let best = localStorage.getItem('minesweeper-best');
best = best === null ? null : Number(best);

function reset() {
  mines = new Array(COLS * ROWS).fill(false);
  counts = new Array(COLS * ROWS).fill(0);
  revealed = new Array(COLS * ROWS).fill(false);
  flagged = new Array(COLS * ROWS).fill(false);
  revealedCount = 0;
  minesPlaced = false;
  startTime = 0;
  endTime = 0;
  overAt = 0;
  state = 'ready';
}

function neighbors(i) {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push(nr * COLS + nc);
    }
  }
  return out;
}

// Mines are laid only once the player has clicked, and never on that cell or
// its neighbours — so the first click always opens up a space to work from.
function placeMines(firstIndex) {
  const safe = new Set([firstIndex, ...neighbors(firstIndex)]);
  const candidates = [];
  for (let i = 0; i < COLS * ROWS; i++) if (!safe.has(i)) candidates.push(i);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const i of candidates.slice(0, MINES)) mines[i] = true;
  for (let i = 0; i < COLS * ROWS; i++) {
    counts[i] = neighbors(i).filter((n) => mines[n]).length;
  }
  minesPlaced = true;
  startTime = Date.now();
}

function reveal(i) {
  if (state !== 'playing' || flagged[i] || revealed[i]) return;
  if (!minesPlaced) placeMines(i);

  if (mines[i]) {
    revealed[i] = true;
    for (let k = 0; k < COLS * ROWS; k++) if (mines[k]) revealed[k] = true;
    state = 'over';
    endTime = Date.now();
    overAt = performance.now();
    return;
  }

  // Opening a cell with no neighbouring mines opens its neighbours too, and
  // so on outward until the wave hits numbered cells.
  const stack = [i];
  while (stack.length) {
    const j = stack.pop();
    if (revealed[j] || flagged[j]) continue;
    revealed[j] = true;
    revealedCount++;
    if (counts[j] === 0) stack.push(...neighbors(j));
  }

  if (revealedCount === COLS * ROWS - MINES) {
    // Everything left must be a mine, so flag it all and the counter reads 0.
    for (let k = 0; k < COLS * ROWS; k++) if (mines[k]) flagged[k] = true;
    state = 'won';
    endTime = Date.now();
    overAt = performance.now();
    const secs = Math.floor((endTime - startTime) / 1000);
    if (best === null || secs < best) {
      best = secs;
      localStorage.setItem('minesweeper-best', String(best));
    }
  }
}

function toggleFlag(i) {
  if (state !== 'playing' || revealed[i]) return;
  flagged[i] = !flagged[i];
}

function flagCount() {
  return flagged.filter(Boolean).length;
}

function elapsed() {
  if (!startTime) return 0;
  return Math.floor(((endTime || Date.now()) - startTime) / 1000);
}

// --- Input ------------------------------------------------------------------
function cellAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (W / rect.width);
  const y = (clientY - rect.top) * (H / rect.height);
  const c = Math.floor((x - PAD) / CELL);
  const r = Math.floor((y - BOARD_Y) / CELL);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
  return r * COLS + c;
}

let press = null;

function endRound() {
  if (performance.now() - overAt > RESTART_DELAY) reset();
}

canvas.addEventListener('pointerdown', (e) => {
  if (state === 'ready') { state = 'playing'; return; }
  if (state === 'won' || state === 'over') return;

  const i = cellAt(e.clientX, e.clientY);
  if (i < 0) return;

  if (e.button === 2) { toggleFlag(i); press = null; return; }

  press = { i, x: e.clientX, y: e.clientY, longFired: false, timer: 0 };
  // Touch has no second button, so a hold stands in for right-click.
  if (e.pointerType !== 'mouse') {
    press.timer = setTimeout(() => {
      if (!press) return;
      press.longFired = true;
      toggleFlag(press.i);
    }, LONG_PRESS_MS);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!press) return;
  if (Math.abs(e.clientX - press.x) > DRAG_CANCEL_PX ||
      Math.abs(e.clientY - press.y) > DRAG_CANCEL_PX) {
    clearTimeout(press.timer);
    press = null;
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (state === 'won' || state === 'over') { endRound(); return; }
  if (!press) return;
  clearTimeout(press.timer);
  if (!press.longFired && cellAt(e.clientX, e.clientY) === press.i) reveal(press.i);
  press = null;
});

canvas.addEventListener('pointercancel', () => {
  if (press) clearTimeout(press.timer);
  press = null;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (state === 'ready') state = 'playing';
    else if (state === 'won' || state === 'over') endRound();
  }
});

// --- Draw -------------------------------------------------------------------
function text(str, y, size, color) {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.strokeText(str, W / 2, y);
  ctx.fillStyle = color;
  ctx.fillText(str, W / 2, y);
}

function clock(secs) {
  const m = Math.floor(secs / 60);
  return `${m}:${String(secs % 60).padStart(2, '0')}`;
}

function draw() {
  ctx.fillStyle = '#12161f';
  ctx.fillRect(0, 0, W, H);

  // HUD — mines left centred, timer right, top-left clear for the back link.
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8ecf3';
  ctx.fillText(`💣 ${MINES - flagCount()}`, W / 2, 26);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7c8aa3';
  ctx.fillText(clock(elapsed()), W - 12, 26);

  for (let i = 0; i < COLS * ROWS; i++) {
    const x = PAD + (i % COLS) * CELL;
    const y = BOARD_Y + Math.floor(i / COLS) * CELL;

    ctx.fillStyle = revealed[i] ? '#16202e' : '#2a3547';
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, CELL - 2, CELL - 2, 4);
    ctx.fill();

    ctx.textAlign = 'center';
    const cx = x + CELL / 2;
    const cy = y + CELL / 2 + 1;

    if (!revealed[i]) {
      if (flagged[i]) {
        ctx.font = '18px system-ui, sans-serif';
        ctx.fillText('🚩', cx, cy);
      }
      continue;
    }
    if (mines[i]) {
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('💣', cx, cy);
    } else if (counts[i]) {
      ctx.font = 'bold 19px system-ui, sans-serif';
      ctx.fillStyle = NUMBER_COLORS[counts[i]];
      ctx.fillText(String(counts[i]), cx, cy);
    }
  }

  ctx.textBaseline = 'alphabetic';

  if (state === 'ready' || state === 'won' || state === 'over') {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.86)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    if (state === 'ready') {
      text('Minesweeper', 160, 30, '#fff');
      text('Tap a square to clear it', 196, 14, '#cdd6e4');
      text('Long-press to flag a mine', 218, 14, '#cdd6e4');
      text('(right-click on a laptop)', 240, 13, '#7c8aa3');
      text('Tap or press Space to start', 282, 15, '#fff');
    } else {
      const won = state === 'won';
      text(won ? 'Cleared!' : 'Boom', 180, 32, won ? '#6ee7a8' : '#ff5f56');
      text(`Time ${clock(elapsed())}`, 216, 17, '#cdd6e4');
      if (won && best !== null) text(`Best ${clock(best)}`, 240, 15, '#cdd6e4');
      text('Tap or press Space to play again', 282, 14, '#cdd6e4');
    }
  }
}

function frame() {
  draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
