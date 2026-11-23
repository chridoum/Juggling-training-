// Visites guidées.
// - La visite générale, au premier lancement : chaque étape éclaire un élément et attend que
//   l'utilisateur fasse le geste lui-même (ou touche « Suivant » pour les étapes de présentation).
// - La visite de la page Musique, à la première ouverture de cette page.
// Le reste de l'écran est bloqué pour qu'on suive le chemin ; une étape peut autoriser une page
// « en excursion » (la visite se met en pause et reprend au retour). On peut tout passer, et une
// étape bloquée propose de la sauter au bout de quelques secondes.
import * as db from './db.js';

const hash = () => location.hash || '#/';
const visible = sel => { const e = document.querySelector(sel); return !!(e && e.getClientRects().length); };
const exists = sel => [...document.querySelectorAll(sel)].some(e => e.getClientRects().length);
let clipId = null; // le clip filmé pendant la visite générale

// ---------- Visite générale ----------
const MAIN = [
  { title: 'À quoi sert Juglog ?', text: 'Juglog t\'aide à progresser dans ta pratique grâce à la vidéo : jonglerie, danse, cirque, musique, arts martiaux…\n• Filme des essais courts, en rythme avec un métronome ou ta musique, sans avoir à découper de longues séances.\n• Revois-les au ralenti, image par image, et compare-les à tes essais précédents ou à une vidéo de référence.\n• Range-les par discipline pour retrouver tes mouvements et suivre tes progrès.\nTout reste sur ton téléphone : rien n\'est envoyé sur internet.', next: 'Suivant' },
  { title: 'Bienvenue dans Juglog', text: 'On va faire un tour pratique : régler la caméra, filmer un clip, l\'analyser et le ranger. Suis simplement la zone éclairée.', next: 'Commencer' },
  { route: '#/entrainement', target: '#settingsBtn', title: 'Les réglages', text: 'Commence par ouvrir les réglages de l\'enregistrement.',
    done: () => visible('#sheet:not([hidden])') },
  { route: '#/entrainement', allow: ['#/musique'], target: '#sheet', title: 'Régler avant de filmer', text: 'Le tempo du clic, la durée de chaque clip, l\'enchaînement (les clips se suivent jusqu\'à l\'arrêt), l\'écoute (casque ou haut-parleur) et la Musique, pour filmer sur un morceau en boucle. Fais défiler les réglages pour tout voir.', next: 'Suivant',
    // La feuille remonte en haut, plus compacte, pour laisser la place à la fiche.
    enter: () => {
      document.body.classList.add('tour-sheet');
      const sh = document.getElementById('sheet'); if (sh) sh.hidden = false;
    },
    leave: () => { document.body.classList.remove('tour-sheet'); const sh = document.getElementById('sheet'); if (sh) sh.hidden = true; } },
  { route: '#/entrainement', target: '#rec', title: 'Filmer', text: 'Appuie sur le bouton rouge. Un décompte de 3 secondes, puis l\'enregistrement démarre.',
    done: () => !!document.querySelector('#rec.on') },
  { route: '#/entrainement', target: '#rec', title: 'Arrêter', text: 'Filme quelques secondes (fais un mouvement devant la caméra), puis appuie à nouveau pour arrêter.',
    done: () => hash() === '#/trier' },
  { target: '.row-wrap a.row', title: 'Tes clips à trier', text: 'Tes clips arrivent ici. La corbeille supprime un raté sans l\'ouvrir. Ouvre ton clip.',
    done: () => { const m = hash().match(/^#\/clip\/(.+)$/); if (m) clipId = m[1]; return !!m; } },
  // Exploration libre du lecteur : tout le lecteur répond au doigt.
  { route: () => (clipId ? `#/clip/${clipId}` : null), target: '#player', card: 'bottom', title: 'Analyser',
    // Place en bas de page pour pouvoir remonter les commandes du lecteur au-dessus de la fiche.
    enter: () => document.body.classList.add('tour-room'), leave: () => document.body.classList.remove('tour-room'), text: 'Explore le lecteur : lecture, image par image (◀︎| |▶︎), vitesses de ×0.1 à ×2, repères A et B pour boucler un passage, « Créer un clip de A à B » pour en découper un. Fais défiler pour tout voir.', next: 'Suivant' },
  // Seulement si aucun agrès n'existe encore (nouvel utilisateur).
  { title: 'Les disciplines', text: 'Tes clips se rangent par discipline (hip-hop, tissu aérien, balles, guitare…), puis dans des dossiers que tu crées toi-même (une chorégraphie, une figure, un exercice…). Tu n\'as pas encore de discipline : tu vas créer la première en rangeant ce clip, avec « + Nouvelle discipline ». Choisis-la dans la liste ou tape le nom de la tienne.', next: 'Suivant',
    skip: async () => (await db.all('agres')).length > 0 },
  { target: '#place', title: 'Ranger', text: 'Range ce clip : choisis une discipline (ou crée-la), puis « Ranger ici ».',
    done: async () => { if (!clipId) return true; const c = await db.get('clips', clipId); return !!(c && c.sorted); } },
  { target: '.tabbar a[data-tab="journal"]', title: 'Le Journal', text: 'Ouvre le Journal : c\'est là que tu retrouves tous tes clips rangés.',
    done: () => hash() === '#/journal' },
  { target: '#view a.row[href^="#/journal/a/"]', title: 'Tes disciplines', text: 'Ouvre ta discipline. Dedans, tu crées tes propres dossiers ; un appui long réorganise la liste. « + Discipline » en ajoute une autre.',
    done: () => hash().startsWith('#/journal/a/') },
  { target: '.tabbar a[data-tab="resources"]', title: 'Ressources', text: 'Ouvre les Ressources.',
    done: () => hash() === '#/ressources' },
  { title: 'Tes modèles', text: 'Ici, à part de tes propres clips, tu gardes ce qui t\'inspire : des vidéos de tutoriel, que tu peux analyser au ralenti et comparer à tes essais, et des liens. Le bouton « Ajouter » importe une vidéo ou un lien ; sur Android, tu peux aussi partager une vidéo vers Juglog.', next: 'Suivant' },
  { title: 'À toi de jouer', text: 'C\'est tout ! Tu peux revoir cette visite dans les Réglages (l\'engrenage du Journal ou des Ressources).', next: 'Terminer' },
];

// ---------- Page Musique, sans morceau : inviter à en importer un ----------
const MUSIC_EMPTY = [
  { route: '#/musique', target: '#choose', title: 'La Musique', text: 'Importe un morceau de ton téléphone (MP3, M4A…) : il tournera en boucle pendant que tu filmes, avec le clic calé sur ses temps.', next: 'Plus tard',
    done: () => exists('.mu-track') },
];

// ---------- Page Musique, avec un morceau : présentation de l'écran ----------
const MUSIC = [
  { route: '#/musique', target: '.mu-track', title: 'Ton morceau', text: 'Son tempo est détecté à l\'import. « Changer » pour en prendre un autre ou en importer un nouveau.', next: 'Suivant' },
  { route: '#/musique', target: '[role="group"][aria-label="Mode"]', title: 'Deux façons de filmer', text: '« Un clip = la boucle » : chaque clip dure exactement la boucle et la musique repart à chaque clip. « Clips le long » : le morceau tourne en continu et un clip démarre toutes les 10 s, 30 s…', next: 'Suivant' },
  { route: '#/musique', target: '#ov', title: 'Tout le morceau', text: 'La partie orange est la boucle. Glisse dessus pour la déplacer dans le morceau.', next: 'Suivant', skip: () => !exists('#ov') },
  { route: '#/musique', target: '#zm', title: 'La boucle en détail', text: 'Tire les poignées A et B, glisse à l\'intérieur pour déplacer la boucle entière, pince pour zoomer, glisse à deux doigts pour faire défiler.', next: 'Suivant', skip: () => !exists('#zm') },
  { route: '#/musique', target: '.mu-adjust', title: 'Longueur du clip', text: 'Les flèches ‹ › déplacent A ou B d\'une mesure. La longueur de la boucle est la durée de chacun de tes clips.', next: 'Suivant', skip: () => !exists('.mu-adjust') },
  { route: '#/musique', target: '.mu-snap', title: 'Calage', text: 'A et B se posent sur les mesures (ou sur les temps), pour que la boucle retombe toujours en rythme.', next: 'Suivant', skip: () => !exists('.mu-snap') },
  { route: '#/musique', target: '.mu-transport', title: 'Écouter', text: 'Écoute la boucle avec le clic. « Clic : non » coupe le son du clic, le point lumineux continue de battre.', next: 'Suivant' },
  { route: '#/musique', target: '.mu-bpm', title: 'Tempo', text: 'Si le clic ne tombe pas juste : ÷2 ou ×2 quand l\'analyse a trouvé la moitié ou le double, et « Caler le clic » pour l\'aligner en tapant sur les temps.', next: 'Suivant' },
  { route: '#/musique', target: '#use', title: 'C\'est prêt', text: '« Utiliser » te ramène à la caméra : la musique démarrera avec l\'enregistrement.', next: 'Terminer',
    done: () => hash() !== '#/musique' },
];

// ---------- Moteur ----------
const running = new Map(); // clé → visite en cours

function runTour(key, steps, { flag, onEnd } = {}) {
  if (running.has(key)) return;
  let i = 0, since = Date.now(), checking = false, timer = null, raf = null, scrolled = false, returning = false, paused = false;
  const el = document.createElement('div');
  el.className = 'tour';
  el.innerHTML = `<div class="tour-block"></div><div class="tour-spot"></div>
    <div class="tour-card" role="dialog" aria-modal="false" aria-labelledby="tourTitle-${key}">
      <div class="tour-step"></div>
      <h3 id="tourTitle-${key}" class="tour-title"></h3>
      <p class="tour-text"></p>
      <button class="tour-more" hidden>Lire</button>
      <div class="tour-dots">${steps.length > 1 ? steps.map(() => '<i></i>').join('') : ''}</div>
      <div class="tour-actions">
        <button class="btn quiet tour-skip">Passer la visite</button>
        <button class="btn tour-stepskip" hidden>Étape suivante</button>
        <button class="btn primary tour-next" hidden></button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  const spot = $('.tour-spot'), block = $('.tour-block'), card = $('.tour-card');
  const routeOf = s => (typeof s.route === 'function' ? s.route() : s.route);

  // Éclaire la cible et ne laisse toucher qu'elle (le reste de l'écran est bloqué).
  const place = () => {
    const s = steps[i], W = window.innerWidth, H = window.innerHeight;
    // Page autorisée « en excursion » : la visite s'efface jusqu'au retour.
    const away = !!(s.allow && s.allow.includes(hash()));
    if (away !== paused) {
      paused = away;
      el.style.display = away ? 'none' : '';
      if (!away && s.enter) setTimeout(() => { try { s.enter(); } catch { /* ignoré */ } }, 700);
    }
    if (paused) return;
    const tg = s.target && [...document.querySelectorAll(s.target)].find(e => e.getClientRects().length);
    let r = tg && tg.getBoundingClientRect();
    // Cible hors de l'écran (le voile empêche de faire défiler) : on l'amène à l'écran, une fois par étape.
    if (r && r.width && !scrolled && (r.top < 70 || (r.bottom > H - 90 && r.height < H * 0.6))) {
      scrolled = true;
      tg.scrollIntoView({ block: r.height > H * 0.5 ? 'start' : 'center' });
      r = tg.getBoundingClientRect();
    }
    if (r && r.width) {
      const pad = 6, x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, h = r.height + pad * 2;
      Object.assign(spot.style, { display: 'block', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      block.style.clipPath = `path(evenodd, "M0 0H${W}V${H}H0Z M${x} ${y}H${x + w}V${y + h}H${x}Z")`;
      el.classList.add('has-spot');
      // Fiche du côté où il y a le plus de place.
    } else {
      spot.style.display = 'none';
      block.style.clipPath = 'none';
      el.classList.remove('has-spot');
    }
    // Une fenêtre de l'appli est ouverte (choix d'agrès, ajout…) : elle passe devant, la fiche reste lisible au-dessus.
    const dlg = document.getElementById('modal');
    el.classList.toggle('behind', !!dlg.open);
    fit(s, r && r.width ? r : null, dlg.open ? dlg.getBoundingClientRect() : null);
  };

  // Place la fiche dans la plus grande zone libre (au-dessus ou en dessous de l'élément éclairé,
  // sans recouvrir les onglets) et limite sa hauteur à cette zone. Petits écrans : fiche compacte,
  // et si la place manque vraiment, le texte se replie derrière « Lire ».
  const fit = (s, r, dlg) => {
    const H = window.innerHeight, GAP = 10;
    const tb = document.querySelector('.tabbar');
    const tbr = tb && tb.getClientRects().length ? tb.getBoundingClientRect() : null;
    const topLim = 12, botLim = (tbr && tbr.top < H ? tbr.top : H) - 10;
    let top, avail;
    if (dlg) { top = true; avail = dlg.top - GAP - topLim; }
    else if (s.card) { top = s.card === 'top'; avail = Math.min(H * 0.5, botLim - topLim); }
    else if (r) {
      const above = r.top - GAP - topLim, below = botLim - (r.bottom + GAP);
      top = above > below; avail = Math.max(above, below);
    } else { top = false; avail = botLim - topLim; }
    card.classList.toggle('top', top);
    card.style.top = top ? `${topLim}px` : '';
    card.style.bottom = top ? '' : `${H - botLim}px`;
    avail = Math.max(96, Math.floor(avail));
    card.style.maxHeight = `${avail}px`;
    card.classList.toggle('compact', avail < 330 || window.innerWidth < 380);
    const fold = avail < 190 && !card.classList.contains('open');
    card.classList.toggle('folded', fold);
    $('.tour-more').hidden = !(fold || card.classList.contains('open'));
    $('.tour-more').textContent = card.classList.contains('open') ? 'Masquer' : 'Lire';
    // Texte plus long que la place : fondu en bas pour montrer qu'il défile.
    const tx = $('.tour-text');
    tx.classList.toggle('more', !fold && tx.scrollHeight > tx.clientHeight + 4 && tx.scrollTop + tx.clientHeight < tx.scrollHeight - 4);
  };

  const show = () => {
    const s = steps[i];
    since = Date.now(); scrolled = false;
    if (s.enter) try { s.enter(); } catch { /* ignoré */ }
    $('.tour-step').textContent = steps.length > 1 ? `${i + 1} / ${steps.length}` : '';
    $('.tour-title').textContent = s.title;
    $('.tour-text').textContent = s.text;
    el.querySelectorAll('.tour-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    $('.tour-next').hidden = !s.next;
    if (s.next) $('.tour-next').textContent = s.next;
    $('.tour-skip').hidden = steps.length < 2 || i === steps.length - 1;
    $('.tour-stepskip').hidden = true;
    card.classList.remove('open');
    place();
  };

  const leaveStep = () => { const l = steps[i].leave; if (l) try { l(); } catch { /* ignoré */ } };
  const advance = async () => {
    leaveStep();
    if (i >= steps.length - 1) { end(); return; }
    i++;
    // Étape inutile dans cette situation : on la saute.
    while (steps[i].skip && i < steps.length - 1 && await steps[i].skip()) i++;
    show();
  };

  // Vérifie régulièrement si le geste demandé a été fait, et que l'on est sur la bonne page.
  const tick = async () => {
    if (!running.has(key) || checking || paused) return;
    const s = steps[i], route = routeOf(s);
    if (!s.done && !route) return;
    checking = true;
    let ok = false;
    try { ok = s.done ? await s.done() : false; } catch { ok = false; }
    checking = false;
    if (!running.has(key)) return;
    if (ok) { advance(); return; }
    // Page quittée (hors excursion autorisée) : on y revient, et l'étape reprend.
    if (route && hash() !== route && !(s.allow && s.allow.includes(hash())) && !returning) {
      returning = true;
      location.hash = route;
      setTimeout(() => { returning = false; if (running.has(key) && s.enter) try { s.enter(); } catch { /* ignoré */ } }, 900);
    }
    // Rien ne bouge depuis un moment (caméra refusée, clip trop court…) : on propose de sauter l'étape.
    if (s.done && !s.next && Date.now() - since > 9000) $('.tour-stepskip').hidden = false;
  };
  const loop = () => { if (!running.has(key)) return; place(); raf = requestAnimationFrame(loop); };

  const end = () => {
    clearInterval(timer); cancelAnimationFrame(raf);
    window.removeEventListener('hashchange', tick);
    el.remove(); running.delete(key);
    if (flag) db.setMeta(flag, true);
    if (onEnd) onEnd();
  };
  $('.tour-skip').onclick = () => { leaveStep(); end(); };
  // Fiche repliée : « Lire » déplie le texte par-dessus l'écran le temps de le lire.
  $('.tour-more').onclick = () => { card.classList.toggle('open'); place(); };
  $('.tour-stepskip').onclick = advance;
  $('.tour-next').onclick = advance;
  window.addEventListener('hashchange', tick);
  timer = setInterval(tick, 300);
  running.set(key, { end });
  show();
  loop();
}

// ---------- Points d'entrée ----------
export async function maybeStartTour() {
  if (!['#/', '#', '#/entrainement'].includes(hash())) return;
  if (await db.getMeta('tourDone')) return;
  setTimeout(() => startTour(), 900);
}

export function startTour() {
  clipId = null;
  if (running.has('main')) running.get('main').end();
  runTour('main', MAIN, {
    flag: 'tourDone',
    onEnd: () => document.body.classList.remove('tour-sheet', 'tour-room'),
  });
}

// Relance depuis les Réglages : on revient d'abord sur l'écran d'entraînement. La présentation
// de la page Musique sera aussi remontrée à sa prochaine ouverture.
export async function replayTour() {
  await db.setMeta('tourMusicDone', false);
  await db.setMeta('tourMusicIntroDone', false);
  location.hash = '#/entrainement';
  setTimeout(() => startTour(), 900);
}

// Appelée par la page Musique à chaque affichage : présentation à la première visite.
export async function musicTour(hasMusic) {
  if (running.has('music') || running.has('musicEmpty')) return;
  if (hasMusic) {
    if (await db.getMeta('tourMusicDone')) return;
    setTimeout(() => { if (hash() === '#/musique' && exists('.mu-track')) runTour('music', MUSIC, { flag: 'tourMusicDone' }); }, 500);
  } else {
    if (await db.getMeta('tourMusicIntroDone')) return;
    // Une fois un morceau importé, la présentation de l'écran prend le relais.
    setTimeout(() => { if (hash() === '#/musique' && exists('#choose')) runTour('musicEmpty', MUSIC_EMPTY, { flag: 'tourMusicIntroDone', onEnd: () => { if (exists('.mu-track')) musicTour(true); } }); }, 500);
  }
}
