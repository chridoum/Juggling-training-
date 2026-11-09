// Point d'entrée : routeur par ancre (#/...) et démarrage.
import * as db from './db.js';
import { applyTheme } from './theme.js';
import { migrate, purgeDeleted } from './data.js';
import { notFound } from './ui.js';
import { recorder } from './views/train.js';
import { trier, journalHome, journalFolder, clipView } from './views/journal.js';
import { compare } from './views/compare.js';
import { resources, resourcesAgres, refView, receiveShare } from './views/resources.js';
import { settings } from './views/settings.js';

// Thème appliqué avant tout rendu, pour éviter un flash clair
try { applyTheme(localStorage.getItem('theme') || 'dark'); } catch { applyTheme('dark'); }

const routes = [
  [/^#?\/?$/, () => { location.replace('#/entrainement'); }],
  [/^#\/entrainement$/, () => recorder()],
  [/^#\/trier$/, () => trier()],
  [/^#\/journal$/, () => journalHome()],
  [/^#\/journal\/a\/([^/]+)(?:\/([^/]+))?$/, m => journalFolder(m[1], m[2] || null)],
  [/^#\/clip\/([^/]+)$/, m => clipView(m[1])],
  [/^#\/comparer\/([^/]+)\/([^/]+)$/, m => compare(m[1], m[2])],
  [/^#\/ressources$/, () => resources()],
  [/^#\/ressources\/a\/([^/]+)$/, m => resourcesAgres(m[1])],
  [/^#\/ressource\/([^/]+)$/, m => refView(m[1])],
  [/^#\/partage$/, () => receiveShare()],
  [/^#\/reglages$/, () => settings()],
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
  try { await purgeDeleted(); } catch (err) { console.warn(err); }
  try { await migrate(); } catch (err) { console.warn('Migration impossible', err); }
  db.askPersistence();
  route();
})();

// Fonctionnement hors ligne
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker non installé', err));
}
