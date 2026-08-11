// Sudoku — plain canvas, no assets, no dependencies.
// Puzzles are generated at run time and dug out only as far as uniqueness allows.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 360
const H = canvas.height;         // 510
const HUD_H = 40;

const CELL = 36;
const GX = (W - CELL * 9) / 2;   // 18
const GY = 56;
const GRID = CELL * 9;           // 324

const PAD_Y = 394;               // the 1-9 keypad
const PAD_H = 44;
const ACT_Y = 452;               // notes / erase / new
const ACT_H = 38;
const ACT_W = (GRID - 24) / 3;   // 100

const MAX_MISTAKES = 3;
const LEVELS = [
  { name: 'Easy', givens: 42 },
  { name: 'Medium', givens: 32 },
  { name: 'Hard', givens: 26 },
];

// --- Generator --------------------------------------------------------------
function allowed(g, r, c, v) {
  for (let i = 0; i < 9; i++) {
    if (g[r * 9 + i] === v) return false;
    if (g[i * 9 + c] === v) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (g[(br + i) * 9 + bc + j] === v) return false;
    }
  }
  return true;
}

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fill(g) {
  const idx = g.indexOf(0);
  if (idx < 0) return true;
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  for (const v of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (!allowed(g, r, c, v)) continue;
    g[idx] = v;
    if (fill(g)) return true;
    g[idx] = 0;
  }
  return false;
}

// Counts solutions but stops as soon as `limit` is reached, so checking for a
// second solution costs barely more than finding the first.
function countSolutions(g, limit) {
  const idx = g.indexOf(0);
  if (idx < 0) return 1;
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  let total = 0;
  for (let v = 1; v <= 9; v++) {
    if (!allowed(g, r, c, v)) continue;
    g[idx] = v;
    total += countSolutions(g, limit - total);
    g[idx] = 0;
    if (total >= limit) break;
  }
  return total;
}

function makePuzzle(targetGivens) {
  const solution = new Array(81).fill(0);
  fill(solution);
  const puzzle = solution.slice();
  let givens = 81;
  // Take cells away one at a time, putting any back that would leave the
  // puzzle with more than one answer.
  for (const i of shuffled([...Array(81).keys()])) {
    if (givens <= targetGivens) break;
    const saved = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle.slice(), 2) === 1) givens--;
    else puzzle[i] = saved;
  }
  return { puzzle, solution, givens };
}

// --- State ------------------------------------------------------------------
let puzzle, solution, entries, notes, wrong;
let selected, notesMode, mistakes, level, state, startTime, endTime;
let best = loadBest();

function loadBest() {
  try {
    const raw = JSON.parse(localStorage.getItem('sudoku-best'));
    if (raw && typeof raw === 'object') return raw;
  } catch (e) { /* absent or corrupt */ }
  return {};
}

function reset() {
  state = 'menu';
  selected = -1;
  notesMode = false;
  mistakes = 0;
  startTime = 0;
  endTime = 0;
  puzzle = new Array(81).fill(0);
  solution = new Array(81).fill(0);
  entries = new Array(81).fill(0);
  notes = new Array(81).fill(0);
  wrong = new Array(81).fill(false);
}

function start(levelIndex) {
  level = levelIndex;
  const made = makePuzzle(LEVELS[levelIndex].givens);
  puzzle = made.puzzle;
  solution = made.solution;
  entries = puzzle.slice();
  notes = new Array(81).fill(0);
  wrong = new Array(81).fill(false);
  selected = -1;
  notesMode = false;
  mistakes = 0;
  startTime = Date.now();
  endTime = 0;
  state = 'playing';
}

const isGiven = (i) => puzzle[i] !== 0;

function elapsed() {
  if (!startTime) return 0;
  return Math.floor(((endTime || Date.now()) - startTime) / 1000);
}

function clock(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// --- Play -------------------------------------------------------------------
function place(v) {
  if (state !== 'playing' || selected < 0 || isGiven(selected)) return;

  if (notesMode) {
    if (entries[selected]) return;          // a filled cell has no notes
    notes[selected] ^= 1 << (v - 1);
    return;
  }

  if (entries[selected] === v) {            // tapping the same digit clears it
    entries[selected] = 0;
    wrong[selected] = false;
    return;
  }

  entries[selected] = v;
  notes[selected] = 0;
  wrong[selected] = v !== solution[selected];
  if (wrong[selected]) {
    mistakes++;
    if (mistakes >= MAX_MISTAKES) {
      state = 'lost';
      endTime = Date.now();
    }
    return;
  }
  // A correct entry clears that digit from the notes of its row, column and box.
  const r = Math.floor(selected / 9);
  const c = selected % 9;
  for (let i = 0; i < 9; i++) {
    notes[r * 9 + i] &= ~(1 << (v - 1));
    notes[i * 9 + c] &= ~(1 << (v - 1));
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) notes[(br + i) * 9 + bc + j] &= ~(1 << (v - 1));
  }

  if (entries.every((e, i) => e === solution[i])) {
    state = 'won';
    endTime = Date.now();
    const secs = elapsed();
    const key = LEVELS[level].name;
    if (best[key] === undefined || secs < best[key]) {
      best[key] = secs;
      localStorage.setItem('sudoku-best', JSON.stringify(best));
    }
  }
}

function erase() {
  if (state !== 'playing' || selected < 0 || isGiven(selected)) return;
  entries[selected] = 0;
  notes[selected] = 0;
  wrong[selected] = false;
}

// --- Input ------------------------------------------------------------------
function inRect(x, y, rx, ry, rw, rh) {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

function hitTest(x, y) {
  if (state === 'menu' || state === 'won' || state === 'lost') {
    for (let i = 0; i < 3; i++) {
      const by = 250 + i * 52;
      if (inRect(x, y, 90, by, 180, 44)) return { kind: 'level', index: i };
    }
    return null;
  }
  if (inRect(x, y, GX, GY, GRID, GRID)) {
    const c = Math.floor((x - GX) / CELL);
    const r = Math.floor((y - GY) / CELL);
    return { kind: 'cell', index: r * 9 + c };
  }
  for (let d = 0; d < 9; d++) {
    if (inRect(x, y, GX + d * CELL, PAD_Y, CELL, PAD_H)) return { kind: 'digit', value: d + 1 };
  }
  for (let a = 0; a < 3; a++) {
    if (inRect(x, y, GX + a * (ACT_W + 12), ACT_Y, ACT_W, ACT_H)) {
      return { kind: ['notes', 'erase', 'new'][a] };
    }
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (W / rect.width);
  const y = (e.clientY - rect.top) * (H / rect.height);
  const hit = hitTest(x, y);
  if (!hit) return;

  if (hit.kind === 'level') { start(hit.index); return; }
  if (hit.kind === 'cell') { selected = hit.index; return; }
  if (hit.kind === 'digit') { place(hit.value); return; }
  if (hit.kind === 'notes') { notesMode = !notesMode; return; }
  if (hit.kind === 'erase') { erase(); return; }
  if (hit.kind === 'new') { state = 'menu'; return; }
});

window.addEventListener('keydown', (e) => {
  if (state !== 'playing') return;
  if (e.key >= '1' && e.key <= '9') { e.preventDefault(); place(Number(e.key)); return; }
  if (e.code === 'Backspace' || e.code === 'Delete' || e.key === '0') { e.preventDefault(); erase(); return; }
  if (e.code === 'KeyN') { notesMode = !notesMode; return; }
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.code];
  if (step !== undefined) {
    e.preventDefault();
    if (selected < 0) selected = 40;
    else selected = Math.max(0, Math.min(80, selected + step));
  }
});

// --- Draw -------------------------------------------------------------------
function centred(str, x, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function button(x, y, w, h, label, active) {
  ctx.fillStyle = active ? '#2c4a7a' : '#1e2839';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  centred(label, x + w / 2, y + h / 2, 'bold 15px system-ui, sans-serif', '#e8ecf3');
}

function drawGrid() {
  ctx.fillStyle = '#1a2332';
  ctx.fillRect(GX, GY, GRID, GRID);

  const selRow = selected >= 0 ? Math.floor(selected / 9) : -1;
  const selCol = selected >= 0 ? selected % 9 : -1;
  const selVal = selected >= 0 ? entries[selected] : 0;

  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const x = GX + c * CELL;
    const y = GY + r * CELL;

    const sameBox = selected >= 0 &&
      Math.floor(r / 3) === Math.floor(selRow / 3) && Math.floor(c / 3) === Math.floor(selCol / 3);
    if (i === selected) ctx.fillStyle = '#2c4a7a';
    else if (selVal && entries[i] === selVal) ctx.fillStyle = '#2a3d5c';
    else if (r === selRow || c === selCol || sameBox) ctx.fillStyle = '#202c40';
    else ctx.fillStyle = '#1a2332';
    ctx.fillRect(x, y, CELL, CELL);

    const v = entries[i];
    if (v) {
      const color = isGiven(i) ? '#e8ecf3' : wrong[i] ? '#ff5f56' : '#5bc8f5';
      centred(String(v), x + CELL / 2, y + CELL / 2 + 1,
              `bold 21px system-ui, sans-serif`, color);
    } else if (notes[i]) {
      for (let n = 1; n <= 9; n++) {
        if (!(notes[i] & (1 << (n - 1)))) continue;
        const nx = x + 6 + ((n - 1) % 3) * 12;
        const ny = y + 8 + Math.floor((n - 1) / 3) * 11;
        centred(String(n), nx, ny, '9px system-ui, sans-serif', '#7c8aa3');
      }
    }
  }

  for (let i = 0; i <= 9; i++) {
    const thick = i % 3 === 0;
    ctx.strokeStyle = thick ? '#6b7d99' : '#33415c';
    ctx.lineWidth = thick ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(GX + i * CELL, GY);
    ctx.lineTo(GX + i * CELL, GY + GRID);
    ctx.moveTo(GX, GY + i * CELL);
    ctx.lineTo(GX + GRID, GY + i * CELL);
    ctx.stroke();
  }
}

function draw() {
  ctx.fillStyle = '#12161f';
  ctx.fillRect(0, 0, W, H);

  if (state === 'menu') {
    centred('Sudoku', W / 2, 150, 'bold 34px system-ui, sans-serif', '#fff');
    centred('Pick a difficulty', W / 2, 190, 'bold 15px system-ui, sans-serif', '#7c8aa3');
    LEVELS.forEach((lv, i) => {
      const label = best[lv.name] !== undefined
        ? `${lv.name}   ·   best ${clock(best[lv.name])}` : lv.name;
      button(90, 250 + i * 52, 180, 44, label, false);
    });
    return;
  }

  // HUD — level and clock centred, mistakes right, top-left clear.
  centred(`${LEVELS[level].name}  ·  ${clock(elapsed())}`, W / 2, 24,
          'bold 15px system-ui, sans-serif', '#cdd6e4');
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = mistakes ? '#ff5f56' : '#7c8aa3';
  ctx.fillText(`${MAX_MISTAKES - mistakes} left`, W - 12, 24);

  drawGrid();

  for (let d = 1; d <= 9; d++) {
    const x = GX + (d - 1) * CELL;
    ctx.fillStyle = '#1e2839';
    ctx.beginPath();
    ctx.roundRect(x + 1, PAD_Y, CELL - 2, PAD_H, 6);
    ctx.fill();
    // Grey out a digit once all nine of it are placed.
    const used = entries.filter((e) => e === d).length >= 9;
    centred(String(d), x + CELL / 2, PAD_Y + PAD_H / 2,
            'bold 20px system-ui, sans-serif', used ? '#3d4a61' : '#e8ecf3');
  }

  button(GX, ACT_Y, ACT_W, ACT_H, notesMode ? 'Notes on' : 'Notes', notesMode);
  button(GX + ACT_W + 12, ACT_Y, ACT_W, ACT_H, 'Erase', false);
  button(GX + (ACT_W + 12) * 2, ACT_Y, ACT_W, ACT_H, 'New', false);

  if (state === 'won' || state === 'lost') {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.9)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    const won = state === 'won';
    centred(won ? 'Solved!' : 'Out of tries', W / 2, 170,
            'bold 32px system-ui, sans-serif', won ? '#6ee7a8' : '#ff5f56');
    centred(won ? `${LEVELS[level].name} in ${clock(elapsed())}` : 'Three mistakes — that is it',
            W / 2, 208, 'bold 15px system-ui, sans-serif', '#cdd6e4');
    centred('Pick a difficulty to play again', W / 2, 232,
            'bold 13px system-ui, sans-serif', '#7c8aa3');
    LEVELS.forEach((lv, i) => {
      const label = best[lv.name] !== undefined
        ? `${lv.name}   ·   best ${clock(best[lv.name])}` : lv.name;
      button(90, 250 + i * 52, 180, 44, label, false);
    });
  }
}

function frame() {
  draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
