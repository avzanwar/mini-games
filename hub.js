// Genre filter for the hub. Everything is visible by default, so if this
// script never runs the page still works as a grouped list.
const chips = Array.from(document.querySelectorAll('.chip'));
const sections = Array.from(document.querySelectorAll('.genre'));
const STORE = 'hub-filter';

function apply(filter) {
  for (const section of sections) {
    section.hidden = filter !== 'all' && section.dataset.genre !== filter;
  }
  for (const chip of chips) {
    const on = chip.dataset.filter === filter;
    chip.classList.toggle('is-active', on);
    chip.setAttribute('aria-pressed', String(on));
  }
  try { localStorage.setItem(STORE, filter); } catch (e) { /* private mode */ }
}

for (const chip of chips) {
  chip.addEventListener('click', () => apply(chip.dataset.filter));
}

// Come back to whichever genre you were browsing last.
let saved = 'all';
try { saved = localStorage.getItem(STORE) || 'all'; } catch (e) { /* private mode */ }
if (!chips.some((c) => c.dataset.filter === saved)) saved = 'all';
apply(saved);
