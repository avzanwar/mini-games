// Breakout — plain canvas, no assets, no dependencies.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 400
const H = canvas.height;         // 560
const HUD_H = 40;                // score strip along the top

const COLS = 8;
const ROWS = 5;
const BRICK_W = 44;
const BRICK_H = 18;
const BRICK_GAP = 4;
const BRICK_TOP = HUD_H + 24;
const BRICK_LEFT = (W - (COLS * BRICK_W + (COLS - 1) * BRICK_GAP)) / 2;

const PADDLE_W = 76;
const PADDLE_H = 12;
const PADDLE_Y = H - 44;
const PADDLE_KEY_SPEED = 420;    // px per second when steering with the keyboard

const BALL_R = 7;
const BALL_SPEED = 290;          // px per second at the start of a life
const SPEED_PER_BRICK = 1.6;     // and how much faster per brick cleared
const MAX_BOUNCE_ANGLE = Math.PI / 3;   // 60° off vertical at the paddle's edge
const MIN_BOUNCE_ANGLE = Math.PI / 12;  // and never less than 15° — see setBallAngle

const START_LIVES = 3;
const RESTART_DELAY = 400;       // ms before a game-over tap restarts

const ROW_COLORS = ['#ff5f56', '#ff9f43', '#ffd93d', '#6ee7a8', '#5bc8f5'];

// --- State ------------------------------------------------------------------
let paddleX, ball, bricks, score, lives, state, overAt;
const keys = new Set();
let best = Number(localStorage.getItem('breakout-best')) || 0;

function reset() {
  paddleX = (W - PADDLE_W) / 2;
  score = 0;
  lives = START_LIVES;
  overAt = 0;
  bricks = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      bricks.push({
        x: BRICK_LEFT + col * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + row * (BRICK_H + BRICK_GAP),
        color: ROW_COLORS[row],
        points: (ROWS - row) * 10,
        alive: true,
      });
    }
  }
  newBall();
}

// Park the ball on the paddle and wait for a launch.
function newBall() {
  ball = { x: paddleX + PADDLE_W / 2, y: PADDLE_Y - BALL_R, vx: 0, vy: 0 };
  state = 'ready';
}

// Send the ball upward at `angle` off vertical, never steeper than
// MAX_BOUNCE_ANGLE and never flatter than MIN_BOUNCE_ANGLE. That floor
// matters: at exactly 0 the ball travels in a dead straight column, and once
// it has cleared that column it bounces between paddle and ceiling forever
// without ever reaching another brick.
function setBallAngle(angle) {
  const capped = Math.max(-MAX_BOUNCE_ANGLE, Math.min(MAX_BOUNCE_ANGLE, angle));
  const sign = capped === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(capped);
  const final = Math.abs(capped) < MIN_BOUNCE_ANGLE ? sign * MIN_BOUNCE_ANGLE : capped;
  const speed = ballSpeed();
  ball.vx = speed * Math.sin(final);
  ball.vy = -speed * Math.cos(final);
}

function launch() {
  setBallAngle((Math.random() * 0.5 - 0.25) * Math.PI);
  state = 'playing';
}

function ballSpeed() {
  return BALL_SPEED + bricks.filter((b) => !b.alive).length * SPEED_PER_BRICK;
}

// --- Input ------------------------------------------------------------------
function tap() {
  if (state === 'ready') launch();
  else if ((state === 'over' || state === 'won') &&
           performance.now() - overAt > RESTART_DELAY) reset();
}

function movePaddleTo(clientX) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (W / rect.width);
  paddleX = Math.max(0, Math.min(W - PADDLE_W, x - PADDLE_W / 2));
}

// Pointer covers both cases: on desktop the paddle tracks the mouse as it moves
// across the canvas, on touch it only fires while a finger is down.
canvas.addEventListener('pointermove', (e) => movePaddleTo(e.clientX));
canvas.addEventListener('pointerdown', (e) => {
  movePaddleTo(e.clientX);
  tap();
});

window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
    e.preventDefault();
    keys.add(e.code);
  } else if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    tap();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// --- Update -----------------------------------------------------------------
function gameOver(didWin) {
  state = didWin ? 'won' : 'over';
  overAt = performance.now();
  if (score > best) {
    best = score;
    localStorage.setItem('breakout-best', String(best));
  }
}

function updatePaddle(dt) {
  let dir = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) dir -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) dir += 1;
  if (dir) {
    paddleX = Math.max(0, Math.min(W - PADDLE_W, paddleX + dir * PADDLE_KEY_SPEED * dt));
  }
}

function bounceOffPaddle() {
  // Where the ball lands on the paddle sets the angle: middle goes straight
  // up, edges go out at up to MAX_BOUNCE_ANGLE. That's the only real control
  // the player has over the ball.
  const hit = (ball.x - (paddleX + PADDLE_W / 2)) / (PADDLE_W / 2);
  setBallAngle(Math.max(-1, Math.min(1, hit)) * MAX_BOUNCE_ANGLE);
  ball.y = PADDLE_Y - BALL_R;
}

function hitBricks(dt) {
  for (const brick of bricks) {
    if (!brick.alive) continue;
    const overlaps = ball.x + BALL_R > brick.x && ball.x - BALL_R < brick.x + BRICK_W &&
                     ball.y + BALL_R > brick.y && ball.y - BALL_R < brick.y + BRICK_H;
    if (!overlaps) continue;

    // Work out which face we came through from where the ball was last frame:
    // if it was already inside the brick's columns, we hit the top or bottom.
    const prevX = ball.x - ball.vx * dt;
    const wasBesideIt = prevX + BALL_R <= brick.x || prevX - BALL_R >= brick.x + BRICK_W;
    if (wasBesideIt) ball.vx = -ball.vx;
    else ball.vy = -ball.vy;

    brick.alive = false;
    score += brick.points;
    return;  // at most one brick per frame keeps the bounce predictable
  }
}

function update(dt) {
  updatePaddle(dt);

  if (state === 'ready') {
    ball.x = paddleX + PADDLE_W / 2;
    ball.y = PADDLE_Y - BALL_R;
    return;
  }
  if (state !== 'playing') return;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x - BALL_R < 0) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); }
  if (ball.x + BALL_R > W) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); }
  if (ball.y - BALL_R < HUD_H) { ball.y = HUD_H + BALL_R; ball.vy = Math.abs(ball.vy); }

  const onPaddle = ball.vy > 0 &&
    ball.y + BALL_R >= PADDLE_Y && ball.y - BALL_R <= PADDLE_Y + PADDLE_H &&
    ball.x + BALL_R >= paddleX && ball.x - BALL_R <= paddleX + PADDLE_W;
  if (onPaddle) bounceOffPaddle();

  hitBricks(dt);

  if (bricks.every((b) => !b.alive)) {
    gameOver(true);
  } else if (ball.y - BALL_R > H) {
    lives--;
    if (lives <= 0) gameOver(false);
    else newBall();
  }
}

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

function draw() {
  ctx.fillStyle = '#16202e';
  ctx.fillRect(0, 0, W, H);

  // HUD. Score is centred and lives sit right, so the top-left stays clear for
  // the "All games" link on a full-width phone screen.
  ctx.fillStyle = '#0e1520';
  ctx.fillRect(0, 0, W, HUD_H);
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8ecf3';
  ctx.fillText(`Score ${score}`, W / 2, 27);
  for (let i = 0; i < lives; i++) {
    ctx.fillStyle = '#ff5f56';
    ctx.beginPath();
    ctx.arc(W - 18 - i * 18, 21, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const brick of bricks) {
    if (!brick.alive) continue;
    ctx.fillStyle = brick.color;
    ctx.beginPath();
    ctx.roundRect(brick.x, brick.y, BRICK_W, BRICK_H, 4);
    ctx.fill();
  }

  ctx.fillStyle = '#e8ecf3';
  ctx.beginPath();
  ctx.roundRect(paddleX, PADDLE_Y, PADDLE_W, PADDLE_H, 6);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  if (state === 'ready') {
    text('Drag or use ← →', 250, 20, '#cdd6e4');
    text('Tap or press Space to launch', 280, 16, '#cdd6e4');
  } else if (state === 'over' || state === 'won') {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.7)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    text(state === 'won' ? 'You Win!' : 'Game Over', 250, 36, '#fff');
    text(`Score ${score}   ·   Best ${best}`, 288, 18, '#cdd6e4');
    text('Tap or press Space to play again', 324, 15, '#cdd6e4');
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
