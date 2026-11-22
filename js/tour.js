// Visite guidée pratique : au premier lancement, chaque étape montre un bouton et attend que
// l'utilisateur fasse le geste lui-même (filmer, arrêter, ouvrir, ralentir, ranger…) pour passer
// à la suite. Le reste de l'écran est bloqué pour qu'on suive le chemin ; on peut tout passer,
// et une étape bloquée propose de la sauter au bout de quelques secondes.
// On la revoit depuis les Réglages.
import * as db from './db.js';

const hash = () => location.hash || '#/';
const visible = sel => { const e = document.querySelector(sel); return !!(e && e.getClientRects().length); };
let clipId = null; // le clip filmé pendant la visite

const STEPS = [
  { title: 'Bienvenue dans Juglog', text: 'On va faire un tour pratique : régler la caméra, filmer un clip, l\'analyser et le ranger. Suis simplement la zone éclairée.', next: 'Commencer' },
  { target: '#settingsBtn', title: 'Les réglages', text: 'Commence par ouvrir les réglages de l\'enregistrement.',
    done: () => visible('#sheet:not([hidden])') },
  { target: '#sheet', title: 'Régler avant de filmer', text: 'Le tempo du clic, la durée de chaque clip, l\'enchaînement (les clips se suivent jusqu\'à l\'arrêt), l\'écoute (casque ou haut-parleur) et la Musique, pour filmer sur un morceau en boucle. Fais défiler les réglages pour tout voir.', next: 'Suivant',
    // La feuille remonte en haut, plus compacte, pour laisser la place à la fiche.
    enter: () => document.body.classList.add('tour-sheet'),
    leave: () => { document.body.classList.remove('tour-sheet'); const sh = document.getElementById('sheet'); if (sh) sh.hidden = true; } },
  { target: '#rec', title: 'Filmer', text: 'Appuie sur le bouton rouge. Un décompte de 3 secondes, puis l\'enregistrement démarre.',
    done: () => !!document.querySelector('#rec.on') },
  { target: '#rec', title: 'Arrêter', text: 'Filme quelques secondes (fais un mouvement devant la caméra), puis appuie à nouveau pour arrêter.',
    done: () => hash() === '#/trier' },
  { target: '.row-wrap a.row', title: 'Tes clips à trier', text: 'Tes clips arrivent ici. La corbeille supprime un raté sans l\'ouvrir. Ouvre ton clip.',
    done: () => { const m = hash().match(/^#\/clip\/(.+)$/); if (m) clipId = m[1]; return !!m; } },
  { target: '.pl-speed', title: 'Analyser', text: 'Passe au ralenti : touche ×0.25. Tu as aussi l\'image par image, la boucle A-B et la découpe d\'un passage.',
    done: () => { const c = document.querySelector('.pl-speed .chip[data-v="0.25"]'); return !!(c && c.getAttribute('aria-pressed') === 'true'); } },
  // Seulement si aucun agrès n'existe encore (nouvel utilisateur).
  { title: 'Les agrès', text: 'Tes clips se rangent par agrès (balles, massues, poi, staff…), puis dans des dossiers que tu crées toi-même (« 3 balles », « Cascade »…). Tu n\'as pas encore d\'agrès : tu vas créer le premier en rangeant ce clip, avec « + Nouvel agrès ». Choisis-le dans la liste ou tape le nom du tien.', next: 'Suivant',
    skip: async () => (await db.all('agres')).length > 0 },
  { target: '#place', title: 'Ranger', text: 'Range ce clip : choisis un agrès (ou crée-le), puis « Ranger ici ».',
    done: async () => { if (!clipId) return true; const c = await db.get('clips', clipId); return !!(c && c.sorted); } },
  { target: '.tabbar a[data-tab="journal"]', title: 'Le Journal', text: 'Ouvre le Journal : c\'est là que tu retrouves tous tes clips rangés.',
    done: () => hash() === '#/journal' },
  { target: '#view a.row[href^="#/journal/a/"]', title: 'Tes agrès', text: 'Ouvre ton agrès. Dedans, tu crées tes propres dossiers ; un appui long réorganise la liste. « + Agrès » en ajoute un autre.',
    done: () => hash().startsWith('#/journal/a/') },
  { target: '.tabbar a[data-tab="resources"]', title: 'Ressources', text: 'Ouvre les Ressources.',
    done: () => hash() === '#/ressources' },
  { title: 'Tes modèles', text: 'Ici, à part de tes propres clips, tu gardes ce qui t\'inspire : des vidéos de tutoriel, que tu peux analyser au ralenti et comparer à tes essais, et des liens. Le bouton « Ajouter » importe une vidéo ou un lien ; sur Android, tu peux aussi partager une vidéo vers Juglog.', next: 'Suivant' },
  { title: 'À toi de jouer', text: 'C\'est tout ! Tu peux revoir cette visite dans les Réglages (l\'engrenage du Journal ou des Ressources).', next: 'Terminer' },
];

let el = null;

export async function maybeStartTour() {
  if (!['#/', '#', '#/entrainement'].includes(hash())) return;
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
  let i = 0, since = Date.now(), checking = false, timer = null, raf = null, scrolled = false;
  clipId = null;
  el = document.createElement('div');
  el.className = 'tour';
  el.innerHTML = `<div class="tour-block"></div><div class="tour-spot"></div>
    <div class="tour-card" role="dialog" aria-modal="false" aria-labelledby="tourTitle">
      <div class="tour-step" id="tourStep"></div>
      <h3 id="tourTitle"></h3>
      <p id="tourText"></p>
      <div class="tour-dots">${STEPS.map(() => '<i></i>').join('')}</div>
      <div class="tour-actions">
        <button class="btn quiet" id="tourSkip">Passer la visite</button>
        <button class="btn" id="tourStepSkip" hidden>Étape suivante</button>
        <button class="btn primary" id="tourNext" hidden></button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  const spot = $('.tour-spot'), block = $('.tour-block'), card = $('.tour-card');

  // Éclaire la cible et ne laisse toucher qu'elle (le reste de l'écran est bloqué).
  const place = () => {
    const s = STEPS[i], W = window.innerWidth, H = window.innerHeight;
    const tg = s.target && [...document.querySelectorAll(s.target)].find(e => e.getClientRects().length);
    let r = tg && tg.getBoundingClientRect();
    // Cible hors de l'écran (le voile empêche de faire défiler) : on l'amène au centre, une fois par étape.
    if (r && r.width && !scrolled && (r.top < 70 || r.bottom > H - 90)) {
      scrolled = true;
      tg.scrollIntoView({ block: 'center' });
      r = tg.getBoundingClientRect();
    }
    if (r && r.width) {
      const pad = 6, x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, h = r.height + pad * 2;
      Object.assign(spot.style, { display: 'block', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      block.style.clipPath = `path(evenodd, "M0 0H${W}V${H}H0Z M${x} ${y}H${x + w}V${y + h}H${x}Z")`;
      el.classList.add('has-spot');
      card.classList.toggle('top', r.top + r.height / 2 > H / 2);
    } else {
      spot.style.display = 'none';
      block.style.clipPath = 'none';
      el.classList.remove('has-spot');
      card.classList.remove('top');
    }
    // Une fenêtre de l'appli est ouverte (choix d'agrès, ajout…) : elle passe devant, la fiche s'efface.
    el.classList.toggle('behind', !!document.getElementById('modal').open);
  };

  const show = () => {
    const s = STEPS[i];
    since = Date.now(); scrolled = false;
    if (s.enter) try { s.enter(); } catch { /* ignoré */ }
    $('#tourStep').textContent = `${i + 1} / ${STEPS.length}`;
    $('#tourTitle').textContent = s.title;
    $('#tourText').textContent = s.text;
    el.querySelectorAll('.tour-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    $('#tourNext').hidden = !s.next;
    if (s.next) $('#tourNext').textContent = s.next;
    $('#tourSkip').hidden = i === STEPS.length - 1;
    $('#tourStepSkip').hidden = true;
    place();
  };

  const advance = async () => {
    const leave = STEPS[i].leave;
    if (leave) try { leave(); } catch { /* ignoré */ }
    if (i >= STEPS.length - 1) { end(); return; }
    i++;
    // Étape inutile dans cette situation (ex. présentation des agrès quand il y en a déjà) : on la saute.
    while (STEPS[i].skip && i < STEPS.length - 1 && await STEPS[i].skip()) i++;
    show();
  };

  // Vérifie régulièrement si le geste demandé a été fait.
  const tick = async () => {
    if (!el || checking) return;
    const s = STEPS[i];
    if (!s.done) return;
    checking = true;
    let ok = false;
    try { ok = await s.done(); } catch { ok = false; }
    checking = false;
    if (!el) return;
    if (ok) { advance(); return; }
    // Rien ne bouge depuis un moment (caméra refusée, clip trop court…) : on propose de sauter l'étape.
    if (Date.now() - since > 9000) $('#tourStepSkip').hidden = false;
  };
  const loop = () => { if (!el) return; place(); raf = requestAnimationFrame(loop); };

  const end = () => {
    clearInterval(timer); cancelAnimationFrame(raf);
    window.removeEventListener('hashchange', tick);
    if (el) el.remove(); el = null;
    document.body.classList.remove('tour-sheet');
    db.setMeta('tourDone', true);
  };
  $('#tourSkip').onclick = () => { const l = STEPS[i].leave; if (l) try { l(); } catch { /* ignoré */ } end(); };
  $('#tourStepSkip').onclick = advance;
  $('#tourNext').onclick = advance;
  window.addEventListener('hashchange', tick);
  timer = setInterval(tick, 300);
  show();
  loop();
}
