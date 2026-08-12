// Doodle Jump — plain canvas, no assets, no dependencies.
// The player never really rises: once they pass the scroll line, the world
// slides down around them instead, which keeps everything in screen space.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 340
const H = canvas.height;         // 560
const HUD_H = 40;
const SCROLL_LINE = 240;         // push the world down once the player is here

const GRAVITY = 1400;            // px per second squared
const JUMP_V = -640;             // a normal bounce
const SPRING_V = -1060;          // a spring
// After a bounce there is only ~0.6s before the feet fall back past the next
// platform. This has to be quick enough to cover MAX_SIDE_STEP in that window,
// or platforms end up out of reach no matter how well you aim.
const MOVE_SPEED = 300;          // sideways, px per second
const MAX_SIDE_STEP = 150;       // how far sideways consecutive platforms drift

const PW = 26;                   // player size
const PH = 26;
const PLAT_W = 68;
const PLAT_H = 12;

const GAP_MIN = 70;              // vertical spacing between platforms
const GAP_EXTRA = 25;            // plus up to this much at random
const GAP_GROWTH = 33;           // and up to this much more as you climb
// A normal bounce clears JUMP_V^2 / (2 * GRAVITY) = 146px, so the widest gap
// (70 + 33 + 25 = 128) leaves a margin rather than needing a pixel-perfect
// landing to clear the next one.
const MAX_SAFE_GAP = 130;
const MIN_STEP = 40;             // smallest rise between one platform and the next
// Breaking platforms drop out from under you, so they cannot be counted on as
// a step. Everything else can, and consecutive dependable platforms are kept
// within MAX_SAFE_GAP — otherwise a breaker sitting between two normals opens
// a hole taller than a jump and strands the player through no fault of theirs.
const isSolid = (p) => p.type !== 'breaking';

const RESTART_DELAY = 0.5;

// --- State ------------------------------------------------------------------
let player, platforms, stars, height, state, overAt, facing, lastSolidY;
let best = Number(localStorage.getItem('doodle-best')) || 0;

function reset() {
  // Resting on the first platform and already launching. Starting mid-air
  // above it meant a player holding left or right could drift off the only
  // platform under them and die before the run began.
  player = { x: W / 2, y: (H - 80) - PH / 2, vx: 0, vy: JUMP_V };
  platforms = [];
  height = 0;
  overAt = 0;
  facing = 1;

  // A guaranteed platform underfoot, then a starter ladder of plain ones.
  const first = makePlatform(H - 80, 'normal');
  first.x = W / 2 - PLAT_W / 2;
  first.spring = false;
  platforms.push(first);
  lastSolidY = H - 80;
  while (topPlatformY() > -40) addPlatformAbove('normal');

  stars = [];
  for (let i = 0; i < 34; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.4 });
  }
  state = 'ready';
}

function makePlatform(y, type, x) {
  if (x === undefined) x = Math.random() * (W - PLAT_W);
  return {
    x, y, type,
    spring: type === 'normal' && Math.random() < 0.08,
    vx: type === 'moving' ? (Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 50) : 0,
    broken: false,
  };
}

function topPlatformY() {
  return platforms.reduce((m, p) => Math.min(m, p.y), H);
}

// Add one platform above the current highest, keeping every dependable step
// within a single jump of the previous one.
function addPlatformAbove(force) {
  const from = topPlatformY();
  let y = from - gap();
  let type = force || rollType();

  // A breaker has to leave room for the next dependable platform to sit at
  // least MIN_STEP above it while still being within MAX_SAFE_GAP of the last
  // one — otherwise the "always progress upward" clamp below is forced to
  // overshoot and opens a hole no jump can clear.
  if (type === 'breaking' && lastSolidY - y > MAX_SAFE_GAP - MIN_STEP) type = 'normal';
  if (type !== 'breaking') y = Math.max(y, lastSolidY - MAX_SAFE_GAP);
  y = Math.min(y, from - MIN_STEP);        // always make upward progress

  // Keep it within sideways reach of the one below. After a bounce there is
  // only about 0.6s before the feet come back down past the next platform,
  // which at MOVE_SPEED buys ~180px — so placing the next platform anywhere
  // at random would regularly put it somewhere no player could reach in time.
  const prev = platforms.length ? platforms[platforms.length - 1].x : (W - PLAT_W) / 2;
  const shift = (Math.random() * 2 - 1) * MAX_SIDE_STEP;
  const x = Math.max(0, Math.min(W - PLAT_W, prev + shift));

  const p = makePlatform(y, type, x);
  if (isSolid(p)) lastSolidY = y;
  platforms.push(p);
}

function rollType() {
  const movingChance = Math.min(0.28, height / 6000);
  const breakChance = Math.min(0.22, height / 8000);
  const roll = Math.random();
  if (roll < movingChance) return 'moving';
  if (roll < movingChance + breakChance) return 'breaking';
  return 'normal';
}

function gap() {
  return GAP_MIN + Math.min(GAP_GROWTH, height / 1200) + Math.random() * GAP_EXTRA;
}

// --- Input ------------------------------------------------------------------
const keys = new Set();
let pointerX = null;

const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };

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

function canvasX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) * (W / rect.width);
}

canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'playing') { begin(); return; }
  pointerX = canvasX(e.clientX);
});
canvas.addEventListener('pointermove', (e) => {
  if (pointerX !== null) pointerX = canvasX(e.clientX);
});
canvas.addEventListener('pointerup', () => { pointerX = null; });
canvas.addEventListener('pointercancel', () => { pointerX = null; });

// Which way the player is being steered: keys first, then a held finger.
function steer() {
  if (keys.has('left')) return -1;
  if (keys.has('right')) return 1;
  if (pointerX !== null) {
    if (pointerX < player.x - 8) return -1;
    if (pointerX > player.x + 8) return 1;
  }
  return 0;
}

// --- Update -----------------------------------------------------------------
function bounce(velocity) {
  player.vy = velocity;
}

// Straddling an edge counts as overlapping platforms on the far side too,
// so landing works the same whether or not you are mid-wrap.
function overlapsX(p) {
  const left = player.x - PW / 2;
  const right = player.x + PW / 2;
  for (const shift of [0, W, -W]) {
    if (right + shift > p.x && left + shift < p.x + PLAT_W) return true;
  }
  return false;
}

function update(dt) {
  if (state === 'over') { overAt += dt; return; }
  if (state !== 'playing') return;

  const dir = steer();
  if (dir) facing = dir;
  player.vx = dir * MOVE_SPEED;
  player.x += player.vx * dt;
  // Wrap on the centre and draw the overlap on both sides, so crossing an
  // edge is seamless rather than the sprite half-vanishing.
  if (player.x < 0) player.x += W;
  else if (player.x >= W) player.x -= W;

  const prevBottom = player.y + PH / 2;
  player.vy += GRAVITY * dt;
  player.y += player.vy * dt;
  const bottom = player.y + PH / 2;

  for (const p of platforms) {
    if (p.type === 'moving' && !p.broken) {
      p.x += p.vx * dt;
      if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
      if (p.x + PLAT_W > W) { p.x = W - PLAT_W; p.vx = -Math.abs(p.vx); }
    }
    if (p.broken) { p.y += 320 * dt; continue; }

    // Only landing counts, and only if the feet crossed the top this frame.
    if (player.vy <= 0) continue;
    if (prevBottom > p.y || bottom < p.y) continue;
    if (!overlapsX(p)) continue;

    if (p.type === 'breaking') { p.broken = true; continue; }   // fall right through
    // Snap the feet to the surface first. A fast descent can carry them well
    // past the platform in one frame, and bouncing from there loses that much
    // height off the top of the jump — enough to put the next platform out of
    // reach on a wide gap.
    player.y = p.y - PH / 2;
    bounce(p.spring ? SPRING_V : JUMP_V);
  }

  // Slide the world down instead of moving the player up.
  if (player.y < SCROLL_LINE) {
    const dy = SCROLL_LINE - player.y;
    player.y = SCROLL_LINE;
    height += dy;
    lastSolidY += dy;
    for (const p of platforms) p.y += dy;
    for (const s of stars) {
      s.y += dy * 0.35;
      if (s.y > H) { s.y -= H; s.x = Math.random() * W; }
    }
  }

  // Cull and top up every frame, not just while scrolling: broken platforms
  // keep falling whether or not the world is moving, and if they are only
  // swept up during a scroll they pile up below the screen forever.
  platforms = platforms.filter((p) => p.y < H + 40);
  while (topPlatformY() > -40) addPlatformAbove();

  if (player.y - PH / 2 > H) {
    state = 'over';
    overAt = 0;
    const m = Math.floor(height / 10);
    if (m > best) {
      best = m;
      localStorage.setItem('doodle-best', String(best));
    }
  }
}

// --- Draw -------------------------------------------------------------------
function centred(str, y, size, color) {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(str, W / 2, y);
}

function drawPlayer() {
  drawPlayerAt(player.x);
  if (player.x < PW / 2) drawPlayerAt(player.x + W);
  else if (player.x > W - PW / 2) drawPlayerAt(player.x - W);
}

function drawPlayerAt(x) {
  const y = player.y;
  ctx.fillStyle = '#6ee7a8';
  ctx.beginPath();
  ctx.roundRect(x - PW / 2, y - PH / 2, PW, PH, 9);
  ctx.fill();

  // little legs
  ctx.fillStyle = '#3fa876';
  ctx.fillRect(x - 8, y + PH / 2 - 2, 5, 6);
  ctx.fillRect(x + 3, y + PH / 2 - 2, 5, 6);

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - 4 + facing * 2, y - 4, 4, 0, Math.PI * 2);
  ctx.arc(x + 5 + facing * 2, y - 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d2433';
  ctx.beginPath();
  ctx.arc(x - 3 + facing * 3, y - 4, 1.8, 0, Math.PI * 2);
  ctx.arc(x + 6 + facing * 3, y - 4, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlatform(p) {
  const colors = { normal: '#4fa84f', moving: '#5bc8f5', breaking: '#b07a4a' };
  ctx.globalAlpha = p.broken ? 0.45 : 1;
  ctx.fillStyle = colors[p.type];
  ctx.beginPath();
  ctx.roundRect(p.x, p.y, PLAT_W, PLAT_H, 5);
  ctx.fill();
  if (p.type === 'breaking') {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x + PLAT_W / 2, p.y);
    ctx.lineTo(p.x + PLAT_W / 2 - 4, p.y + PLAT_H);
    ctx.stroke();
  }
  if (p.spring) {
    ctx.fillStyle = '#ffd93d';
    ctx.fillRect(p.x + PLAT_W / 2 - 5, p.y - 7, 10, 7);
    ctx.fillStyle = '#b89400';
    ctx.fillRect(p.x + PLAT_W / 2 - 5, p.y - 4, 10, 2);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#161d33');
  sky.addColorStop(1, '#0d1220');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(232, 236, 243, 0.35)';
  for (const s of stars) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  platforms.forEach(drawPlatform);
  if (state !== 'over') drawPlayer();

  // HUD — height centred, best right, top-left clear for the back link.
  ctx.fillStyle = 'rgba(13, 18, 32, 0.75)';
  ctx.fillRect(0, 0, W, HUD_H);
  centred(`${Math.floor(height / 10)} m`, 26, 18, '#e8ecf3');
  ctx.textAlign = 'right';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = '#7c8aa3';
  ctx.fillText(`Best ${best} m`, W - 12, 26);

  if (state === 'ready') {
    ctx.fillStyle = 'rgba(10, 14, 24, 0.82)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    centred('Doodle Jump', 200, 30, '#fff');
    centred('Bounce up, do not fall off', 238, 14, '#cdd6e4');
    centred('← → or drag to steer', 262, 14, '#cdd6e4');
    centred('Blue slides · brown breaks · yellow springs', 292, 12, '#7c8aa3');
    centred('Tap or press Space to start', 336, 15, '#fff');
  } else if (state === 'over') {
    ctx.fillStyle = 'rgba(10, 14, 24, 0.8)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    centred('You fell', 230, 32, '#ff5f56');
    centred(`${Math.floor(height / 10)} m   ·   best ${best} m`, 268, 16, '#cdd6e4');
    centred('Tap or press Space to climb again', 310, 14, '#cdd6e4');
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
