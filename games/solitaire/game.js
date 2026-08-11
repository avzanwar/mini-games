// Solitaire (Klondike, draw one) — plain canvas, no assets, no dependencies.
// Tap a card to pick it up, tap a pile to put it down.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Tuning knobs -----------------------------------------------------------
const W = canvas.width;          // 360
const H = canvas.height;         // 560
const HUD_H = 36;

const CARD_W = 44;
const CARD_H = 62;
const GAP = 4;
const MARGIN = (W - (7 * CARD_W + 6 * GAP)) / 2;   // 14
const TOP_Y = 42;
const TAB_Y = 118;
const DOWN_OFF = 9;              // how far each face-down card peeks out
const UP_OFF = 17;               // and each face-up one

const STOCK_COL = 0;
const WASTE_COL = 1;
const FOUNDATION_COLS = [3, 4, 5, 6];

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RESTART_DELAY = 400;

const colX = (col) => MARGIN + col * (CARD_W + GAP);
const isRed = (card) => card.s === 1 || card.s === 2;

// --- State ------------------------------------------------------------------
let stock, waste, foundations, tableau;
let selection, moves, startTime, endTime, state, wonAt;
let best = localStorage.getItem('solitaire-best');
best = best === null ? null : Number(best);

function deal() {
  const deck = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) deck.push({ r, s, faceUp: false });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  tableau = [];
  for (let col = 0; col < 7; col++) {
    const pile = deck.splice(0, col + 1);
    pile[pile.length - 1].faceUp = true;
    tableau.push(pile);
  }
  stock = deck;
  waste = [];
  foundations = [[], [], [], []];
  selection = null;
  moves = 0;
  startTime = 0;
  endTime = 0;
  wonAt = 0;
  state = 'ready';
}

function elapsed() {
  if (!startTime) return 0;
  return Math.floor(((endTime || Date.now()) - startTime) / 1000);
}

function clock(secs) {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

// --- Rules ------------------------------------------------------------------
// A movable run is descending by one with alternating colours.
function isRun(cards) {
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].r !== cards[i - 1].r - 1) return false;
    if (isRed(cards[i]) === isRed(cards[i - 1])) return false;
  }
  return true;
}

function canPlaceOnFoundation(card, f) {
  return card.s === f && foundations[f].length === card.r - 1;
}

function canPlaceOnTableau(run, col) {
  const pile = tableau[col];
  if (!pile.length) return run[0].r === 13;          // only a King starts a column
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return run[0].r === top.r - 1 && isRed(run[0]) !== isRed(top);
}

// Whatever the current selection refers to, as an array of cards.
function selectedCards() {
  if (!selection) return [];
  if (selection.from === 'tableau') return tableau[selection.col].slice(selection.index);
  if (selection.from === 'waste') return waste.slice(-1);
  return foundations[selection.col].slice(-1);
}

function removeSelected() {
  if (selection.from === 'tableau') {
    const pile = tableau[selection.col];
    pile.length = selection.index;
    // Uncovering a face-down card turns it over.
    if (pile.length && !pile[pile.length - 1].faceUp) pile[pile.length - 1].faceUp = true;
  } else if (selection.from === 'waste') {
    waste.pop();
  } else {
    foundations[selection.col].pop();
  }
}

function began() {
  if (!startTime) startTime = Date.now();
}

function checkWin() {
  if (foundations.every((f) => f.length === 13)) {
    state = 'won';
    endTime = Date.now();
    wonAt = performance.now();
    const secs = elapsed();
    if (best === null || secs < best) {
      best = secs;
      localStorage.setItem('solitaire-best', String(best));
    }
  }
}

function moveTo(target) {
  // Only foundations and columns are places a card can go. Anything else
  // (the waste, the deck) has no index, so bail before using one.
  if (target.kind !== 'foundation' && target.kind !== 'tableau') return false;
  const cards = selectedCards();
  if (!cards.length || !isRun(cards)) return false;

  if (target.kind === 'foundation') {
    if (cards.length !== 1 || !canPlaceOnFoundation(cards[0], target.index)) return false;
    removeSelected();
    foundations[target.index].push(cards[0]);
  } else {
    if (!canPlaceOnTableau(cards, target.index)) return false;
    removeSelected();
    tableau[target.index].push(...cards);
  }
  selection = null;
  moves++;
  began();
  checkWin();
  return true;
}

function drawFromStock() {
  began();
  if (stock.length) {
    const card = stock.pop();
    card.faceUp = true;
    waste.push(card);
  } else if (waste.length) {
    // Turn the waste back over to go round again.
    while (waste.length) {
      const card = waste.pop();
      card.faceUp = false;
      stock.push(card);
    }
  }
  selection = null;
  moves++;
}

// --- Hit testing ------------------------------------------------------------
function cardY(col, i) {
  let y = TAB_Y;
  for (let k = 0; k < i; k++) y += tableau[col][k].faceUp ? UP_OFF : DOWN_OFF;
  return y;
}

function inRect(x, y, rx, ry, rw, rh) {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

function hitTest(x, y) {
  if (inRect(x, y, W - 34, 4, 30, 28)) return { kind: 'restart' };
  if (inRect(x, y, colX(STOCK_COL), TOP_Y, CARD_W, CARD_H)) return { kind: 'stock' };
  if (inRect(x, y, colX(WASTE_COL), TOP_Y, CARD_W, CARD_H)) return { kind: 'waste' };
  for (let f = 0; f < 4; f++) {
    if (inRect(x, y, colX(FOUNDATION_COLS[f]), TOP_Y, CARD_W, CARD_H)) {
      return { kind: 'foundation', index: f };
    }
  }
  for (let col = 0; col < 7; col++) {
    const pile = tableau[col];
    const x0 = colX(col);
    if (x < x0 || x > x0 + CARD_W) continue;
    if (!pile.length) {
      if (inRect(x, y, x0, TAB_Y, CARD_W, CARD_H)) return { kind: 'tableau', index: col, card: -1 };
      continue;
    }
    // Top card first — it is the one drawn over the others.
    for (let i = pile.length - 1; i >= 0; i--) {
      const top = cardY(col, i);
      const bottom = i === pile.length - 1 ? top + CARD_H : cardY(col, i + 1);
      if (y >= top && y <= bottom) return { kind: 'tableau', index: col, card: i };
    }
  }
  return null;
}

// --- Input ------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (W / rect.width);
  const y = (e.clientY - rect.top) * (H / rect.height);

  if (state === 'ready') { state = 'playing'; return; }
  if (state === 'won') {
    if (performance.now() - wonAt > RESTART_DELAY) deal();
    return;
  }

  const hit = hitTest(x, y);
  if (!hit) { selection = null; return; }

  if (hit.kind === 'restart') { deal(); state = 'playing'; return; }
  if (hit.kind === 'stock') { drawFromStock(); return; }

  if (selection && moveTo(hit)) return;

  // Nothing was placed, so treat the tap as picking something up instead.
  if (hit.kind === 'waste') {
    selection = waste.length ? { from: 'waste', col: 0, index: waste.length - 1 } : null;
  } else if (hit.kind === 'foundation') {
    selection = foundations[hit.index].length ? { from: 'foundation', col: hit.index } : null;
  } else if (hit.kind === 'tableau' && hit.card >= 0) {
    const card = tableau[hit.index][hit.card];
    if (!card.faceUp) { selection = null; return; }
    const already = selection && selection.from === 'tableau' &&
                    selection.col === hit.index && selection.index === hit.card;
    selection = already ? null : { from: 'tableau', col: hit.index, index: hit.card };
  } else {
    selection = null;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (state === 'ready') state = 'playing';
    else if (state === 'won' && performance.now() - wonAt > RESTART_DELAY) deal();
    else drawFromStock();
  } else if (e.code === 'KeyN') {
    deal();
    state = 'playing';
  }
});

// --- Draw -------------------------------------------------------------------
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawSlot(x, y, glyph) {
  ctx.strokeStyle = 'rgba(232, 236, 243, 0.22)';
  ctx.lineWidth = 1.5;
  roundRect(x, y, CARD_W, CARD_H, 5);
  ctx.stroke();
  if (glyph) {
    ctx.fillStyle = 'rgba(232, 236, 243, 0.28)';
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x + CARD_W / 2, y + CARD_H / 2);
    ctx.textBaseline = 'alphabetic';
  }
}

function drawCard(card, x, y, highlight) {
  if (!card.faceUp) {
    ctx.fillStyle = '#2b4a86';
    roundRect(x, y, CARD_W, CARD_H, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    roundRect(x + 4, y + 4, CARD_W - 8, CARD_H - 8, 3);
    ctx.stroke();
    return;
  }

  ctx.fillStyle = '#f7f5ef';
  roundRect(x, y, CARD_W, CARD_H, 5);
  ctx.fill();
  ctx.strokeStyle = highlight ? '#ffd93d' : 'rgba(0,0,0,0.25)';
  ctx.lineWidth = highlight ? 2.5 : 1;
  roundRect(x, y, CARD_W, CARD_H, 5);
  ctx.stroke();

  const tint = isRed(card) ? '#d1345b' : '#1d2433';
  ctx.fillStyle = tint;
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(RANKS[card.r], x + 4, y + 15);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(SUITS[card.s], x + 4, y + 27);
  ctx.textAlign = 'center';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText(SUITS[card.s], x + CARD_W / 2 + 4, y + CARD_H - 12);
}

function draw() {
  ctx.fillStyle = '#10281c';
  ctx.fillRect(0, 0, W, H);

  // HUD — moves and clock centred, restart right, top-left clear for the link.
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#cfe3d6';
  ctx.fillText(`Moves ${moves}  ·  ${clock(elapsed())}`, W / 2, 24);
  ctx.fillStyle = 'rgba(232, 236, 243, 0.5)';
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText('↻', W - 19, 25);

  // Stock and waste
  if (stock.length) drawCard({ faceUp: false }, colX(STOCK_COL), TOP_Y);
  else drawSlot(colX(STOCK_COL), TOP_Y, waste.length ? '↻' : '');
  if (waste.length) {
    const sel = selection && selection.from === 'waste';
    drawCard(waste[waste.length - 1], colX(WASTE_COL), TOP_Y, sel);
  } else {
    drawSlot(colX(WASTE_COL), TOP_Y, '');
  }

  // Foundations
  for (let f = 0; f < 4; f++) {
    const x = colX(FOUNDATION_COLS[f]);
    const pile = foundations[f];
    if (pile.length) {
      const sel = selection && selection.from === 'foundation' && selection.col === f;
      drawCard(pile[pile.length - 1], x, TOP_Y, sel);
    } else {
      drawSlot(x, TOP_Y, SUITS[f]);
    }
  }

  // Tableau
  for (let col = 0; col < 7; col++) {
    const pile = tableau[col];
    if (!pile.length) { drawSlot(colX(col), TAB_Y, ''); continue; }
    for (let i = 0; i < pile.length; i++) {
      const picked = selection && selection.from === 'tableau' &&
                     selection.col === col && i >= selection.index;
      drawCard(pile[i], colX(col), cardY(col, i), picked);
    }
  }

  if (state === 'ready' || state === 'won') {
    ctx.fillStyle = 'rgba(6, 16, 11, 0.9)';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    ctx.textAlign = 'center';
    if (state === 'ready') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.fillText('Solitaire', W / 2, 200);
      ctx.fillStyle = '#cfe3d6';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText('Tap a card, then tap where to put it', W / 2, 238);
      ctx.fillText('Tap the deck to turn a card over', W / 2, 260);
      ctx.fillText('Build the four piles up from ace', W / 2, 282);
      ctx.fillStyle = '#fff';
      ctx.fillText('Tap or press Space to start', W / 2, 322);
    } else {
      ctx.fillStyle = '#6ee7a8';
      ctx.font = 'bold 32px system-ui, sans-serif';
      ctx.fillText('You win!', W / 2, 220);
      ctx.fillStyle = '#cfe3d6';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(`${clock(elapsed())} · ${moves} moves`, W / 2, 254);
      if (best !== null) ctx.fillText(`Best ${clock(best)}`, W / 2, 278);
      ctx.fillText('Tap or press Space to deal again', W / 2, 318);
    }
  }
}

function frame() {
  draw();
  requestAnimationFrame(frame);
}

deal();
requestAnimationFrame(frame);
