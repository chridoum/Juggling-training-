// Point d'entrée : routeur par ancre (#/...) et démarrage.
import * as db from './db.js';
import { applyTheme } from './theme.js';
import { home, welcome, settings, soon } from './views/home.js';
import { agresList, agresNew, agresForm, agresDetail, notFound } from './views/agres.js';
import { figureDetail, figureForm } from './views/figure.js';

// Thème appliqué avant tout rendu, pour éviter un flash clair
try { applyTheme(localStorage.getItem('theme') || 'dark'); } catch { applyTheme('dark'); }

const routes = [
  [/^#?\/?$/, () => home()],
  [/^#\/bienvenue$/, () => welcome()],
  [/^#\/reglages$/, () => settings()],
  [/^#\/agres$/, () => agresList()],
  [/^#\/agres\/nouveau$/, () => agresNew()],
  [/^#\/agres\/perso$/, () => agresForm()],
  [/^#\/agres\/([^/]+)\/modifier$/, m => agresForm(m[1])],
  [/^#\/agres\/([^/]+)$/, m => agresDetail(m[1])],
  [/^#\/figure\/nouvelle\/([^/]+)$/, m => figureForm({ agresId: m[1] })],
  [/^#\/figure\/([^/]+)\/modifier$/, m => figureForm({ id: m[1] })],
  [/^#\/figure\/([^/]+)$/, m => figureDetail(m[1])],
  [/^#\/entrainement$/, () => soon('train')],
  [/^#\/journal$/, () => soon('journal')],
];

async function route() {
  const hash = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) {
      try { await fn(m); } catch (err) { console.error(err); showError(err); }
      return;
    }
  }
  notFound();
}

function showError(err) {
  document.getElementById('view').innerHTML = `
    <div class="empty"><strong>Oups, quelque chose a coincé</strong>${String(err && err.message || err)}</div>`;
}

window.addEventListener('hashchange', route);

(async () => {
  const theme = await db.getMeta('theme');
  if (theme) applyTheme(theme);
  route();
})();

// Fonctionnement hors ligne
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker non installé', err));
}
