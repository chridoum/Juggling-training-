// Pratiques et disciplines proposées à la création, avec leurs dossiers de départ (modifiables ensuite).
// Les noms sont en français ; la traduction se fait à l'affichage (i18n) et à la création.
export const PRACTICES = [
  { key: 'jonglerie', name: 'Jonglerie et manipulation', items: [
    ['balles', 'Balles'], ['anneaux', 'Anneaux'], ['massues', 'Massues'], ['poi', 'Poi'], ['staff', 'Staff'],
    ['double-staff', 'Double staff'], ['buugeng', 'Buugeng'], ['contact-staff', 'Contact staff'], ['contact-ball', 'Contact ball'],
    ['diabolo', 'Diabolo'], ['baton-du-diable', 'Bâton du diable'], ['boites', 'Boîtes à cigares'], ['hoop', 'Hoop'] ] },
  { key: 'danse', name: 'Danse', items: [
    ['hip-hop', 'Hip-hop'], ['breakdance', 'Breakdance'], ['house', 'House'], ['popping', 'Popping'], ['locking', 'Locking'],
    ['contemporain', 'Contemporain'], ['classique', 'Classique'], ['jazz', 'Jazz'], ['salsa', 'Salsa'], ['bachata', 'Bachata'],
    ['kizomba', 'Kizomba'], ['tango', 'Tango'], ['lindy-hop', 'Lindy hop'] ] },
  { key: 'cirque', name: 'Cirque aérien et acrobatie', items: [
    ['tissu', 'Tissu aérien'], ['trapeze', 'Trapèze'], ['cerceau-aerien', 'Cerceau aérien'], ['corde-lisse', 'Corde lisse'],
    ['sangles', 'Sangles'], ['mat-chinois', 'Mât chinois'], ['acro-sol', 'Acrobatie au sol'], ['equilibres', 'Équilibres'],
    ['main-a-main', 'Main à main'], ['trampoline', 'Trampoline'], ['fil', 'Fil'] ] },
  // hidden : pratique mise de côté pour l'instant (absente du choix et des propositions,
  // mais une discipline déjà créée garde son groupe).
  { key: 'musique', name: 'Musique', hidden: true, items: [
    ['batterie', 'Batterie'], ['percussions', 'Percussions'], ['guitare', 'Guitare'], ['basse', 'Basse'], ['piano', 'Piano'],
    ['violon', 'Violon'], ['ukulele', 'Ukulélé'], ['beatbox', 'Beatbox'] ] },
  { key: 'martial', name: 'Arts martiaux', hidden: true, items: [
    ['karate', 'Karaté'], ['kung-fu', 'Kung-fu'], ['tai-chi', 'Taï-chi'], ['capoeira', 'Capoeira'], ['judo', 'Judo'],
    ['boxe', 'Boxe'], ['aikido', 'Aïkido'], ['taekwondo', 'Taekwondo'] ] },
  { key: 'magie', name: 'Magie', items: [
    ['cartes', 'Cartes'], ['cardistry', 'Cardistry'], ['pieces', 'Pièces'], ['close-up', 'Close-up'], ['manip-scene', 'Manipulation scénique'] ] },
  { key: 'glisse', name: 'Glisse et sports urbains', hidden: true, items: [
    ['skate', 'Skateboard'], ['trottinette', 'Trottinette'], ['bmx', 'BMX'], ['roller', 'Roller'], ['parkour', 'Parkour'],
    ['slackline', 'Slackline'], ['freestyle-foot', 'Freestyle football'], ['corde-a-sauter', 'Corde à sauter'] ] },
].map(p => ({ ...p, items: p.items.map(([key, name]) => ({ key, name, practice: p.key })) }));

// Pratique « Autre » : pour les disciplines créées à la main hors catalogue.
export const OTHER = { key: 'autre', name: 'Autre', items: [] };

export const CATALOG = PRACTICES.flatMap(p => p.items);
// Pratiques proposées (écran de choix, fenêtre « Nouvelle discipline »).
export const VISIBLE = PRACTICES.filter(p => !p.hidden);

export const CATEGORIES = {
  balles: ['3 balles', '4 balles', '5 balles'],
  anneaux: ['3 anneaux', '4 anneaux', '5 anneaux'],
  massues: ['3 massues', '4 massues', '5 massues'],
  poi: ['1 poi', '2 poi', '3 poi'],
};

export const practiceByKey = k => PRACTICES.find(p => p.key === k) || OTHER;
// Pratique d'une discipline (les disciplines créées avant les pratiques sont rattachées par leur clé de catalogue).
export function practiceOf(a) {
  if (a.practice) return a.practice;
  const c = CATALOG.find(x => x.key === a.catalogKey);
  return c ? c.practice : 'autre';
}
