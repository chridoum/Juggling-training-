// Point d'entrée : routeur par ancre (#/...) et démarrage.
import * as db from './db.js';
import { applyTheme } from './theme.js';
import { syncCatalog } from './data.js';
import { home, welcome, settings } from './views/home.js';
import { agresList, agresNew, agresForm, agresDetail, notFound } from './views/agres.js';
import { figureDetail, figureForm } from './views/figure.js';
import { trainHome, recorder } from './views/train.js';
import { journal, clipView } from './views/journal.js';

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
  [/^#\/entrainement$/, () => trainHome()],
  [/^#\/enregistrer\/a\/([^/]+)$/, m => recorder(m[1], true)],
  [/^#\/enregistrer\/([^/]+)$/, m => recorder(m[1])],
  [/^#\/journal(\?tri(?:=([^/]+))?)?$/, m => journal(!!m[1], m[2] || null)],
  [/^#\/clip\/([^/]+)$/, m => clipView(m[1])],
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
  try { await syncCatalog(); } catch (err) { console.warn('Mise à jour du catalogue impossible', err); }
  route();
})();

// Fonctionnement hors ligne
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker non installé', err));
}
