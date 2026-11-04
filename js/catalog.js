// Catalogue de départ des agrès traditionnels.
// Volontairement court : des figures de base, à compléter, modifier ou supprimer.
// Les siteswaps ne sont indiqués que pour la jonglerie de lancer, et seulement quand ils sont sûrs.
// Aucun lien tutoriel n'est copié par figure : la fiche propose une recherche,
// et chaque agrès garde quelques sources générales.

export const FAMILIES = {
  lancer: 'Jonglerie de lancer',
  rotation: 'Rotation',
  manipulation: 'Manipulation fine',
  autres: 'Autres agrès',
  perso: 'Agrès perso',
};

const LOJ = { title: 'Library of Juggling', url: 'https://libraryofjuggling.com/' };
const POI_DB = { title: 'Poi Tricks Database', url: 'https://poitricks.notion.site/Poi-Tricks-Database-308c01cf588d428cb2ea2f2d33a6f251' };
const HOP = { title: 'Home of Poi', url: 'https://www.homeofpoi.com/' };
const DREX = { title: 'Drexfactor', url: 'https://drexfactor.com/' };

export const CATALOG = [
  {
    key: 'balles', name: 'Balles', icon: '🟠', family: 'lancer',
    tags: ['cascade', 'fontaine', 'douche', 'croisés', 'synchrone'],
    sources: [LOJ],
    figures: [
      { name: 'Cascade 3 balles', aliases: ['3 ball cascade'], siteswap: '3', level: 1, tags: ['cascade'] },
      { name: 'Cascade inversée', aliases: ['Reverse cascade'], siteswap: '3', level: 2, tags: ['cascade'], prereq: ['Cascade 3 balles'] },
      { name: 'Tennis', aliases: ['Tennis'], siteswap: '3', level: 2, tags: ['cascade'], prereq: ['Cascade 3 balles'] },
      { name: 'Demi-douche', aliases: ['Half shower'], siteswap: '3', level: 2, tags: ['douche'], prereq: ['Cascade 3 balles'] },
      { name: 'Douche 3 balles', aliases: ['3 ball shower'], siteswap: '51', level: 3, tags: ['douche'], prereq: ['Cascade 3 balles'] },
      { name: '441', aliases: [], siteswap: '441', level: 3, tags: ['croisés'], prereq: ['Cascade 3 balles'] },
      { name: '531', aliases: [], siteswap: '531', level: 3, tags: [], prereq: ['441'] },
      { name: '423', aliases: [], siteswap: '423', level: 2, tags: [], prereq: ['Cascade 3 balles'] },
      { name: 'Box', aliases: ['Boîte'], siteswap: '(4,2x)(2x,4)', level: 3, tags: ['synchrone'], prereq: ['Cascade 3 balles'] },
      { name: "Moulin (Mills' Mess)", aliases: ["Mills' Mess"], siteswap: '3', level: 3, tags: ['croisés'], prereq: ['Cascade inversée'] },
      { name: "Burke's Barrage", aliases: [], siteswap: '3', level: 4, tags: ['croisés'], prereq: ["Moulin (Mills' Mess)"] },
      { name: "Rubenstein's Revenge", aliases: [], siteswap: '3', level: 4, tags: ['croisés'], prereq: ["Moulin (Mills' Mess)"] },
      { name: 'Fontaine 4 balles', aliases: ['4 ball fountain'], siteswap: '4', level: 3, tags: ['fontaine'], prereq: ['Cascade 3 balles'] },
      { name: 'Fontaine 4 synchrone', aliases: ['4 ball sync fountain'], siteswap: '(4,4)', level: 3, tags: ['fontaine', 'synchrone'], prereq: ['Fontaine 4 balles'] },
      { name: 'Cascade 5 balles', aliases: ['5 ball cascade'], siteswap: '5', level: 5, tags: ['cascade'], prereq: ['Fontaine 4 balles'] },
    ],
  },
  {
    key: 'anneaux', name: 'Anneaux', icon: '⭕', family: 'lancer',
    tags: ['cascade', 'fontaine', 'pancake', 'tirés'],
    sources: [LOJ],
    figures: [
      { name: 'Cascade 3 anneaux', aliases: ['3 ring cascade'], siteswap: '3', level: 1, tags: ['cascade'] },
      { name: 'Pancakes', aliases: ['Pancake'], siteswap: '3', level: 3, tags: ['pancake'], prereq: ['Cascade 3 anneaux'] },
      { name: 'Pull-downs', aliases: ['Tirés'], siteswap: '3', level: 3, tags: ['tirés'], prereq: ['Cascade 3 anneaux'] },
      { name: 'Douche 3 anneaux', aliases: ['3 ring shower'], siteswap: '51', level: 3, tags: [], prereq: ['Cascade 3 anneaux'] },
      { name: 'Fontaine 4 anneaux', aliases: ['4 ring fountain'], siteswap: '4', level: 3, tags: ['fontaine'], prereq: ['Cascade 3 anneaux'] },
      { name: 'Cascade 5 anneaux', aliases: ['5 ring cascade'], siteswap: '5', level: 5, tags: ['cascade'], prereq: ['Fontaine 4 anneaux'] },
    ],
  },
  {
    key: 'massues', name: 'Massues', icon: '🎳', family: 'lancer',
    tags: ['cascade', 'rotations', 'sous la jambe', 'dos'],
    sources: [LOJ],
    figures: [
      { name: 'Cascade 3 massues (simples)', aliases: ['3 club cascade'], siteswap: '3', level: 1, tags: ['cascade'] },
      { name: 'Doubles', aliases: ['Double spins'], siteswap: '3', level: 2, tags: ['rotations'], prereq: ['Cascade 3 massues (simples)'] },
      { name: 'Triples', aliases: ['Triple spins'], siteswap: '3', level: 3, tags: ['rotations'], prereq: ['Doubles'] },
      { name: 'Flats', aliases: ['Lancers à plat'], siteswap: '3', level: 3, tags: ['rotations'], prereq: ['Cascade 3 massues (simples)'] },
      { name: 'Sous la jambe', aliases: ['Under the leg'], siteswap: '3', level: 2, tags: ['sous la jambe'], prereq: ['Cascade 3 massues (simples)'] },
      { name: 'Back-cross', aliases: ['Derrière le dos'], siteswap: '3', level: 3, tags: ['dos'], prereq: ['Doubles'] },
      { name: 'Chops', aliases: [], siteswap: '3', level: 3, tags: [], prereq: ['Cascade 3 massues (simples)'] },
      { name: 'Douche 3 massues', aliases: ['3 club shower'], siteswap: '51', level: 3, tags: ['rotations'], prereq: ['Doubles'] },
      { name: '441 massues', aliases: [], siteswap: '441', level: 3, tags: [], prereq: ['Doubles'] },
      { name: 'Fontaine 4 massues', aliases: ['4 club fountain'], siteswap: '4', level: 4, tags: ['rotations'], prereq: ['Doubles'] },
    ],
  },
  {
    key: 'poi', name: 'Poi', icon: '☄️', family: 'rotation',
    tags: ['weave', 'fleur', 'antispin', 'isolation', 'wrap', 'stall'],
    sources: [POI_DB, HOP, DREX],
    figures: [
      { name: 'Rotations de base (temps, plans)', aliases: ['Same time / split time'], level: 1, tags: [] },
      { name: 'Moulin', aliases: ['Windmill'], level: 1, tags: [] },
      { name: 'Weave 3 temps', aliases: ['3-beat weave'], level: 1, tags: ['weave'], prereq: ['Rotations de base (temps, plans)'] },
      { name: 'Weave 2 temps', aliases: ['2-beat weave'], level: 2, tags: ['weave'], prereq: ['Weave 3 temps'] },
      { name: 'Papillon', aliases: ['Butterfly'], level: 2, tags: [], prereq: ['Rotations de base (temps, plans)'] },
      { name: 'Fontaine', aliases: ['Fountain'], level: 2, tags: [], prereq: ['Rotations de base (temps, plans)'] },
      { name: 'Reels', aliases: ['Hip reels', 'Shoulder reels'], level: 2, tags: [], prereq: ['Rotations de base (temps, plans)'] },
      { name: 'Weave dans le dos', aliases: ['Behind-the-back weave'], level: 3, tags: ['weave'], prereq: ['Weave 3 temps'] },
      { name: 'Fleur inspin 4 pétales', aliases: ['Inspin flower'], level: 2, tags: ['fleur'], prereq: ['Rotations de base (temps, plans)'] },
      { name: 'Fleur antispin 4 pétales', aliases: ['Antispin flower'], level: 3, tags: ['fleur', 'antispin'], prereq: ['Fleur inspin 4 pétales'] },
      { name: 'Extension', aliases: ['Extension'], level: 2, tags: [], prereq: ['Rotations de base (temps, plans)'] },
      { name: 'Isolation', aliases: ['Isolation'], level: 3, tags: ['isolation'], prereq: ['Extension'] },
      { name: 'Stall', aliases: [], level: 3, tags: ['stall'], prereq: ['Rotations de base (temps, plans)'] },
      { name: 'Wrap', aliases: [], level: 3, tags: ['wrap'], prereq: ['Rotations de base (temps, plans)'] },
      { name: 'Buzzsaw', aliases: [], level: 2, tags: [], prereq: ['Rotations de base (temps, plans)'] },
      { name: 'Thread the needle', aliases: [], level: 3, tags: [], prereq: ['Papillon'] },
    ],
  },
  {
    key: 'staff', name: 'Staff', icon: '🥢', family: 'rotation',
    tags: ['rotation', 'contact', 'lancer', 'isolation'],
    sources: [HOP, DREX],
    figures: [
      { name: 'Hélice devant soi', aliases: ['Front propeller'], level: 1, tags: ['rotation'] },
      { name: 'Huit', aliases: ['Figure 8'], level: 1, tags: ['rotation'], prereq: ['Hélice devant soi'] },
      { name: 'Passage de main', aliases: ['Hand pass'], level: 1, tags: ['rotation'], prereq: ['Hélice devant soi'] },
      { name: 'Halo', aliases: [], level: 2, tags: ['rotation'], prereq: ['Hélice devant soi'] },
      { name: 'Papillon', aliases: ['Butterfly'], level: 2, tags: ['rotation'], prereq: ['Huit'] },
      { name: 'Fishtail', aliases: [], level: 2, tags: ['rotation'], prereq: ['Hélice devant soi'] },
      { name: 'Isolation', aliases: [], level: 3, tags: ['isolation'], prereq: ['Hélice devant soi'] },
      { name: 'Lancer simple', aliases: ['Toss'], level: 2, tags: ['lancer'], prereq: ['Hélice devant soi'] },
      { name: 'Body wrap', aliases: [], level: 3, tags: ['contact'], prereq: ['Passage de main'] },
    ],
  },
  {
    key: 'double-staff', name: 'Double staff', icon: '⚔️', family: 'rotation',
    tags: ['rotation', 'lancer', 'isolation'],
    sources: [HOP, DREX],
    figures: [
      { name: 'Moulin', aliases: ['Windmill'], level: 1, tags: ['rotation'] },
      { name: 'Papillon', aliases: ['Butterfly'], level: 2, tags: ['rotation'], prereq: ['Moulin'] },
      { name: 'Weave 3 temps', aliases: ['3-beat weave'], level: 2, tags: ['rotation'], prereq: ['Moulin'] },
      { name: 'Fontaine', aliases: ['Fountain'], level: 2, tags: ['rotation'], prereq: ['Moulin'] },
      { name: 'Chasing', aliases: [], level: 3, tags: ['rotation'], prereq: ['Papillon'] },
      { name: 'Isolation', aliases: [], level: 3, tags: ['isolation'], prereq: ['Moulin'] },
      { name: 'Lancer', aliases: ['Toss'], level: 3, tags: ['lancer'], prereq: ['Moulin'] },
    ],
  },
  {
    key: 'buugeng', name: 'Buugeng', icon: '🌀', family: 'manipulation',
    tags: ['rotation', 'illusion', 'isolation'],
    sources: [{ title: 'Home of Poi, leçons de buugeng', url: 'https://www.homeofpoi.com/en/lessons_all/teach/S-Staff-Buugeng/Buugeng-Basics/IX-|-Physical-Awareness' }],
    figures: [
      { name: 'Rotation au doigt', aliases: ['Finger spin'], level: 1, tags: ['rotation'] },
      { name: 'Rotation main', aliases: ['Hand spin'], level: 1, tags: ['rotation'] },
      { name: 'Illusion de base', aliases: ['Basic illusion'], level: 2, tags: ['illusion'], prereq: ['Rotation main'] },
      { name: 'Isolation', aliases: [], level: 3, tags: ['isolation'], prereq: ['Rotation main'] },
      { name: 'Papillon', aliases: ['Butterfly'], level: 3, tags: ['rotation'], prereq: ['Rotation main'] },
    ],
  },
  {
    key: 'contact-staff', name: 'Contact staff', icon: '🪄', family: 'manipulation',
    tags: ['roulé', 'cou', 'épaules'],
    sources: [HOP],
    figures: [
      { name: 'Roulé sur les mains', aliases: ['Turn'], level: 1, tags: ['roulé'] },
      { name: 'Fishtail', aliases: [], level: 2, tags: [] },
      { name: 'Roulé épaules', aliases: ['Shoulder roll'], level: 2, tags: ['épaules'], prereq: ['Roulé sur les mains'] },
      { name: 'Roulé du cou', aliases: ['Neck roll'], level: 3, tags: ['cou'], prereq: ['Roulé épaules'] },
      { name: 'Roulé dans le dos', aliases: ['Back roll'], level: 3, tags: ['roulé'], prereq: ['Roulé épaules'] },
    ],
  },
  {
    key: 'contact-ball', name: 'Contact ball', icon: '🔮', family: 'manipulation',
    tags: ['palm spin', 'roulé', 'isolation'],
    sources: [],
    figures: [
      { name: 'Palm spin', aliases: ['Rotation dans la paume'], level: 1, tags: ['palm spin'] },
      { name: 'Papillon', aliases: ['Butterfly'], level: 2, tags: [] },
      { name: 'Isolation', aliases: [], level: 2, tags: ['isolation'] },
      { name: 'Roulé de bras', aliases: ['Arm roll'], level: 2, tags: ['roulé'] },
      { name: 'Roulé de poitrine', aliases: ['Chest roll'], level: 3, tags: ['roulé'], prereq: ['Roulé de bras'] },
    ],
  },
  {
    key: 'diabolo', name: 'Diabolo', icon: '⏳', family: 'autres',
    tags: ['lancer', 'enroulé', 'élan'],
    sources: [],
    figures: [
      { name: 'Démarrage et accélération', aliases: ['Whipping'], level: 1, tags: ['élan'] },
      { name: 'Lancer-rattraper', aliases: ['Toss'], level: 1, tags: ['lancer'], prereq: ['Démarrage et accélération'] },
      { name: 'Soleil', aliases: ['Around the world'], level: 2, tags: [], prereq: ['Démarrage et accélération'] },
      { name: 'Ascenseur', aliases: ['Elevator'], level: 2, tags: ['enroulé'], prereq: ['Démarrage et accélération'] },
      { name: 'Trapèze', aliases: ['Trapeze'], level: 2, tags: [], prereq: ['Lancer-rattraper'] },
    ],
  },
  {
    key: 'baton-du-diable', name: 'Bâton du diable', icon: '🥁', family: 'autres',
    tags: ['base', 'rotation'],
    sources: [],
    figures: [
      { name: 'Tic-tac', aliases: ['Idling'], level: 1, tags: ['base'] },
      { name: 'Hélice', aliases: ['Propeller'], level: 2, tags: ['rotation'], prereq: ['Tic-tac'] },
      { name: 'Flip', aliases: [], level: 2, tags: ['rotation'], prereq: ['Tic-tac'] },
      { name: 'Hélicoptère', aliases: ['Helicopter'], level: 3, tags: ['rotation'], prereq: ['Hélice'] },
    ],
  },
  {
    key: 'boites', name: 'Boîtes à cigares', icon: '📦', family: 'autres',
    tags: ['base', 'rotation'],
    sources: [],
    figures: [
      { name: 'Tenue de base', aliases: ['Home position'], level: 1, tags: ['base'] },
      { name: 'Échange des bouts', aliases: ['End swap'], level: 2, tags: [], prereq: ['Tenue de base'] },
      { name: 'Demi-tour', aliases: ['Turn'], level: 2, tags: ['rotation'], prereq: ['Tenue de base'] },
    ],
  },
  {
    key: 'hoop', name: 'Hoop', icon: '💫', family: 'autres',
    tags: ['corps', 'mains', 'isolation'],
    sources: [],
    figures: [
      { name: 'Hooping taille', aliases: ['Waist hooping'], level: 1, tags: ['corps'] },
      { name: 'Rotation à la main', aliases: ['Off-body spin'], level: 1, tags: ['mains'] },
      { name: 'Isolation', aliases: [], level: 2, tags: ['isolation'], prereq: ['Rotation à la main'] },
      { name: 'Escalator', aliases: [], level: 2, tags: ['mains'], prereq: ['Rotation à la main'] },
      { name: 'Vortex', aliases: [], level: 3, tags: ['mains'], prereq: ['Rotation à la main'] },
    ],
  },
];

// Icônes proposées pour les agrès perso
export const ICONS = ['✨', '🔥', '🪐', '🌙', '⭐', '🎯', '🧿', '🪀', '🎐', '🧶', '🔱', '🗝️', '🪁', '💎', '🌊', '🍃', '⚙️', '🎭'];

export const STATUSES = [
  { key: 'decouvrir', label: 'À découvrir' },
  { key: 'en-cours', label: 'En cours' },
  { key: 'acquise', label: 'Acquise' },
  { key: 'spectacle', label: 'En spectacle' },
];

export function statusLabel(key) {
  return (STATUSES.find(s => s.key === key) || STATUSES[0]).label;
}
