// Flappy Bird — plain canvas, no assets, no dependencies.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 400
const H = canvas.height;         // 600
const GROUND_H = 80;
const SKY_H = H - GROUND_H;

const GRAVITY = 1600;            // px per second squared
const FLAP_VELOCITY = -430;      // px per second, upward
const MAX_FALL = 700;

const BIRD_X = 100;
const BIRD_R = 14;

const PIPE_WIDTH = 60;
const PIPE_GAP = 155;
const PIPE_SPEED = 155;          // px per second
const PIPE_SPACING = 210;        // horizontal gap between pipes
const PIPE_MARGIN = 70;          // keep gaps away from ceiling and ground

const RESTART_DELAY = 400;       // ms before a game-over tap restarts

// --- State ------------------------------------------------------------------
let bird, pipes, score, state, groundOffset, overAt;
let best = Number(localStorage.getItem('flappy-best')) || 0;

function reset() {
  bird = { y: SKY_H / 2, vy: 0 };
  pipes = [];
  score = 0;
  groundOffset = 0;
  overAt = 0;
  state = 'ready';
  addPipe(W + 80);
}

function addPipe(x) {
  const gapY = PIPE_MARGIN + Math.random() * (SKY_H - PIPE_GAP - PIPE_MARGIN * 2);
  pipes.push({ x, gapY, scored: false });
}

// --- Input ------------------------------------------------------------------
function flap() {
  if (state === 'ready') {
    state = 'playing';
    bird.vy = FLAP_VELOCITY;
  } else if (state === 'playing') {
    bird.vy = FLAP_VELOCITY;
  } else if (state === 'over' && performance.now() - overAt > RESTART_DELAY) {
    reset();
  }
}

canvas.addEventListener('pointerdown', flap);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    flap();
  }
});

// --- Update -----------------------------------------------------------------
function gameOver() {
  state = 'over';
  overAt = performance.now();
  if (score > best) {
    best = score;
    localStorage.setItem('flappy-best', String(best));
  }
}

function hitsPipe(pipe) {
  const withinX = BIRD_X + BIRD_R > pipe.x && BIRD_X - BIRD_R < pipe.x + PIPE_WIDTH;
  if (!withinX) return false;
  return bird.y - BIRD_R < pipe.gapY || bird.y + BIRD_R > pipe.gapY + PIPE_GAP;
}

function update(dt) {
  if (state === 'ready') {
    // Gentle bob so the bird isn't frozen on the start screen.
    bird.y = SKY_H / 2 + Math.sin(performance.now() / 250) * 6;
    return;
  }
  if (state === 'over') return;

  groundOffset = (groundOffset + PIPE_SPEED * dt) % 24;

  bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL);
  bird.y += bird.vy * dt;

  for (const pipe of pipes) {
    pipe.x -= PIPE_SPEED * dt;
    if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X - BIRD_R) {
      pipe.scored = true;
      score++;
    }
  }

  if (pipes[0].x + PIPE_WIDTH < 0) pipes.shift();
  const last = pipes[pipes.length - 1];
  if (last.x < W - PIPE_SPACING) addPipe(last.x + PIPE_SPACING + PIPE_WIDTH);

  if (bird.y + BIRD_R > SKY_H || bird.y - BIRD_R < 0 || pipes.some(hitsPipe)) {
    bird.y = Math.min(bird.y, SKY_H - BIRD_R);
    gameOver();
  }
}

// --- Draw -------------------------------------------------------------------
function drawCloud(x, y, s) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
  ctx.arc(x + 22 * s, y + 4 * s, 14 * s, 0, Math.PI * 2);
  ctx.arc(x - 20 * s, y + 5 * s, 12 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawPipe(pipe) {
  const lip = 8;
  ctx.fillStyle = '#4ec04e';
  ctx.strokeStyle = '#2f7d2f';
  ctx.lineWidth = 3;

  // Top pipe, then bottom pipe: body + a wider lip at the gap edge.
  const parts = [
    [pipe.x, 0, PIPE_WIDTH, pipe.gapY],
    [pipe.x - lip / 2, pipe.gapY - 24, PIPE_WIDTH + lip, 24],
    [pipe.x, pipe.gapY + PIPE_GAP, PIPE_WIDTH, SKY_H - pipe.gapY - PIPE_GAP],
    [pipe.x - lip / 2, pipe.gapY + PIPE_GAP, PIPE_WIDTH + lip, 24],
  ];
  for (const [x, y, w, h] of parts) {
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }
}

function drawBird() {
  const tilt = Math.max(-0.5, Math.min(1.2, bird.vy / 500));
  ctx.save();
  ctx.translate(BIRD_X, bird.y);
  ctx.rotate(state === 'ready' ? 0 : tilt);

  ctx.fillStyle = '#f5d442';
  ctx.strokeStyle = '#b89400';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Wing
  ctx.fillStyle = '#e0b92e';
  ctx.beginPath();
  ctx.ellipse(-3, 3, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(6, -5, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(7.5, -5, 2, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = '#ef8b2c';
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(21, 3);
  ctx.lineTo(11, 7);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
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
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, SKY_H);
  sky.addColorStop(0, '#5fc6f0');
  sky.addColorStop(1, '#b7e7f7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, SKY_H);

  drawCloud(80, 90, 1);
  drawCloud(300, 170, 0.8);
  drawCloud(200, 60, 0.6);

  pipes.forEach(drawPipe);
  drawBird();

  // Ground
  ctx.fillStyle = '#ded895';
  ctx.fillRect(0, SKY_H, W, GROUND_H);
  ctx.fillStyle = '#77c043';
  ctx.fillRect(0, SKY_H, W, 12);
  ctx.fillStyle = '#c9c079';
  for (let x = -groundOffset; x < W; x += 24) {
    ctx.fillRect(x, SKY_H + 16, 12, 6);
  }

  // HUD
  text(String(score), 70, 44, '#fff');

  if (state === 'ready') {
    text('Flappy Bird', 165, 32, '#fff');
    text('Tap or press Space to flap', 200, 18, '#fff');
  } else if (state === 'over') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, W, H);
    text('Game Over', 240, 40, '#fff');
    text(`Score ${score}   ·   Best ${best}`, 285, 20, '#fff');
    text('Tap or press Space to play again', 325, 16, '#fff');
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
