// Tower Defense — plain canvas, no assets, no dependencies.
// Enemies walk a fixed path; you buy towers on the ground either side of it.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 360
const H = canvas.height;         // 560
const HUD_H = 44;

const CELL = 36;
const COLS = 10;                 // 10 * 36 = 360, the full width
const ROWS = 12;
const GRID_Y = HUD_H;
const GRID_H = ROWS * CELL;      // 432
const BAR_Y = GRID_Y + GRID_H + 4;   // build bar starts here

const START_MONEY = 180;
const START_LIVES = 20;
const SPAWN_GAP = 0.55;          // seconds between enemies in a wave
const WAVE_BONUS = 20;           // plus 5 per wave cleared

const TOWERS = {
  gun:    { name: 'Gun',    cost: 50,  range: 82, damage: 7,  rate: 0.38, colour: '#5bc8f5' },
  cannon: { name: 'Cannon', cost: 110, range: 95, damage: 26, rate: 1.15, colour: '#ff9f43', splash: 34 },
  frost:  { name: 'Frost',  cost: 80,  range: 74, damage: 4,  rate: 0.65, colour: '#a8e6ff', slow: 0.5, slowFor: 1.4 },
};
const TOWER_ORDER = ['gun', 'cannon', 'frost'];

const ENEMIES = {
  basic: { speed: 44, hp: 1,    reward: 8,  r: 9,  colour: '#ff5f56' },
  fast:  { speed: 82, hp: 0.55, reward: 11, r: 7,  colour: '#ffd93d' },
  tank:  { speed: 26, hp: 3.2,  reward: 22, r: 12, colour: '#b06cf0' },
};

// The route, as tile coordinates. The ends sit outside the grid so enemies
// walk in from off-screen and leave the same way.
const WP_TILES = [[-1, 1], [7, 1], [7, 4], [2, 4], [2, 7], [8, 7], [8, 10], [-1, 10]];

const tileCentre = (c, r) => ({ x: c * CELL + CELL / 2, y: GRID_Y + r * CELL + CELL / 2 });
const WAYPOINTS = WP_TILES.map(([c, r]) => tileCentre(c, r));

// Every tile the route passes through, so towers cannot be built on the road.
const PATH = new Set();
for (let i = 0; i < WP_TILES.length - 1; i++) {
  const [c1, r1] = WP_TILES[i];
  const [c2, r2] = WP_TILES[i + 1];
  const steps = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1));
  for (let s = 0; s <= steps; s++) {
    const c = c1 + Math.sign(c2 - c1) * Math.min(s, Math.abs(c2 - c1));
    const r = r1 + Math.sign(r2 - r1) * Math.min(s, Math.abs(r2 - r1));
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) PATH.add(c + ',' + r);
  }
}

// --- State ------------------------------------------------------------------
let towers, enemies, shots, queue, money, lives, wave, state;
let spawnTimer, selected, hover, overAt;
let best = Number(localStorage.getItem('td-best')) || 0;

function reset() {
  towers = [];
  enemies = [];
  shots = [];
  queue = [];
  money = START_MONEY;
  lives = START_LIVES;
  wave = 0;
  spawnTimer = 0;
  selected = null;
  hover = null;
  overAt = 0;
  state = 'building';
}

function occupied(c, r) {
  return towers.some((t) => t.c === c && t.r === r);
}

function buildable(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
  return !PATH.has(c + ',' + r) && !occupied(c, r);
}

// --- Waves ------------------------------------------------------------------
function waveHp(n) {
  return 20 * Math.pow(1.2, n - 1);
}

function composition(n) {
  const list = [];
  const count = 6 + Math.floor(n * 1.6);
  for (let i = 0; i < count; i++) {
    if (n >= 5 && i % 7 === 6) list.push('tank');
    else if (n >= 3 && i % 5 === 4) list.push('fast');
    else list.push('basic');
  }
  return list;
}

function startWave() {
  if (state !== 'building') return;
  wave++;
  queue = composition(wave);
  spawnTimer = 0;
  state = 'wave';
}

function spawn(type) {
  const spec = ENEMIES[type];
  const hp = waveHp(wave) * spec.hp;
  enemies.push({
    type, x: WAYPOINTS[0].x, y: WAYPOINTS[0].y,
    hp, maxHp: hp, speed: spec.speed, reward: spec.reward, r: spec.r,
    wp: 0, dist: 0, slowFor: 0,
  });
}

// --- Update -----------------------------------------------------------------
function moveEnemy(e, dt) {
  let budget = e.speed * dt * (e.slowFor > 0 ? TOWERS.frost.slow : 1);
  if (e.slowFor > 0) e.slowFor -= dt;

  while (budget > 0 && e.wp < WAYPOINTS.length - 1) {
    const t = WAYPOINTS[e.wp + 1];
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget) {
      e.x = t.x; e.y = t.y; e.wp++; budget -= d; e.dist += d;
    } else {
      e.x += (dx / d) * budget; e.y += (dy / d) * budget; e.dist += budget; budget = 0;
    }
  }
  return e.wp >= WAYPOINTS.length - 1;
}

function damage(e, amount) {
  e.hp -= amount;
  if (e.hp <= 0) {
    money += e.reward;
    return true;
  }
  return false;
}

function fire(tower, spec, target) {
  shots.push({ x1: tower.px, y1: tower.py, x2: target.x, y2: target.y,
               life: 0.09, colour: spec.colour, splash: spec.splash });
  const killed = [];

  if (spec.splash) {
    for (const e of enemies) {
      if (Math.hypot(e.x - target.x, e.y - target.y) <= spec.splash) {
        if (damage(e, spec.damage)) killed.push(e);
      }
    }
  } else {
    if (damage(target, spec.damage)) killed.push(target);
    if (spec.slow) target.slowFor = spec.slowFor;
  }
  if (killed.length) enemies = enemies.filter((e) => !killed.includes(e));
}

function update(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    shots[i].life -= dt;
    if (shots[i].life <= 0) shots.splice(i, 1);
  }

  if (state === 'over') { overAt += dt; return; }

  if (state === 'wave') {
    spawnTimer -= dt;
    if (queue.length && spawnTimer <= 0) {
      spawn(queue.shift());
      spawnTimer = SPAWN_GAP;
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (moveEnemy(e, dt)) {
      enemies.splice(i, 1);
      lives--;
      if (lives <= 0) {
        lives = 0;
        state = 'over';
        overAt = 0;
        if (wave > best) {
          best = wave;
          localStorage.setItem('td-best', String(best));
        }
        return;
      }
    }
  }

  for (const t of towers) {
    const spec = TOWERS[t.type];
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    // Shoot whichever enemy in range has got furthest along the road.
    let target = null;
    for (const e of enemies) {
      if (Math.hypot(e.x - t.px, e.y - t.py) > spec.range) continue;
      if (!target || e.dist > target.dist) target = e;
    }
    if (!target) continue;
    t.angle = Math.atan2(target.y - t.py, target.x - t.px);
    fire(t, spec, target);
    t.cooldown = spec.rate;
  }

  if (state === 'wave' && !queue.length && !enemies.length) {
    money += WAVE_BONUS + wave * 5;
    state = 'building';
  }
}

// --- Input ------------------------------------------------------------------
function barButtons() {
  const out = [];
  TOWER_ORDER.forEach((key, i) => {
    out.push({ kind: 'tower', key, x: 9 + i * 117, y: BAR_Y, w: 108, h: 38 });
  });
  out.push({ kind: 'start', x: 9, y: BAR_Y + 44, w: W - 18, h: 28 });
  return out;
}

function at(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (W / rect.width),
    y: (clientY - rect.top) * (H / rect.height),
  };
}

function handleTap(x, y) {
  if (state === 'over') {
    if (overAt > 0.5) reset();
    return;
  }
  for (const b of barButtons()) {
    if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue;
    if (b.kind === 'start') startWave();
    else selected = selected === b.key ? null : b.key;
    return;
  }
  if (y < GRID_Y || y > GRID_Y + GRID_H || !selected) return;

  const c = Math.floor(x / CELL);
  const r = Math.floor((y - GRID_Y) / CELL);
  const spec = TOWERS[selected];
  if (!buildable(c, r) || money < spec.cost) return;
  const p = tileCentre(c, r);
  towers.push({ c, r, type: selected, px: p.x, py: p.y, cooldown: 0, angle: -Math.PI / 2 });
  money -= spec.cost;
}

canvas.addEventListener('pointerdown', (e) => {
  const p = at(e.clientX, e.clientY);
  handleTap(p.x, p.y);
});
canvas.addEventListener('pointermove', (e) => {
  const p = at(e.clientX, e.clientY);
  hover = (p.y >= GRID_Y && p.y <= GRID_Y + GRID_H)
    ? { c: Math.floor(p.x / CELL), r: Math.floor((p.y - GRID_Y) / CELL) } : null;
});
canvas.addEventListener('pointerleave', () => { hover = null; });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (state === 'over' && overAt > 0.5) reset();
    else startWave();
  } else if (e.key >= '1' && e.key <= '3') {
    const key = TOWER_ORDER[Number(e.key) - 1];
    selected = selected === key ? null : key;
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

function drawTower(t) {
  const spec = TOWERS[t.type];
  ctx.fillStyle = '#2a3547';
  ctx.beginPath();
  ctx.roundRect(t.px - 15, t.py - 15, 30, 30, 6);
  ctx.fill();
  ctx.fillStyle = spec.colour;
  ctx.beginPath();
  ctx.arc(t.px, t.py, 9, 0, Math.PI * 2);
  ctx.fill();
  // barrel pointing at whatever it last shot
  ctx.strokeStyle = spec.colour;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(t.px, t.py);
  ctx.lineTo(t.px + Math.cos(t.angle) * 16, t.py + Math.sin(t.angle) * 16);
  ctx.stroke();
}

function drawEnemy(e) {
  const spec = ENEMIES[e.type];
  ctx.fillStyle = spec.colour;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
  ctx.fill();
  if (e.slowFor > 0) {
    ctx.strokeStyle = TOWERS.frost.colour;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const w = e.r * 2.2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(e.x - w / 2, e.y - e.r - 7, w, 4);
  ctx.fillStyle = '#6ee7a8';
  ctx.fillRect(e.x - w / 2, e.y - e.r - 7, w * Math.max(0, e.hp / e.maxHp), 4);
}

function draw() {
  ctx.fillStyle = '#0f1520';
  ctx.fillRect(0, 0, W, H);

  // Ground and road
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const onPath = PATH.has(c + ',' + r);
      ctx.fillStyle = onPath ? '#3a3327' : ((c + r) % 2 ? '#182130' : '#1b2436');
      ctx.fillRect(c * CELL, GRID_Y + r * CELL, CELL, CELL);
    }
  }

  // Where a new tower would go
  if (selected && hover) {
    const spec = TOWERS[selected];
    const ok = buildable(hover.c, hover.r) && money >= spec.cost;
    const p = tileCentre(hover.c, hover.r);
    ctx.fillStyle = ok ? 'rgba(110, 231, 168, 0.22)' : 'rgba(255, 95, 86, 0.22)';
    ctx.fillRect(hover.c * CELL, GRID_Y + hover.r * CELL, CELL, CELL);
    if (ok) {
      ctx.strokeStyle = 'rgba(232, 236, 243, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, spec.range, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Ranges of what is already built, while shopping
  if (selected) {
    ctx.strokeStyle = 'rgba(232, 236, 243, 0.10)';
    ctx.lineWidth = 1;
    for (const t of towers) {
      ctx.beginPath();
      ctx.arc(t.px, t.py, TOWERS[t.type].range, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  towers.forEach(drawTower);
  enemies.forEach(drawEnemy);

  for (const s of shots) {
    ctx.globalAlpha = Math.max(0, s.life / 0.09);
    ctx.strokeStyle = s.colour;
    ctx.lineWidth = s.splash ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    if (s.splash) {
      ctx.beginPath();
      ctx.arc(s.x2, s.y2, s.splash, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // HUD — money centred, wave and lives right, top-left clear for the link.
  ctx.fillStyle = '#0b111b';
  ctx.fillRect(0, 0, W, HUD_H);
  text(`$${money}`, W / 2, 22, 17, '#ffd93d');
  text(`Wave ${wave}`, W - 12, 15, 12, '#7c8aa3', 'right');
  text(`${lives} lives`, W - 12, 31, 12, lives <= 5 ? '#ff5f56' : '#7c8aa3', 'right');

  // Build bar
  ctx.fillStyle = '#0b111b';
  ctx.fillRect(0, GRID_Y + GRID_H, W, H - GRID_Y - GRID_H);
  for (const b of barButtons()) {
    if (b.kind === 'tower') {
      const spec = TOWERS[b.key];
      const affordable = money >= spec.cost;
      ctx.fillStyle = selected === b.key ? '#2c4a7a' : '#1b2436';
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 7);
      ctx.fill();
      ctx.fillStyle = affordable ? spec.colour : '#3d4a61';
      ctx.beginPath();
      ctx.arc(b.x + 19, b.y + b.h / 2, 8, 0, Math.PI * 2);
      ctx.fill();
      text(spec.name, b.x + 36, b.y + 13, 12, affordable ? '#e8ecf3' : '#5b6880', 'left');
      text(`$${spec.cost}`, b.x + 36, b.y + 27, 12, affordable ? '#ffd93d' : '#5b6880', 'left');
    } else {
      const ready = state === 'building';
      ctx.fillStyle = ready ? '#2f7d4f' : '#1b2436';
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 7);
      ctx.fill();
      text(ready ? `Start wave ${wave + 1}` : `Wave ${wave} — ${enemies.length + queue.length} left`,
           W / 2, b.y + b.h / 2, 13, ready ? '#fff' : '#7c8aa3');
    }
  }

  if (state === 'over') {
    ctx.fillStyle = 'rgba(10, 14, 24, 0.86)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    text('Overrun', W / 2, 220, 32, '#ff5f56');
    text(`You held ${wave} waves   ·   best ${best}`, W / 2, 258, 15, '#cdd6e4');
    text('Tap or press Space to try again', W / 2, 296, 13, '#cdd6e4');
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
