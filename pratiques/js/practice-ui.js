// Outils d'affichage communs : disciplines groupées par pratique, filtre par pratique.
import { PRACTICES, OTHER, practiceOf, practiceByKey } from './catalog.js';
import { esc } from './ui.js';

const KEY = 'jp.filter';
export function getFilter() { try { return localStorage.getItem(KEY) || 'tout'; } catch { return 'tout'; } }
export function setFilter(v) { try { localStorage.setItem(KEY, v); } catch { /* ignoré */ } }

// Ordre des pratiques : les miennes d'abord (dans l'ordre du catalogue), puis les autres, puis « Autre ».
export function practiceOrder(mine = []) {
  const all = [...PRACTICES, OTHER].map(p => p.key);
  return [...all.filter(k => mine.includes(k)), ...all.filter(k => !mine.includes(k))];
}

// Groupes non vides : [{ key, name, items: [disciplines…] }], l'ordre manuel des disciplines est gardé dans chaque groupe.
export function groupAgres(agres, mine = []) {
  return practiceOrder(mine)
    .map(k => ({ key: k, name: practiceByKey(k).name, items: agres.filter(a => practiceOf(a) === k) }))
    .filter(g => g.items.length);
}

// Rangée de pastilles « Tout / Danse / Jonglerie… » (seulement s'il y a plusieurs pratiques).
export function filterBar(groups, current) {
  if (groups.length < 2) return '';
  return `<div class="pr-filter" role="group" aria-label="Filtrer par pratique">
    <button class="chip" data-pf="tout" aria-pressed="${current === 'tout'}">Tout</button>
    ${groups.map(g => `<button class="chip" data-pf="${g.key}" aria-pressed="${current === g.key}">${esc(g.name)}</button>`).join('')}
  </div>`;
}
export function bindFilter(root, rerender) {
  root.querySelectorAll('[data-pf]').forEach(b => { b.onclick = () => { setFilter(b.dataset.pf); rerender(); }; });
}

// Filtre courant, ramené à « tout » si la pratique filtrée n'a plus de discipline.
export function activeFilter(groups) {
  const f = getFilter();
  return f !== 'tout' && !groups.some(g => g.key === f) ? 'tout' : f;
}

// Liste de choix groupée (fenêtres « Ranger dans… », « Pour quelle discipline ? ») :
// les en-têtes de pratique n'apparaissent que s'il y en a plusieurs.
export function groupedPicks(agres, mine, button) {
  const groups = groupAgres(agres, mine);
  return groups.map(g => `${groups.length > 1 ? `<div class="pick-group">${esc(g.name)}</div>` : ''}${g.items.map(button).join('')}`).join('');
}

// Nouvel ordre global des disciplines après un glisser-déposer dans un groupe.
export function reorderWithinGroup(groups, key, id, targetId, where) {
  return groups.flatMap(g => {
    const ids = g.items.map(a => a.id);
    if (g.key !== key) return ids;
    const rest = ids.filter(x => x !== id);
    rest.splice(rest.indexOf(targetId) + (where === 'after' ? 1 : 0), 0, id);
    return rest;
  });
}
