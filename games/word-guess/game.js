// Word Guess — plain canvas, no assets, no dependencies.
// Six tries at a five-letter word. Guesses are not checked against a
// dictionary, so a real word is never wrongly rejected.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 360
const H = canvas.height;         // 560
const HUD_H = 40;

const LEN = 5;
const TRIES = 6;
const TILE = 52;
const TGAP = 6;
const BX = (W - (LEN * TILE + (LEN - 1) * TGAP)) / 2;   // 38
const BY = 52;

const KEY_W = 31;
const KEY_H = 42;
const KEY_GAP = 4;
const WIDE_W = 46;
const KEY_ROWS_Y = [412, 460, 508];

const MESSAGE_MS = 1400;

const CORRECT = '#4fa84f';
const PRESENT = '#c9a227';
const ABSENT = '#333a48';
const TILE_EMPTY = '#12161f';
const TILE_EDGE = '#39425a';
const TILE_FILLED_EDGE = '#5b6880';

// --- Keyboard layout --------------------------------------------------------
function buildKeys() {
  const keys = [];
  const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

  rows.forEach((row, r) => {
    const letters = row.split('');
    const wide = r === 2 ? WIDE_W * 2 + KEY_GAP * 2 : 0;
    const width = letters.length * KEY_W + (letters.length - 1) * KEY_GAP + wide;
    let x = (W - width) / 2;
    if (r === 2) {
      keys.push({ ch: 'ENTER', x, y: KEY_ROWS_Y[r], w: WIDE_W, h: KEY_H });
      x += WIDE_W + KEY_GAP;
    }
    letters.forEach((ch) => {
      keys.push({ ch, x, y: KEY_ROWS_Y[r], w: KEY_W, h: KEY_H });
      x += KEY_W + KEY_GAP;
    });
    if (r === 2) keys.push({ ch: 'BACK', x, y: KEY_ROWS_Y[r], w: WIDE_W, h: KEY_H });
  });
  return keys;
}

const KEYS = buildKeys();

// --- State ------------------------------------------------------------------
let answer, guesses, marks, current, state, keyState, message, messageUntil;
let stats = loadStats();

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem('wordguess-stats'));
    if (raw && typeof raw.played === 'number') return raw;
  } catch (e) { /* absent or corrupt */ }
  return { played: 0, won: 0, streak: 0, best: 0 };
}

function reset() {
  answer = WORDS[Math.floor(Math.random() * WORDS.length)];
  guesses = [];
  marks = [];
  current = '';
  keyState = {};
  state = 'playing';
  message = '';
  messageUntil = 0;
}

function say(text) {
  message = text;
  messageUntil = performance.now() + MESSAGE_MS;
}

// --- Scoring ----------------------------------------------------------------
// Two passes, so repeated letters behave: exact hits are claimed first, then
// each remaining letter of the answer can only be matched once.
function score(guess, target) {
  const result = new Array(LEN).fill('absent');
  const left = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === target[i]) result[i] = 'correct';
    else left[target[i]] = (left[target[i]] || 0) + 1;
  }
  for (let i = 0; i < LEN; i++) {
    if (result[i] === 'correct') continue;
    const ch = guess[i];
    if (left[ch] > 0) { result[i] = 'present'; left[ch]--; }
  }
  return result;
}

const RANK = { absent: 0, present: 1, correct: 2 };

function submit() {
  if (state !== 'playing') return;
  if (current.length < LEN) { say('Needs five letters'); return; }

  const result = score(current, answer);
  guesses.push(current);
  marks.push(result);
  for (let i = 0; i < LEN; i++) {
    const ch = current[i];
    if (RANK[result[i]] > RANK[keyState[ch] || 'absent'] || !keyState[ch]) {
      keyState[ch] = result[i];
    }
  }

  const won = current === answer;
  current = '';
  if (won || guesses.length === TRIES) {
    state = won ? 'won' : 'lost';
    stats.played++;
    if (won) {
      stats.won++;
      stats.streak++;
      if (stats.streak > stats.best) stats.best = stats.streak;
    } else {
      stats.streak = 0;
    }
    localStorage.setItem('wordguess-stats', JSON.stringify(stats));
  }
}

function typeLetter(ch) {
  if (state !== 'playing' || current.length >= LEN) return;
  current += ch;
}

function backspace() {
  if (state !== 'playing') return;
  current = current.slice(0, -1);
}

function press(ch) {
  if (ch === 'ENTER') submit();
  else if (ch === 'BACK') backspace();
  else typeLetter(ch);
}

// --- Input ------------------------------------------------------------------
function keyAt(x, y) {
  for (const k of KEYS) {
    if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) return k.ch;
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (W / rect.width);
  const y = (e.clientY - rect.top) * (H / rect.height);

  if (state !== 'playing') {
    // Anywhere outside the keyboard starts the next word.
    if (y < KEY_ROWS_Y[0] - 8) reset();
    return;
  }
  const ch = keyAt(x, y);
  if (ch) press(ch);
});

window.addEventListener('keydown', (e) => {
  if (state !== 'playing') {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); reset(); }
    return;
  }
  if (e.code === 'Enter') { e.preventDefault(); submit(); return; }
  if (e.code === 'Backspace') { e.preventDefault(); backspace(); return; }
  const ch = e.key.toUpperCase();
  if (ch.length === 1 && ch >= 'A' && ch <= 'Z') typeLetter(ch);
});

// --- Draw -------------------------------------------------------------------
function centred(str, x, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function draw() {
  ctx.fillStyle = '#12161f';
  ctx.fillRect(0, 0, W, H);

  // HUD — status centred, streak right, top-left clear for the back link.
  const showing = message && performance.now() < messageUntil;
  const status = showing ? message
    : state === 'playing' ? `Guess ${guesses.length + 1} of ${TRIES}`
    : state === 'won' ? 'Got it' : answer;
  centred(status, W / 2, 24, 'bold 15px system-ui, sans-serif',
          showing ? '#ffd93d' : '#cdd6e4');
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7c8aa3';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(`Streak ${stats.streak}`, W - 12, 24);

  // Board
  for (let r = 0; r < TRIES; r++) {
    for (let c = 0; c < LEN; c++) {
      const x = BX + c * (TILE + TGAP);
      const y = BY + r * (TILE + TGAP);
      let letter = '';
      let fill = TILE_EMPTY;
      let edge = TILE_EDGE;

      if (r < guesses.length) {
        letter = guesses[r][c];
        fill = { correct: CORRECT, present: PRESENT, absent: ABSENT }[marks[r][c]];
        edge = fill;
      } else if (r === guesses.length && c < current.length) {
        letter = current[c];
        edge = TILE_FILLED_EDGE;
      }

      ctx.fillStyle = fill;
      roundRect(x, y, TILE, TILE, 5);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      roundRect(x, y, TILE, TILE, 5);
      ctx.stroke();
      if (letter) centred(letter, x + TILE / 2, y + TILE / 2 + 1,
                          'bold 26px system-ui, sans-serif', '#fff');
    }
  }

  // Keyboard
  for (const k of KEYS) {
    const st = keyState[k.ch];
    ctx.fillStyle = st ? { correct: CORRECT, present: PRESENT, absent: ABSENT }[st] : '#4a5468';
    roundRect(k.x, k.y, k.w, k.h, 5);
    ctx.fill();
    const label = k.ch === 'BACK' ? '⌫' : k.ch === 'ENTER' ? '↵' : k.ch;
    centred(label, k.x + k.w / 2, k.y + k.h / 2 + 1,
            `bold ${k.ch.length > 1 ? 17 : 15}px system-ui, sans-serif`, '#fff');
  }

  if (state !== 'playing') {
    const pct = stats.played ? Math.round(stats.won / stats.played * 100) : 0;
    ctx.fillStyle = 'rgba(10, 14, 20, 0.93)';
    roundRect(30, 150, W - 60, 170, 12);
    ctx.fill();
    centred(state === 'won' ? 'Solved!' : 'Out of guesses', W / 2, 190,
            'bold 26px system-ui, sans-serif', state === 'won' ? '#6ee7a8' : '#ff5f56');
    centred(state === 'won' ? `${answer} in ${guesses.length}` : `It was ${answer}`,
            W / 2, 224, 'bold 17px system-ui, sans-serif', '#e8ecf3');
    centred(`Played ${stats.played}  ·  ${pct}% won  ·  best streak ${stats.best}`,
            W / 2, 254, 'bold 12px system-ui, sans-serif', '#7c8aa3');
    centred('Tap above the keyboard for a new word', W / 2, 292,
            'bold 13px system-ui, sans-serif', '#cdd6e4');
  }
}

function frame() {
  draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
