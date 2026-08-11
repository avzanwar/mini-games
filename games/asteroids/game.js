// Asteroids — plain canvas, no assets, no dependencies.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 360
const H = canvas.height;         // 560
const HUD_H = 40;
const FIELD_Y = HUD_H;
const FIELD_H = H - HUD_H;

const SHIP_R = 11;
const TURN_SPEED = 4.2;          // radians per second
const THRUST = 280;              // px per second squared
const DRAG = 0.55;               // velocity lost per second, proportionally
const MAX_SPEED = 340;

const BULLET_SPEED = 460;
const BULLET_LIFE = 1.1;         // seconds
const MAX_BULLETS = 5;
const FIRE_DELAY = 0.22;

const AST_RADIUS = { 3: 42, 2: 23, 1: 12 };
const AST_SPEED = { 3: 42, 2: 64, 1: 90 };
const AST_SCORE = { 3: 20, 2: 50, 1: 100 };
const START_ROCKS = 4;
const MAX_ROCKS = 8;
const SAFE_SPAWN = 130;          // keep new rocks this far from the ship

const START_LIVES = 3;
const RESPAWN_WAIT = 1.4;        // seconds dead before the ship comes back
const INVULN = 2.5;              // seconds of blinking immunity after respawn
const RESTART_DELAY = 0.5;

// Thumb controls, drawn into the canvas so touch play needs no extra DOM.
const BUTTONS = [
  { id: 'left', x: 46, y: H - 52, r: 30, glyph: '◀' },
  { id: 'right', x: 116, y: H - 52, r: 30, glyph: '▶' },
  { id: 'thrust', x: W - 116, y: H - 52, r: 30, glyph: '▲' },
  { id: 'fire', x: W - 46, y: H - 52, r: 30, glyph: '●' },
];

// --- State ------------------------------------------------------------------
let ship, rocks, bullets, particles;
let score, lives, wave, state, deadTimer, invulnTimer, fireTimer, overAt;
let best = Number(localStorage.getItem('asteroids-best')) || 0;

function reset() {
  score = 0;
  lives = START_LIVES;
  wave = 0;
  bullets = [];
  particles = [];
  deadTimer = 0;
  fireTimer = 0;
  overAt = 0;
  resetShip();
  invulnTimer = 0;
  nextWave();
  state = 'ready';
}

function resetShip() {
  ship = { x: W / 2, y: FIELD_Y + FIELD_H / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
  invulnTimer = INVULN;
}

function nextWave() {
  wave++;
  rocks = [];
  const n = Math.min(MAX_ROCKS, START_ROCKS + wave - 1);
  for (let i = 0; i < n; i++) rocks.push(makeRock(3));
}

function makeRock(size, x, y) {
  if (x === undefined) {
    // Keep new rocks clear of the ship so a wave never starts on top of you.
    let tries = 0;
    do {
      x = Math.random() * W;
      y = FIELD_Y + Math.random() * FIELD_H;
      tries++;
    } while (Math.hypot(x - ship.x, y - ship.y) < SAFE_SPAWN && tries < 60);
  }
  const dir = Math.random() * Math.PI * 2;
  const speed = AST_SPEED[size] * (0.6 + Math.random() * 0.7);
  return {
    x, y, size,
    vx: Math.cos(dir) * speed,
    vy: Math.sin(dir) * speed,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 1.6,
    // A jittered radius per vertex is what gives each rock its own outline.
    shape: Array.from({ length: 9 + Math.floor(Math.random() * 4) },
                      () => 0.72 + Math.random() * 0.5),
  };
}

function burst(x, y, n, tint) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 130;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                     life: 0.4 + Math.random() * 0.5, tint });
  }
}

// --- Input ------------------------------------------------------------------
const keys = new Set();
const pointers = new Map();

function held(action) {
  if (keys.has(action)) return true;
  for (const v of pointers.values()) if (v === action) return true;
  return false;
}

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'thrust', KeyW: 'thrust',
  Space: 'fire',
};

window.addEventListener('keydown', (e) => {
  const a = KEYS[e.code];
  if (a) { e.preventDefault(); keys.add(a); }
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); begin(); }
});
window.addEventListener('keyup', (e) => {
  const a = KEYS[e.code];
  if (a) keys.delete(a);
});

function begin() {
  if (state === 'ready') state = 'playing';
  else if (state === 'over' && overAt >= RESTART_DELAY) reset();
}

function buttonAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (W / rect.width);
  const y = (clientY - rect.top) * (H / rect.height);
  for (const b of BUTTONS) {
    if (Math.hypot(x - b.x, y - b.y) <= b.r + 6) return b.id;
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  const b = buttonAt(e.clientX, e.clientY);
  if (b && state === 'playing') { pointers.set(e.pointerId, b); return; }
  begin();
});
canvas.addEventListener('pointerup', (e) => pointers.delete(e.pointerId));
canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
canvas.addEventListener('pointerleave', (e) => pointers.delete(e.pointerId));

// --- Update -----------------------------------------------------------------
function wrap(o) {
  if (o.x < 0) o.x += W;
  else if (o.x > W) o.x -= W;
  if (o.y < FIELD_Y) o.y += FIELD_H;
  else if (o.y > FIELD_Y + FIELD_H) o.y -= FIELD_H;
}

function fire() {
  if (bullets.length >= MAX_BULLETS || fireTimer > 0) return;
  bullets.push({
    x: ship.x + Math.cos(ship.angle) * SHIP_R,
    y: ship.y + Math.sin(ship.angle) * SHIP_R,
    vx: ship.vx + Math.cos(ship.angle) * BULLET_SPEED,
    vy: ship.vy + Math.sin(ship.angle) * BULLET_SPEED,
    life: BULLET_LIFE,
  });
  fireTimer = FIRE_DELAY;
}

function hitRock(index) {
  const rock = rocks[index];
  score += AST_SCORE[rock.size];
  burst(rock.x, rock.y, rock.size * 5, '#cbd6e8');
  rocks.splice(index, 1);
  if (rock.size > 1) {
    for (let i = 0; i < 2; i++) rocks.push(makeRock(rock.size - 1, rock.x, rock.y));
  }
  if (score > best) {
    best = score;
    localStorage.setItem('asteroids-best', String(best));
  }
  if (!rocks.length) nextWave();
}

function killShip() {
  burst(ship.x, ship.y, 22, '#ff9f43');
  lives--;
  if (lives <= 0) {
    state = 'over';
    overAt = 0;
  } else {
    state = 'dead';
    deadTimer = RESPAWN_WAIT;
  }
}

function update(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  if (state === 'over') { overAt += dt; return; }
  if (state === 'dead') {
    deadTimer -= dt;
    if (deadTimer <= 0) { resetShip(); state = 'playing'; }
    // Rocks keep drifting while you wait to respawn.
  }
  if (state === 'ready') return;

  if (state === 'playing') {
    if (held('left')) ship.angle -= TURN_SPEED * dt;
    if (held('right')) ship.angle += TURN_SPEED * dt;
    if (held('thrust')) {
      ship.vx += Math.cos(ship.angle) * THRUST * dt;
      ship.vy += Math.sin(ship.angle) * THRUST * dt;
    }
    fireTimer -= dt;
    if (held('fire')) fire();

    ship.vx -= ship.vx * DRAG * dt;
    ship.vy -= ship.vy * DRAG * dt;
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > MAX_SPEED) {
      ship.vx = ship.vx / speed * MAX_SPEED;
      ship.vy = ship.vy / speed * MAX_SPEED;
    }
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    wrap(ship);
    if (invulnTimer > 0) invulnTimer -= dt;
  }

  for (const r of rocks) {
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.angle += r.spin * dt;
    wrap(r);
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    wrap(b);
    if (b.life <= 0) { bullets.splice(i, 1); continue; }
    for (let j = rocks.length - 1; j >= 0; j--) {
      if (Math.hypot(b.x - rocks[j].x, b.y - rocks[j].y) < AST_RADIUS[rocks[j].size]) {
        bullets.splice(i, 1);
        hitRock(j);
        break;
      }
    }
  }

  if (state === 'playing' && invulnTimer <= 0) {
    for (const r of rocks) {
      if (Math.hypot(ship.x - r.x, ship.y - r.y) < AST_RADIUS[r.size] + SHIP_R * 0.7) {
        killShip();
        break;
      }
    }
  }
}

// --- Draw -------------------------------------------------------------------
function text(str, y, size, color) {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(str, W / 2, y);
}

function drawShip() {
  // Blink through the invulnerable window so it reads as "not solid yet".
  if (invulnTimer > 0 && Math.floor(invulnTimer * 8) % 2) return;
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.strokeStyle = '#e8ecf3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(SHIP_R, 0);
  ctx.lineTo(-SHIP_R * 0.8, SHIP_R * 0.7);
  ctx.lineTo(-SHIP_R * 0.4, 0);
  ctx.lineTo(-SHIP_R * 0.8, -SHIP_R * 0.7);
  ctx.closePath();
  ctx.stroke();

  if (held('thrust') && state === 'playing' && Math.random() > 0.3) {
    ctx.strokeStyle = '#ff9f43';
    ctx.beginPath();
    ctx.moveTo(-SHIP_R * 0.5, SHIP_R * 0.34);
    ctx.lineTo(-SHIP_R * 1.5, 0);
    ctx.lineTo(-SHIP_R * 0.5, -SHIP_R * 0.34);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRock(r) {
  const radius = AST_RADIUS[r.size];
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.angle);
  ctx.strokeStyle = '#9aa5b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  r.shape.forEach((mult, i) => {
    const a = (i / r.shape.length) * Math.PI * 2;
    const px = Math.cos(a) * radius * mult;
    const py = Math.sin(a) * radius * mult;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawButtons() {
  for (const b of BUTTONS) {
    const on = held(b.id);
    ctx.fillStyle = on ? 'rgba(232, 236, 243, 0.18)' : 'rgba(232, 236, 243, 0.07)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = on ? '#e8ecf3' : 'rgba(232, 236, 243, 0.45)';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.glyph, b.x, b.y + 1);
    ctx.textBaseline = 'alphabetic';
  }
}

function draw() {
  ctx.fillStyle = '#0a0d14';
  ctx.fillRect(0, 0, W, H);

  // HUD — score centred, best right, top-left clear for the back link.
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8ecf3';
  ctx.fillText(String(score), W / 2, 26);
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7c8aa3';
  ctx.fillText(`Best ${best}`, W - 12, 26);

  // Lives, as little ships just under the score
  for (let i = 0; i < lives; i++) {
    ctx.save();
    ctx.translate(W / 2 - (lives - 1) * 7 + i * 14, 36);
    ctx.rotate(-Math.PI / 2);
    ctx.strokeStyle = '#7c8aa3';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-4, 3.5);
    ctx.lineTo(-4, -3.5);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  for (const p of particles) {
    ctx.fillStyle = p.tint;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.fillRect(p.x - 1, p.y - 1, 2.5, 2.5);
    ctx.globalAlpha = 1;
  }

  rocks.forEach(drawRock);

  ctx.fillStyle = '#e8ecf3';
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state === 'playing' || state === 'ready') drawShip();
  if (state === 'playing' || state === 'dead') drawButtons();

  if (state === 'ready') {
    ctx.fillStyle = 'rgba(10, 13, 20, 0.82)';
    ctx.fillRect(0, FIELD_Y, W, FIELD_H);
    text('Asteroids', 200, 34, '#fff');
    text('← → turn · ↑ thrust · space fire', 240, 13, '#cdd6e4');
    text('or use the buttons at the bottom', 262, 13, '#cdd6e4');
    text('Tap or press Space to start', 306, 15, '#fff');
  } else if (state === 'over') {
    ctx.fillStyle = 'rgba(10, 13, 20, 0.78)';
    ctx.fillRect(0, FIELD_Y, W, FIELD_H);
    text('Game Over', 230, 34, '#ff5f56');
    text(`Score ${score}   ·   Best ${best}`, 268, 16, '#cdd6e4');
    text(`Reached wave ${wave}`, 292, 14, '#7c8aa3');
    text('Tap or press Space to play again', 332, 14, '#cdd6e4');
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
