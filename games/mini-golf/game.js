// Mini Golf — plain canvas, no assets, no dependencies.
// Drag back from the ball to aim and set power, let go to putt.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 360
const H = canvas.height;         // 560
const HUD_H = 44;
const PLAY_Y = HUD_H;

const BALL_R = 6;
const HOLE_R = 10;
const MAX_PULL = 110;            // drag length at full power
const MAX_SPEED = 660;           // px per second at full power
const DRAG_GREEN = 1.3;          // velocity decay per second
const DRAG_SAND = 5.2;
const STOP_SPEED = 12;
const RESTITUTION = 0.7;         // bounce off walls
const SINK_SPEED = 280;          // any faster and it rolls straight over
const STEP = 1 / 240;            // physics substep, so nothing tunnels a wall

// Courses. Rectangles are [x, y, width, height]; y is absolute on the canvas.
const HOLES = [
  { par: 2, tee: [180, 500], cup: [180, 130], walls: [], sand: [], water: [] },
  { par: 3, tee: [100, 500], cup: [100, 130],
    walls: [[0, 300, 250, 18]], sand: [], water: [] },
  // The barrier sits across the direct line, so the only way through is the
  // gap on the left and back again — otherwise the obstacle is decoration.
  { par: 3, tee: [300, 500], cup: [300, 130],
    walls: [[140, 290, 220, 18]], sand: [], water: [] },
  { par: 3, tee: [180, 500], cup: [180, 130],
    walls: [], sand: [[110, 250, 140, 100]], water: [] },
  // Same idea with water: the channel is nowhere near the tee-to-cup line.
  { par: 3, tee: [60, 505], cup: [90, 130],
    walls: [], sand: [], water: [[0, 280, 215, 70], [300, 280, 60, 70]] },
  { par: 4, tee: [60, 510], cup: [300, 110],
    walls: [[0, 410, 260, 16], [100, 300, 260, 16], [0, 190, 260, 16]], sand: [], water: [] },
  { par: 3, tee: [80, 505], cup: [280, 130],
    walls: [], sand: [], water: [[0, 240, 210, 90]] },
  { par: 3, tee: [180, 510], cup: [180, 100],
    walls: [[70, 170, 28, 130], [166, 300, 28, 130], [262, 170, 28, 130]], sand: [], water: [] },
  { par: 3, tee: [180, 515], cup: [180, 100],
    walls: [[0, 340, 150, 16], [210, 340, 150, 16]], sand: [[130, 170, 100, 90]], water: [] },
];
const TOTAL_PAR = HOLES.reduce((n, h) => n + h.par, 0);

// --- State ------------------------------------------------------------------
let hole, ball, lastRest, strokes, scores, state, aim, sunkAt;
let best = Number(localStorage.getItem('golf-best')) || 0;

function course() {
  return HOLES[hole];
}

function reset() {
  hole = 0;
  scores = [];
  startHole();
}

function startHole() {
  const c = course();
  ball = { x: c.tee[0], y: c.tee[1], vx: 0, vy: 0 };
  lastRest = { x: ball.x, y: ball.y };
  strokes = 0;
  aim = null;
  sunkAt = 0;
  state = 'aim';
}

const speed = () => Math.hypot(ball.vx, ball.vy);
const inRect = (x, y, r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

// --- Physics ----------------------------------------------------------------
// Push the ball out of a rectangle and bounce it off the face it touched.
function collide(r) {
  const nx = Math.max(r[0], Math.min(ball.x, r[0] + r[2]));
  const ny = Math.max(r[1], Math.min(ball.y, r[1] + r[3]));
  let dx = ball.x - nx;
  let dy = ball.y - ny;
  let d2 = dx * dx + dy * dy;

  if (d2 > BALL_R * BALL_R) return;

  if (d2 < 1e-6) {
    // Centre is inside the rectangle: leave by the nearest face.
    const left = ball.x - r[0];
    const right = r[0] + r[2] - ball.x;
    const top = ball.y - r[1];
    const bottom = r[1] + r[3] - ball.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) { dx = -1; dy = 0; } else if (m === right) { dx = 1; dy = 0; }
    else if (m === top) { dx = 0; dy = -1; } else { dx = 0; dy = 1; }
    d2 = 1;
  }

  const d = Math.sqrt(d2);
  const ux = dx / d;
  const uy = dy / d;
  ball.x += ux * (BALL_R - d);
  ball.y += uy * (BALL_R - d);

  const dot = ball.vx * ux + ball.vy * uy;
  if (dot < 0) {
    ball.vx -= (1 + RESTITUTION) * dot * ux;
    ball.vy -= (1 + RESTITUTION) * dot * uy;
  }
}

function stepPhysics(dt) {
  const c = course();
  const onSand = c.sand.some((r) => inRect(ball.x, ball.y, r));
  const decay = Math.exp(-(onSand ? DRAG_SAND : DRAG_GREEN) * dt);
  ball.vx *= decay;
  ball.vy *= decay;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * RESTITUTION; }
  if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx) * RESTITUTION; }
  if (ball.y < PLAY_Y + BALL_R) { ball.y = PLAY_Y + BALL_R; ball.vy = Math.abs(ball.vy) * RESTITUTION; }
  if (ball.y > H - BALL_R) { ball.y = H - BALL_R; ball.vy = -Math.abs(ball.vy) * RESTITUTION; }

  for (const r of c.walls) collide(r);

  // Into the water: back to where the shot was played, plus a penalty stroke.
  if (c.water.some((r) => inRect(ball.x, ball.y, r))) {
    ball.x = lastRest.x;
    ball.y = lastRest.y;
    ball.vx = 0;
    ball.vy = 0;
    strokes++;
    state = 'aim';
    return;
  }

  // Drop in only if it is not screaming past.
  const dh = Math.hypot(ball.x - c.cup[0], ball.y - c.cup[1]);
  if (dh < HOLE_R && speed() < SINK_SPEED) {
    scores[hole] = strokes;
    state = 'sunk';
    sunkAt = 0;
    if (hole === HOLES.length - 1) {
      const total = scores.reduce((a, b) => a + b, 0);
      if (!best || total < best) {
        best = total;
        localStorage.setItem('golf-best', String(best));
      }
    }
  }
}

function update(dt) {
  if (state === 'sunk' || state === 'done') { sunkAt += dt; return; }
  if (state !== 'rolling') return;

  let left = dt;
  while (left > 0 && state === 'rolling') {
    const step = Math.min(STEP, left);
    stepPhysics(step);
    left -= step;
  }

  if (state === 'rolling' && speed() < STOP_SPEED) {
    ball.vx = 0;
    ball.vy = 0;
    lastRest = { x: ball.x, y: ball.y };
    state = 'aim';
  }
}

// --- Input ------------------------------------------------------------------
function at(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (W / r.width),
    y: (e.clientY - r.top) * (H / r.height),
  };
}

function nextHole() {
  if (hole === HOLES.length - 1) { state = 'done'; return; }
  hole++;
  startHole();
}

canvas.addEventListener('pointerdown', (e) => {
  if (state === 'sunk') { if (sunkAt > 0.35) nextHole(); return; }
  if (state === 'done') { if (sunkAt > 0.35) reset(); return; }
  if (state !== 'aim') return;
  const p = at(e);
  aim = { x: p.x, y: p.y };
});

canvas.addEventListener('pointermove', (e) => {
  if (!aim) return;
  const p = at(e);
  aim.x = p.x;
  aim.y = p.y;
});

function release() {
  if (!aim || state !== 'aim') { aim = null; return; }
  // Pull back from the ball: the shot goes the opposite way to the drag.
  const dx = ball.x - aim.x;
  const dy = ball.y - aim.y;
  const pull = Math.min(Math.hypot(dx, dy), MAX_PULL);
  aim = null;
  if (pull < 6) return;                      // a tap is not a shot
  const power = (pull / MAX_PULL) * MAX_SPEED;
  const d = Math.hypot(dx, dy) || 1;
  ball.vx = (dx / d) * power;
  ball.vy = (dy / d) * power;
  lastRest = { x: ball.x, y: ball.y };
  strokes++;
  state = 'rolling';
}

canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', () => { aim = null; });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (state === 'sunk' && sunkAt > 0.35) nextHole();
    else if (state === 'done' && sunkAt > 0.35) reset();
  }
});

// --- Draw -------------------------------------------------------------------
function text(str, x, y, size, colour, align) {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colour;
  ctx.fillText(str, x, y);
}

function relative(n) {
  if (n === 0) return 'level par';
  return n > 0 ? `+${n}` : String(n);
}

function draw() {
  const c = course();

  ctx.fillStyle = '#1f6b3a';
  ctx.fillRect(0, PLAY_Y, W, H - PLAY_Y);
  // faint mowing stripes
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = PLAY_Y; y < H; y += 44) ctx.fillRect(0, y, W, 22);

  for (const r of c.water) {
    ctx.fillStyle = '#2f6f9e';
    ctx.fillRect(r[0], r[1], r[2], r[3]);
  }
  for (const r of c.sand) {
    ctx.fillStyle = '#d8c78c';
    ctx.fillRect(r[0], r[1], r[2], r[3]);
  }
  for (const r of c.walls) {
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(r[0], r[1], r[2], r[3]);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(r[0], r[1], r[2], 3);
  }

  // cup
  ctx.fillStyle = '#0a1a10';
  ctx.beginPath();
  ctx.arc(c.cup[0], c.cup[1], HOLE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // flag
  ctx.strokeStyle = '#e8ecf3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c.cup[0], c.cup[1]);
  ctx.lineTo(c.cup[0], c.cup[1] - 30);
  ctx.stroke();
  ctx.fillStyle = '#ff5f56';
  ctx.beginPath();
  ctx.moveTo(c.cup[0], c.cup[1] - 30);
  ctx.lineTo(c.cup[0] + 18, c.cup[1] - 24);
  ctx.lineTo(c.cup[0], c.cup[1] - 18);
  ctx.closePath();
  ctx.fill();

  // aim guide
  if (aim && state === 'aim') {
    const dx = ball.x - aim.x;
    const dy = ball.y - aim.y;
    const pull = Math.min(Math.hypot(dx, dy), MAX_PULL);
    const d = Math.hypot(dx, dy) || 1;
    const frac = pull / MAX_PULL;
    ctx.strokeStyle = `rgba(255, ${Math.round(217 - frac * 150)}, 61, 0.9)`;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(ball.x + (dx / d) * pull * 1.5, ball.y + (dy / d) * pull * 1.5);
    ctx.stroke();
    ctx.setLineDash([]);
    // power bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(12, H - 26, 120, 10);
    ctx.fillStyle = frac > 0.8 ? '#ff5f56' : '#ffd93d';
    ctx.fillRect(12, H - 26, 120 * frac, 10);
  }

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  // HUD — hole and par centred, shots right, top-left clear for the link.
  ctx.fillStyle = '#0d1a12';
  ctx.fillRect(0, 0, W, HUD_H);
  const played = scores.reduce((a, b) => a + b, 0);
  const parSoFar = HOLES.slice(0, scores.length).reduce((a, h) => a + h.par, 0);
  text(`Hole ${hole + 1}/9  ·  Par ${c.par}`, W / 2, 17, 14, '#cfe3d6');
  text(scores.length ? `${played} shots  ·  ${relative(played - parSoFar)}` : 'first hole',
       W / 2, 33, 12, '#7c9a86');
  text(`Shots ${strokes}`, W - 12, 22, 14, '#e8ecf3', 'right');

  if (state === 'sunk') {
    ctx.fillStyle = 'rgba(8, 20, 13, 0.86)';
    ctx.fillRect(0, PLAY_Y, W, H - PLAY_Y);
    const diff = strokes - c.par;
    const name = strokes === 1 ? 'Hole in one!' : diff <= -2 ? 'Eagle' : diff === -1 ? 'Birdie'
      : diff === 0 ? 'Par' : diff === 1 ? 'Bogey' : `+${diff}`;
    text(name, W / 2, 240, 30, diff <= 0 ? '#6ee7a8' : '#ffd93d');
    text(`${strokes} shot${strokes === 1 ? '' : 's'} on hole ${hole + 1}`, W / 2, 278, 15, '#cfe3d6');
    text(hole === HOLES.length - 1 ? 'Tap for your card' : 'Tap for the next hole',
         W / 2, 316, 13, '#9fbfae');
  } else if (state === 'done') {
    const total = scores.reduce((a, b) => a + b, 0);
    ctx.fillStyle = 'rgba(8, 20, 13, 0.92)';
    ctx.fillRect(0, PLAY_Y, W, H - PLAY_Y);
    text('Round complete', W / 2, 190, 26, '#fff');
    text(`${total} shots  ·  ${relative(total - TOTAL_PAR)}`, W / 2, 230, 20, '#6ee7a8');
    text(`Par for the course is ${TOTAL_PAR}`, W / 2, 258, 13, '#9fbfae');
    if (best) text(`Best round ${best}`, W / 2, 282, 13, '#9fbfae');
    scores.forEach((s, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      text(`${i + 1}: ${s}`, 80 + col * 100, 330 + row * 26, 13,
           s <= HOLES[i].par ? '#6ee7a8' : '#cfe3d6');
    });
    text('Tap or press Space to play again', W / 2, 440, 13, '#cfe3d6');
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
