// Visite guidée : au premier lancement, une petite fiche présente les fonctions dans l'ordre
// où on s'en sert, en éclairant le bouton concerné. On peut la passer, et la revoir depuis les Réglages.
import * as db from './db.js';

const STEPS = [
  { title: 'Bienvenue dans Juglog', text: 'Filme de courts clips pendant que tu t\'entraînes, analyse-les, range-les. Voici l\'essentiel en une minute.' },
  { target: '#rec', title: 'Filmer', text: 'Appuie pour lancer l\'enregistrement : un décompte, puis les clips s\'enchaînent tout seuls jusqu\'à ce que tu appuies à nouveau.' },
  { target: '#settingsBtn', title: 'Tempo et réglages', text: 'Le métronome, la durée des clips et la musique : choisis un morceau, il tourne en boucle avec le clic calé sur ses temps.' },
  { target: 'a.rec-side[href="#/trier"]', title: 'Trier', text: 'À l\'arrêt, tes clips t\'attendent ici. Supprime les ratés d\'un geste, ouvre les autres pour les nommer.' },
  { title: 'Analyser', text: 'Dans un clip : ralenti, image par image, boucle A-B, découpe d\'un passage, et comparaison côte à côte avec un autre clip.' },
  { target: '.tabbar a[data-tab="journal"]', title: 'Ranger', text: 'Range tes clips par agrès, puis dans tes propres dossiers. Un appui long réorganise la liste.' },
  { target: '.tabbar a[data-tab="resources"]', title: 'Apprendre', text: 'Garde ici tes vidéos de référence et tes liens de tutoriels. Sur Android, partage une vidéo ou un lien vers Juglog pour l\'ajouter.' },
  { title: 'À toi de jouer', text: 'Tu peux revoir cette visite à tout moment dans les Réglages (l\'engrenage du Journal).' },
];

let el = null;

export async function maybeStartTour() {
  const h = location.hash || '#/';
  if (!['#/', '#', '#/entrainement'].includes(h)) return;
  if (await db.getMeta('tourDone')) return;
  setTimeout(() => startTour(), 900);
}

// Relance depuis les Réglages : on revient d'abord sur l'écran d'entraînement.
export function replayTour() {
  location.hash = '#/entrainement';
  setTimeout(() => startTour(), 900);
}

export function startTour() {
  if (el) el.remove();
  let i = 0;
  el = document.createElement('div');
  el.className = 'tour';
  el.innerHTML = `<div class="tour-spot"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
      <div class="tour-step" id="tourStep"></div>
      <h3 id="tourTitle"></h3>
      <p id="tourText"></p>
      <div class="tour-dots">${STEPS.map(() => '<i></i>').join('')}</div>
      <div class="tour-actions">
        <button class="btn quiet" id="tourSkip">Passer</button>
        <button class="btn" id="tourPrev">Précédent</button>
        <button class="btn primary" id="tourNext">Suivant</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  const spot = $('.tour-spot'), card = $('.tour-card');

  const place = () => {
    const s = STEPS[i];
    const tg = s.target && document.querySelector(s.target);
    const r = tg && tg.getBoundingClientRect();
    if (r && r.width) {
      const pad = 6;
      Object.assign(spot.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      el.classList.add('has-spot');
      // Fiche du côté opposé à l'élément éclairé.
      const low = r.top + r.height / 2 > window.innerHeight / 2;
      card.classList.toggle('top', low);
    } else {
      spot.style.display = 'none';
      el.classList.remove('has-spot');
      card.classList.remove('top');
    }
  };

  const show = () => {
    const s = STEPS[i];
    $('#tourStep').textContent = `${i + 1} / ${STEPS.length}`;
    $('#tourTitle').textContent = s.title;
    $('#tourText').textContent = s.text;
    el.querySelectorAll('.tour-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    $('#tourPrev').hidden = i === 0;
    $('#tourSkip').hidden = i === STEPS.length - 1;
    $('#tourNext').textContent = i === STEPS.length - 1 ? 'C\'est parti' : 'Suivant';
    place();
    $('#tourNext').focus({ focusVisible: false });
  };

  const end = () => {
    window.removeEventListener('resize', place);
    el.remove(); el = null;
    db.setMeta('tourDone', true);
  };
  $('#tourSkip').onclick = end;
  $('#tourPrev').onclick = () => { if (i > 0) { i--; show(); } };
  $('#tourNext').onclick = () => { if (i < STEPS.length - 1) { i++; show(); } else end(); };
  el.addEventListener('keydown', e => { if (e.key === 'Escape') end(); });
  window.addEventListener('resize', place);
  show();
}
