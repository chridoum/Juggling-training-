// Glisser-déposer au doigt : appui long sur une ligne, puis déplacement.
// mode « sort » : on réordonne (déposer avant / après une ligne).
// mode « nest » : on dépose sur une ligne pour entrer dedans (ou sur la zone « remonter »).
export function enableDrag(container, { rowSelector, mode = 'sort', upSelector = null, onDrop }) {
  let st = null;
  const MARKS = ['drop-before', 'drop-after', 'drop-into'];
  const clearMarks = () => document.querySelectorAll('.' + MARKS.join(',.')).forEach(e => e.classList.remove(...MARKS));
  const noScroll = e => e.preventDefault();

  function finish(drop) {
    if (!st) return;
    clearTimeout(st.timer); cancelAnimationFrame(st.raf);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel);
    document.removeEventListener('touchmove', noScroll);
    const s = st; st = null;
    if (!s.active) return;
    s.ghost.remove(); s.row.classList.remove('drag-src'); document.body.classList.remove('dragging'); clearMarks();
    // Le « clic » qui suit le relâchement ne doit pas ouvrir la ligne.
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('click', stop, true); setTimeout(() => window.removeEventListener('click', stop, true), 400);
    if (drop && s.where) onDrop({ id: s.id, targetId: s.targetId, where: s.where });
  }

  function activate() {
    if (!st) return;
    st.active = true;
    const r = st.row.getBoundingClientRect();
    const g = st.row.cloneNode(true);
    g.classList.add('drag-ghost'); g.style.width = r.width + 'px'; g.style.left = r.left + 'px'; g.style.top = r.top + 'px';
    document.body.appendChild(g);
    st.ghost = g; st.offY = st.y - r.top;
    st.row.classList.add('drag-src'); document.body.classList.add('dragging');
    document.addEventListener('touchmove', noScroll, { passive: false });
    try { navigator.vibrate && navigator.vibrate(18); } catch { /* ignoré */ }
    const loop = () => {
      if (!st || !st.active) return;
      const y = st.y, H = window.innerHeight;
      if (y < 110) window.scrollBy(0, -12); else if (y > H - 150) window.scrollBy(0, 12);
      st.raf = requestAnimationFrame(loop);
    };
    st.raf = requestAnimationFrame(loop);
  }

  function move(e) {
    if (!st) return;
    st.x = e.clientX; st.y = e.clientY;
    if (!st.active) {
      if (Math.hypot(st.x - st.x0, st.y - st.y0) > 10) finish(false); // le doigt défile : ce n'est pas un glisser
      return;
    }
    st.ghost.style.top = (st.y - st.offY) + 'px';
    clearMarks(); st.where = null; st.targetId = null;
    const el = document.elementFromPoint(st.x, st.y);
    if (!el) return;
    const up = upSelector && el.closest(upSelector);
    if (up) { st.where = 'up'; up.classList.add('drop-into'); return; }
    const row = el.closest(rowSelector);
    if (!row || row === st.row || !container.contains(row)) return;
    st.targetId = row.dataset.id;
    if (mode === 'nest') { st.where = 'into'; row.classList.add('drop-into'); }
    else {
      const rr = row.getBoundingClientRect();
      st.where = st.y < rr.top + rr.height / 2 ? 'before' : 'after';
      row.classList.add(st.where === 'before' ? 'drop-before' : 'drop-after');
    }
  }
  const up = () => finish(true);
  const cancel = () => finish(false);

  container.addEventListener('pointerdown', e => {
    const row = e.target.closest(rowSelector);
    if (!row || st || (e.pointerType === 'mouse' && e.button !== 0)) return;
    st = { row, id: row.dataset.id, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, active: false, where: null };
    st.timer = setTimeout(activate, e.pointerType === 'mouse' ? 200 : 380);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
  });
  container.addEventListener('contextmenu', e => { if (e.target.closest(rowSelector)) e.preventDefault(); });
  container.addEventListener('dragstart', e => e.preventDefault());
}
