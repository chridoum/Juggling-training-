// Historique annuler / rétablir (en mémoire : il repart à zéro quand on ferme l'appli).
// Chaque action = { label, undo(), redo(), drop?() }.
const past = [], future = [];
const MAX = 30;

export function record(entry) {
  past.push(entry);
  future.length = 0;
  if (past.length > MAX) { const old = past.shift(); if (old.drop) old.drop(); }
}
export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

export async function undo() {
  const e = past.pop(); if (!e) return null;
  await e.undo(); future.push(e); return e;
}
export async function redo() {
  const e = future.pop(); if (!e) return null;
  await e.redo(); past.push(e); return e;
}
