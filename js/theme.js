// Thème sombre par défaut, clair en option.
export function applyTheme(t) {
  const theme = t === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#fafaf8' : '#0c0c0d';
  try { localStorage.setItem('theme', theme); } catch { /* stockage indisponible : pas grave */ }
}
