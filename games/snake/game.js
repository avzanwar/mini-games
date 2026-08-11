// Snake — plain canvas, no assets, no dependencies.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 400
const H = canvas.height;         // 440
const HUD_H = 40;                // score strip along the top
const CELL = 20;
const COLS = W / CELL;           // 20
const ROWS = (H - HUD_H) / CELL; // 20

const STEP_START = 140;          // ms between moves at score 0
const STEP_MIN = 70;             // fastest it ever gets
const STEP_PER_FOOD = 3;         // ms shaved off per food eaten

const SWIPE_MIN = 20;            // px of drag before it counts as a swipe
const RESTART_DELAY = 400;       // ms before a game-over tap restarts

// --- State ------------------------------------------------------------------
let snake, dir, pendingDir, food, score, state, won, acc, overAt;
let best = Number(localStorage.getItem('snake-best')) || 0;

function reset() {
  const midY = Math.floor(ROWS / 2);
  snake = [{ x: 5, y: midY }, { x: 4, y: midY }, { x: 3, y: midY }];
  dir = { x: 1, y: 0 };
  pendingDir = dir;
  score = 0;
  state = 'ready';
  won = false;
  acc = 0;
  overAt = 0;
  placeFood();
}

function placeFood() {
  const taken = new Set(snake.map((c) => c.x + ',' + c.y));
  const free = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!taken.has(x + ',' + y)) free.push({ x, y });
    }
  }
  food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

function stepMs() {
  return Math.max(STEP_MIN, STEP_START - score * STEP_PER_FOOD);
}

// --- Input ------------------------------------------------------------------
function steer(x, y) {
  // Ignore a reversal into the neck; compare against the direction we last
  // actually moved, not the queued one, so two fast turns can't double back.
  if (x === -dir.x && y === -dir.y) return;
  pendingDir = { x, y };
  if (state === 'ready') state = 'playing';
}

function tap() {
  if (state === 'ready') state = 'playing';
  else if (state === 'over' && performance.now() - overAt > RESTART_DELAY) reset();
}

const KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

window.addEventListener('keydown', (e) => {
  const move = KEYS[e.code];
  if (move) {
    e.preventDefault();
    if (state === 'over') tap();
    else steer(move[0], move[1]);
  } else if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    tap();
  }
});

// Touch/mouse: a drag is a turn, a tap is start/restart.
let swipeStart = null;
canvas.addEventListener('pointerdown', (e) => {
  swipeStart = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  if (!swipeStart) return;
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  swipeStart = null;

  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) {
    tap();
  } else if (state !== 'over') {
    if (Math.abs(dx) > Math.abs(dy)) steer(Math.sign(dx), 0);
    else steer(0, Math.sign(dy));
  }
});

// --- Update -----------------------------------------------------------------
function gameOver() {
  state = 'over';
  overAt = performance.now();
  if (score > best) {
    best = score;
    localStorage.setItem('snake-best', String(best));
  }
}

function step() {
  dir = pendingDir;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  const hitWall = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
  // The tail cell is about to move out from under us, so it isn't a collision
  // unless we're also growing into it this step.
  const eating = food && head.x === food.x && head.y === food.y;
  const body = eating ? snake : snake.slice(0, -1);
  if (hitWall || body.some((c) => c.x === head.x && c.y === head.y)) {
    gameOver();
    return;
  }

  snake.unshift(head);
  if (eating) {
    score++;
    placeFood();
    if (!food) {           // board is full — nothing left to eat
      won = true;
      gameOver();
    }
  } else {
    snake.pop();
  }
}

function update(dt) {
  if (state !== 'playing') return;
  acc += dt;
  while (acc >= stepMs() && state === 'playing') {
    acc -= stepMs();
    step();
  }
}

// --- Draw -------------------------------------------------------------------
function cellRect(c, inset, radius) {
  ctx.beginPath();
  ctx.roundRect(
    c.x * CELL + inset,
    HUD_H + c.y * CELL + inset,
    CELL - inset * 2,
    CELL - inset * 2,
    radius
  );
  ctx.fill();
}

function drawEyes() {
  const head = snake[0];
  const cx = head.x * CELL + CELL / 2;
  const cy = HUD_H + head.y * CELL + CELL / 2;
  // Sit the eyes either side of the direction of travel.
  const ax = dir.y === 0 ? 3 : 5;
  const ay = dir.y === 0 ? 5 : 3;

  ctx.fillStyle = '#0f1a12';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + dir.x * 3 + (dir.y === 0 ? 0 : s * ax),
            cy + dir.y * 3 + (dir.y === 0 ? s * ay : 0), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
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

function draw() {
  // HUD strip
  ctx.fillStyle = '#0e1520';
  ctx.fillRect(0, 0, W, HUD_H);
  ctx.font = 'bold 18px system-ui, sans-serif';
  // Score sits centred and Best right — the top-left stays clear so the
  // "All games" link doesn't land on top of it on a full-width phone screen.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8ecf3';
  ctx.fillText(`Score ${score}`, W / 2, 27);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7c8aa3';
  ctx.fillText(`Best ${best}`, W - 14, 27);

  // Board, with a faint checker so the grid reads without hard lines
  ctx.fillStyle = '#16202e';
  ctx.fillRect(0, HUD_H, W, H - HUD_H);
  ctx.fillStyle = '#1a2536';
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if ((x + y) % 2) ctx.fillRect(x * CELL, HUD_H + y * CELL, CELL, CELL);
    }
  }

  if (food) {
    ctx.fillStyle = '#ff5f56';
    cellRect(food, 3, 7);
  }

  for (let i = snake.length - 1; i >= 0; i--) {
    // Fade from bright head to a duller tail.
    ctx.fillStyle = i === 0 ? '#7ee787' : `hsl(135, 45%, ${52 - Math.min(i, 12) * 1.6}%)`;
    cellRect(snake[i], 1.5, 5);
  }
  drawEyes();

  if (state === 'ready') {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.55)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    text('Snake', 190, 34, '#fff');
    text('Swipe or use the arrow keys', 228, 16, '#cdd6e4');
  } else if (state === 'over') {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.65)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    text(won ? 'You Win!' : 'Game Over', 205, 34, '#fff');
    text(`Score ${score}   ·   Best ${best}`, 240, 18, '#cdd6e4');
    text('Tap or press Space to play again', 275, 15, '#cdd6e4');
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
