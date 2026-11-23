// « Que pratiques-tu ? » : au premier lancement (avant la visite guidée), puis depuis les Réglages.
// Le choix ne verrouille rien : il met en avant les disciplines de ces pratiques et règle quelques défauts.
import { PRACTICES, OTHER } from '../catalog.js';
import { myPractices, setMyPractices } from '../data.js';
import { loadPrefs, savePrefs } from '../music.js';
import { setView, esc } from '../ui.js';
import * as db from '../db.js';
import { startTour } from '../tour.js';

export async function pratiques() {
  const current = await myPractices();
  const first = !current;
  const chosen = new Set(current || []);
  document.body.classList.toggle('first-run', first);

  const tile = p => `<button class="pr-tile" data-p="${p.key}" aria-pressed="${chosen.has(p.key)}">
      <span class="pr-name">${esc(p.name)}</span>
      <span class="pr-ex">${p.items.length ? p.items.slice(0, 3).map(i => `<span>${esc(i.name)}</span>`).join(', ') + '…' : '<span>Tu crées tes propres disciplines</span>'}</span>
    </button>`;
  const v = setView({
    title: 'Tes pratiques', back: first ? null : '#/reglages', tab: 'train',
    body: `
      <p class="muted pr-intro">Choisis une ou plusieurs pratiques : l'appli te proposera les bonnes disciplines. Tu pourras changer ça à tout moment dans les Réglages.</p>
      <div class="pr-grid">${[...PRACTICES, OTHER].map(tile).join('')}</div>
      <button class="btn primary block pr-go" id="go">${first ? 'Continuer' : 'Enregistrer'}</button>`,
  });
  const go = v.querySelector('#go');
  const sync = () => { go.disabled = chosen.size === 0; };
  v.querySelectorAll('[data-p]').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.p;
      if (chosen.has(k)) chosen.delete(k); else chosen.add(k);
      b.setAttribute('aria-pressed', chosen.has(k));
      sync();
    };
  });
  sync();
  go.onclick = async () => {
    const list = [...PRACTICES, OTHER].map(p => p.key).filter(k => chosen.has(k));
    await setMyPractices(list);
    document.body.classList.remove('first-run');
    if (first) {
      // Défauts selon la pratique : en danse, on compte par phrases de 8 temps.
      const P = loadPrefs();
      if (chosen.has('danse') && !chosen.has('jonglerie')) { P.beats = 8; savePrefs(P); }
      location.hash = '#/entrainement';
      if (!(await db.getMeta('tourDone'))) setTimeout(() => startTour(), 900);
    } else location.hash = '#/reglages';
  };
}
