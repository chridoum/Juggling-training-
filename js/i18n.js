// Langue de l'appli. Le français est la langue source : chaque texte affiché est traduit à la volée
// quand l'appli tourne dans une autre langue (pour l'instant : l'anglais, pour tout téléphone qui
// n'est pas réglé en français). Pour ajouter une langue : un dictionnaire de plus, sur le modèle d'EN.
import { EN, EN_PATTERNS } from './i18n-en.js';

const KEY = 'juglog.lang';
export function langChoice() { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } }
export function setLangChoice(v) { try { localStorage.setItem(KEY, v); } catch { /* ignoré */ } }

function detect() {
  const c = langChoice();
  if (c === 'fr' || c === 'en') return c;
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'fr'];
  return String(langs[0] || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const LANG = detect();
export const LOCALE = LANG === 'fr' ? 'fr-FR' : 'en-GB';

const norm = s => s.replace(/\s+/g, ' ').trim();

// Traduit un texte français (entier). Renvoie le texte tel quel s'il n'y a rien à traduire.
export function t(s) {
  if (LANG === 'fr' || s == null) return s;
  const has = x => Object.prototype.hasOwnProperty.call(EN, x);
  const raw = String(s).trim();
  if (has(raw)) return EN[raw];          // texte sur plusieurs lignes, retours à la ligne gardés
  const k = norm(raw);
  if (!k || !/[A-Za-zÀ-ÿ]/.test(k)) return s;
  if (has(k)) return EN[k];
  for (const [re, fn] of EN_PATTERNS) {
    const m = k.match(re);
    if (m) return fn(m, t);
  }
  return s;
}

// ---------- Traduction de l'interface affichée ----------
const ATTRS = ['aria-label', 'placeholder', 'title'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);

function trTextNode(n) {
  const raw = n.nodeValue;
  const k = raw.trim();
  if (!k) return;
  const p = n.parentElement;
  if (p && (SKIP.has(p.tagName) || p.closest('[data-no-i18n]'))) return;
  // data-en="…" sur l'élément : traduction choisie pour cet endroit précis (mot à plusieurs sens).
  const r = p && p.dataset.en && LANG === 'en' ? p.dataset.en : t(k);
  if (r !== k) n.nodeValue = raw.replace(k, r);
}
function trAttrs(el) {
  if (el.closest('[data-no-i18n]')) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) { const r = t(v); if (r !== v) el.setAttribute(a, r); }
  }
}
function walk(root) {
  if (root.nodeType === 3) return trTextNode(root);
  if (root.nodeType !== 1) return;
  trAttrs(root);
  if (SKIP.has(root.tagName)) return;
  root.querySelectorAll('[aria-label],[placeholder],[title]').forEach(trAttrs);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) trTextNode(n);
}

export function startTranslation() {
  document.documentElement.lang = LANG;
  if (LANG === 'fr') return;
  walk(document.body);
  new MutationObserver(list => {
    for (const mu of list) {
      if (mu.type === 'characterData') trTextNode(mu.target);
      else if (mu.type === 'attributes') trAttrs(mu.target);
      else mu.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
