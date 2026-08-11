// Connect Four — plain canvas, no assets, no dependencies.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 340
const H = canvas.height;         // 340
const HUD_H = 48;

const COLS = 7;
const ROWS = 6;
const CELL = 44;
const PAD = (W - COLS * CELL) / 2;   // 16
const BOARD_Y = 58;
const DISC_R = 18;

const YOU = 'you';
const CPU = 'cpu';
const COLORS = { you: '#ff5f56', cpu: '#ffd93d' };

const FALL_SPEED = 1000;         // px per second
const CPU_THINK = 0.45;          // seconds of "thinking" before the CPU plays
const RESTART_DELAY = 0.4;

// --- State ------------------------------------------------------------------
let board, turn, state, falling, cpuTimer, winLine, hoverCol, overAt;
let record = loadRecord();

function loadRecord() {
  try {
    const raw = JSON.parse(localStorage.getItem('connect4-record'));
    if (raw && typeof raw.w === 'number') return raw;
  } catch (e) { /* corrupt or absent — start fresh */ }
  return { w: 0, l: 0, d: 0 };
}

function saveRecord() {
  localStorage.setItem('connect4-record', JSON.stringify(record));
}

function reset() {
  board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  turn = YOU;
  falling = null;
  cpuTimer = 0;
  winLine = null;
  hoverCol = -1;
  overAt = 0;
  state = 'ready';
}

function lowestEmpty(col) {
  for (let r = ROWS - 1; r >= 0; r--) if (!board[r][col]) return r;
  return -1;
}

function validCols() {
  const out = [];
  for (let c = 0; c < COLS; c++) if (lowestEmpty(c) >= 0) out.push(c);
  return out;
}

// The four cells through (r, c) that make a line for `p`, or null. Used both
// to end the game and to let the CPU test moves before committing to them.
function lineAt(r, c, p) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [[r, c]];
    for (const s of [1, -1]) {
      let rr = r + dr * s;
      let cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr][cc] === p) {
        cells.push([rr, cc]);
        rr += dr * s;
        cc += dc * s;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

// --- CPU --------------------------------------------------------------------
function wouldWin(col, p) {
  const r = lowestEmpty(col);
  if (r < 0) return false;
  board[r][col] = p;
  const line = lineAt(r, col, p);
  board[r][col] = null;
  return !!line;
}

// Playing here would stack a disc right under the opponent's winning square.
function handsOverWin(col, p, opp) {
  const r = lowestEmpty(col);
  if (r <= 0) return false;
  board[r][col] = p;
  board[r - 1][col] = opp;
  const line = lineAt(r - 1, col, opp);
  board[r - 1][col] = null;
  board[r][col] = null;
  return !!line;
}

function cpuMove() {
  const valid = validCols();
  for (const c of valid) if (wouldWin(c, CPU)) return c;   // take the win
  for (const c of valid) if (wouldWin(c, YOU)) return c;   // else block one

  const safe = valid.filter((c) => !handsOverWin(c, CPU, YOU));
  const pool = safe.length ? safe : valid;
  // Otherwise favour the middle, where lines are easiest to build.
  const nearest = Math.min(...pool.map((c) => Math.abs(c - 3)));
  const picks = pool.filter((c) => Math.abs(c - 3) === nearest);
  return picks[Math.floor(Math.random() * picks.length)];
}

// --- Moves ------------------------------------------------------------------
function drop(col, player) {
  const row = lowestEmpty(col);
  if (row < 0) return false;
  falling = { col, row, player, y: BOARD_Y - CELL };
  return true;
}

function land() {
  const { col, row, player } = falling;
  board[row][col] = player;
  falling = null;

  winLine = lineAt(row, col, player);
  if (winLine) {
    state = player === YOU ? 'won' : 'lost';
    overAt = 0;
    if (player === YOU) record.w++; else record.l++;
    saveRecord();
    return;
  }
  if (!validCols().length) {
    state = 'draw';
    overAt = 0;
    record.d++;
    saveRecord();
    return;
  }
  turn = player === YOU ? CPU : YOU;
  if (turn === CPU) cpuTimer = CPU_THINK;
}

// --- Input ------------------------------------------------------------------
function colAt(clientX) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (W / rect.width);
  const c = Math.floor((x - PAD) / CELL);
  return c >= 0 && c < COLS ? c : -1;
}

canvas.addEventListener('pointermove', (e) => {
  hoverCol = state === 'playing' && turn === YOU && !falling ? colAt(e.clientX) : -1;
});
canvas.addEventListener('pointerleave', () => { hoverCol = -1; });

canvas.addEventListener('pointerdown', (e) => {
  if (state === 'ready') { state = 'playing'; return; }
  if (state === 'won' || state === 'lost' || state === 'draw') {
    if (overAt >= RESTART_DELAY) reset();
    return;
  }
  if (turn !== YOU || falling) return;
  const c = colAt(e.clientX);
  if (c >= 0) drop(c, YOU);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (state === 'ready') state = 'playing';
    else if (state === 'won' || state === 'lost' || state === 'draw') {
      if (overAt >= RESTART_DELAY) reset();
    }
  } else if (state === 'playing' && turn === YOU && !falling) {
    const n = '1234567'.indexOf(e.key);
    if (n >= 0) drop(n, YOU);
  }
});

// --- Update -----------------------------------------------------------------
function update(dt) {
  if (state === 'won' || state === 'lost' || state === 'draw') {
    overAt += dt;
    return;
  }
  if (state !== 'playing') return;

  if (falling) {
    const target = BOARD_Y + falling.row * CELL;
    falling.y += FALL_SPEED * dt;
    if (falling.y >= target) land();
    return;
  }
  if (turn === CPU) {
    cpuTimer -= dt;
    if (cpuTimer <= 0) drop(cpuMove(), CPU);
  }
}

// --- Draw -------------------------------------------------------------------
function disc(x, y, color, radius) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius === undefined ? DISC_R : radius, 0, Math.PI * 2);
  ctx.fill();
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

function statusLine() {
  if (state === 'won') return 'You win!';
  if (state === 'lost') return 'CPU wins';
  if (state === 'draw') return 'A draw';
  return turn === YOU && !falling ? 'Your turn' : 'Thinking…';
}

function draw() {
  ctx.fillStyle = '#12161f';
  ctx.fillRect(0, 0, W, H);

  // HUD — status centred, record right, top-left clear for the back link.
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8ecf3';
  ctx.fillText(statusLine(), W / 2, 26);
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7c8aa3';
  ctx.fillText(`You ${record.w} · CPU ${record.l}`, W - 12, 26);
  ctx.textBaseline = 'alphabetic';

  // A marker over the column the mouse is on
  if (hoverCol >= 0 && lowestEmpty(hoverCol) >= 0) {
    disc(PAD + hoverCol * CELL + CELL / 2, BOARD_Y - 14, 'rgba(255, 95, 86, 0.35)', 7);
  }

  // Board panel with holes punched through it
  ctx.fillStyle = '#1d3f8f';
  ctx.beginPath();
  ctx.roundRect(PAD - 6, BOARD_Y - 6, COLS * CELL + 12, ROWS * CELL + 12, 10);
  ctx.fill();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = PAD + c * CELL + CELL / 2;
      const y = BOARD_Y + r * CELL + CELL / 2;
      disc(x, y, board[r][c] ? COLORS[board[r][c]] : '#12161f');
    }
  }

  if (falling) {
    disc(PAD + falling.col * CELL + CELL / 2, falling.y + CELL / 2, COLORS[falling.player]);
  }

  if (winLine) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    for (const [r, c] of winLine) {
      ctx.beginPath();
      ctx.arc(PAD + c * CELL + CELL / 2, BOARD_Y + r * CELL + CELL / 2, DISC_R + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (state === 'ready') {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.88)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    text('Connect Four', 130, 30, '#fff');
    text('You are red — get four in a row', 166, 14, '#cdd6e4');
    text('Tap a column to drop a disc', 188, 14, '#cdd6e4');
    text('Tap or press Space to start', 236, 15, '#fff');
  } else if (state === 'won' || state === 'lost' || state === 'draw') {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.7)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    const tint = state === 'won' ? '#6ee7a8' : state === 'lost' ? '#ff5f56' : '#e8ecf3';
    text(statusLine(), 160, 32, tint);
    text(`You ${record.w}  ·  CPU ${record.l}  ·  Drawn ${record.d}`, 194, 14, '#cdd6e4');
    text('Tap or press Space to play again', 232, 14, '#cdd6e4');
  }
}

// --- Loop -------------------------------------------------------------------
let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
