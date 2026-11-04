// Petits outils d'interface partagés par toutes les vues.

const $view = () => document.getElementById('view');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const ICON = {
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v6H4V6h6"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

// Affiche une vue : titre, bouton retour, actions en haut, contenu, bouton principal en bas.
export function setView({ title, back = null, actions = [], body = '', fab = null, tab = null }) {
  document.getElementById('pageTitle').textContent = title;
  document.title = title === 'Carnet de jongle' ? title : `${title} · Carnet de jongle`;

  const backBtn = document.getElementById('backBtn');
  backBtn.hidden = !back;
  backBtn.onclick = back ? () => { location.hash = back; } : null;

  const top = document.getElementById('topActions');
  top.innerHTML = actions.map((a, i) =>
    `<button class="icon-btn" data-i="${i}" aria-label="${esc(a.label)}">${a.icon}</button>`).join('');
  top.querySelectorAll('button').forEach(b => { b.onclick = actions[+b.dataset.i].onClick; });

  const fabZone = document.getElementById('fabZone');
  if (fab) {
    fabZone.innerHTML = `<button class="btn primary" id="fabBtn">${fab.icon || ''}${esc(fab.label)}</button>`;
    document.getElementById('fabBtn').onclick = fab.onClick;
  } else {
    fabZone.innerHTML = '';
  }

  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));

  const v = $view();
  v.innerHTML = body;
  window.scrollTo(0, 0);
  return v;
}

let toastTimer = null;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// Boîte de confirmation : renvoie true si l'utilisateur confirme.
export function confirmBox({ title, text, ok = 'Confirmer', danger = false }) {
  const d = document.getElementById('modal');
  d.innerHTML = `
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    <div class="btn-row">
      <button class="btn" value="cancel">Annuler</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(ok)}</button>
    </div>`;
  return new Promise(resolve => {
    d.querySelectorAll('button').forEach(b => {
      b.onclick = () => { d.close(); resolve(b.value === 'ok'); };
    });
    d.oncancel = () => resolve(false);
    d.showModal();
  });
}

export function levelDots(n) {
  return `<span class="level" aria-label="Niveau ${n} sur 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
}

export function splitList(s) {
  return String(s || '').split(',').map(x => x.trim()).filter(Boolean);
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function fmtBytes(b) {
  if (b < 1024) return `${b} o`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} Ko`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} Mo`;
  return `${(b / 1024 ** 3).toFixed(1)} Go`;
}

export function byName(a, b) {
  return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
}
