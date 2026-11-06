// Ressources : des liens pour apprendre, agrès par agrès.
import { CATALOG } from '../catalog.js';
import { setView, esc, ICON } from '../ui.js';

// Liens vérifiés qui complètent les sources générales du catalogue.
const EXTRA = {
  massues: [{ title: 'Circomedia, figures de massues', url: 'https://circomedia.com/juggling-club-tricks' }],
  'contact-ball': [{ title: 'Contact Juggling Wiki, tutoriels 1 balle', url: 'https://contactjuggling.org/wiki/index.php/1_ball_tutorials' }],
  diabolo: [
    { title: 'Diabolo Tutorials', url: 'https://diabolotutorials.com/' },
    { title: 'Netjuggler, tutoriels de diabolo', url: 'https://www.netjuggler.net/En/juggletubeCat/diabolo-tutorials.html' },
  ],
  'baton-du-diable': [{ title: 'Devilstick.org, vidéos', url: 'https://devilstick.org/ds_videos.html' }],
  boites: [
    { title: 'Circomedia, boîtes à cigares (1)', url: 'https://circomedia.com/cigar-boxes-1' },
    { title: 'Circomedia, boîtes à cigares (2)', url: 'https://circomedia.com/juggling-cigar-boxes-2' },
  ],
  hoop: [{ title: 'Infinite Circles, hooping', url: 'https://infinitecircles.org/?p=1838' }],
};

const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const link = l => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><span>${esc(l.title)}<small>${esc(host(l.url))}</small></span>${ICON.ext}</a>`;

export function resources() {
  const items = CATALOG.map(c => {
    const seen = new Set();
    const general = [...(c.sources || []), ...(EXTRA[c.key] || [])].filter(l => !seen.has(l.url) && seen.add(l.url));
    const yt = { title: 'Tutoriels sur YouTube', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(c.name + ' tutoriel')}` };
    const figs = (c.figures || []).filter(f => f.link && !seen.has(f.link.url)).map(f => ({ title: f.name, url: f.link.url }));
    return `<details class="res"><summary><span>${esc(c.name)}</span>${ICON.chev}</summary>
      <div class="res-links">${[...general, yt].map(link).join('')}</div>
      ${figs.length ? `<div class="res-sub">Figures</div><div class="res-links">${figs.map(link).join('')}</div>` : ''}
    </details>`;
  }).join('');
  setView({
    title: 'Ressources', tab: 'resources', body: `<div class="list" style="border-bottom:1px solid var(--line)">${items}</div>`,
    actions: [{ label: 'Réglages', icon: ICON.gear, onClick: () => { location.hash = '#/reglages'; } }],
  });
}
