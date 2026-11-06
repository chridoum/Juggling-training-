// Réglages : affichage, stockage, sauvegardes.
import * as db from '../db.js';
import { exportData, importData, exportVideos, importVideos, videoStats } from '../data.js';
import { setView, toast, fmtBytes } from '../ui.js';
import { applyTheme } from '../theme.js';

// ---------- Réglages ----------
export async function settings() {
  const theme = (await db.getMeta('theme')) || 'dark';
  const info = await db.storageInfo();
  const vs = await videoStats();

  const body = `
    <h3 class="section-title">Affichage</h3>
    <div class="settings-row">
      <span>Thème</span>
      <div class="seg" style="min-width:180px" id="theme">
        <button data-t="dark" aria-pressed="${theme === 'dark'}">Sombre</button>
        <button data-t="light" aria-pressed="${theme === 'light'}">Clair</button>
      </div>
    </div>

    <h3 class="section-title">Stockage</h3>
    <div class="group">
      ${info ? `
        <div class="settings-row"><span>Espace utilisé</span><b>${fmtBytes(info.usage)}</b></div>
        <div class="storage-bar"><i style="width:${Math.max(1, Math.min(100, info.usage / info.quota * 100)).toFixed(1)}%"></i></div>
        <div class="small muted">Disponible pour l'appli : ${fmtBytes(info.quota)}</div>
        <div class="small">${info.persisted ? '✅ Stockage protégé : le navigateur ne l\'effacera pas de lui-même.' : '⚠️ Stockage non protégé.'}</div>
        ${info.persisted ? '' : '<button class="btn block" id="persist">Protéger le stockage</button>'}`
      : '<span class="muted">Ce navigateur ne donne pas d\'information sur l\'espace.</span>'}
      <div class="small muted">Attention : effacer les données de Chrome pour ce site efface aussi ton classement et tes vidéos.</div>
    </div>

    <h3 class="section-title">Sauvegarde du classement</h3>
    <div class="group">
      <span class="small muted">Agrès, dossiers et classement des clips, sans les vidéos. Un petit fichier à garder sur ton ordinateur ou dans ton cloud.</span>
      <button class="btn block" id="export">Exporter une sauvegarde</button>
      <label class="btn block" for="importFile">Importer une sauvegarde</label>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </div>

    <h3 class="section-title">Sauvegarde des vidéos</h3>
    <div class="group">
      <span class="small muted">${vs.n ? `${vs.n} clip${vs.n > 1 ? 's' : ''}, environ ${fmtBytes(vs.bytes)}.` : 'Aucun clip pour l\'instant.'} Les vidéos sont rangées dans des archives .zip d'environ 250 Mo, à garder sur ton ordinateur ou dans ton cloud.</span>
      <button class="btn block" id="expVid" ${vs.n ? '' : 'disabled'}>Exporter les vidéos</button>
      <label class="btn block" for="impVid">Importer des vidéos (.zip)</label>
      <input type="file" id="impVid" accept=".zip,application/zip" multiple hidden>
      <span class="small muted" id="vidMsg"></span>
      <span class="small muted">Pour tout restaurer sur un téléphone neuf : importe d'abord la sauvegarde du classement, puis les archives de vidéos.</span>
    </div>

    <h3 class="section-title">À propos</h3>
    <div class="small muted">Juglog<br>Le logo : une cruche arrose un vieux tronc, et une pousse grandit à l'autre bout.</div>`;

  const v = setView({ title: 'Réglages', back: '#/journal', tab: 'journal', body });

  v.querySelectorAll('#theme button').forEach(b => {
    b.onclick = async () => {
      await db.setMeta('theme', b.dataset.t);
      applyTheme(b.dataset.t);
      v.querySelectorAll('#theme button').forEach(x => x.setAttribute('aria-pressed', x === b));
    };
  });

  const persist = v.querySelector('#persist');
  if (persist) persist.onclick = async () => {
    const ok = await db.askPersistence();
    toast(ok ? 'Stockage protégé' : 'Le navigateur a refusé pour l\'instant. Installe l\'appli sur l\'écran d\'accueil puis réessaie.');
    if (ok) settings();
  };

  v.querySelector('#export').onclick = async () => {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `juglog-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await db.setMeta('lastExport', Date.now());
    toast('Sauvegarde exportée');
  };

  const msg = v.querySelector('#vidMsg');
  v.querySelector('#expVid').onclick = async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const parts = await exportVideos((i, n) => { msg.textContent = `Préparation… ${i}/${n}`; });
      for (const [i, part] of parts.entries()) {
        const url = URL.createObjectURL(part.blob);
        const a = document.createElement('a'); a.href = url; a.download = part.name;
        document.body.appendChild(a); a.click(); a.remove();
        msg.textContent = `Archive ${i + 1}/${parts.length} envoyée (${part.count} clips)`;
        await new Promise(r => setTimeout(r, 1500));
        URL.revokeObjectURL(url);
      }
      await db.setMeta('lastExportVideos', Date.now());
      msg.textContent = `${parts.length} archive${parts.length > 1 ? 's' : ''} enregistrée${parts.length > 1 ? 's' : ''} dans les téléchargements.`;
    } catch (err) { console.error(err); msg.textContent = 'Échec de l\'export : ' + (err.message || err); }
    btn.disabled = false;
  };
  v.querySelector('#impVid').onchange = async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    msg.textContent = 'Import en cours…';
    try {
      const r = await importVideos(files);
      msg.textContent = `${r.restored} vidéo${r.restored > 1 ? 's' : ''} restaurée${r.restored > 1 ? 's' : ''}${r.skipped ? `, ${r.skipped} ignorée${r.skipped > 1 ? 's' : ''} (importe d'abord le classement)` : ''}.`;
    } catch (err) { msg.textContent = err.message || 'Archive illisible'; }
    e.target.value = '';
  };

  v.querySelector('#importFile').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await importData(JSON.parse(await file.text()));
      toast(`${res.agres} agrès et ${res.clips} clips importés`);
    } catch (err) {
      toast(err.message || 'Fichier illisible');
    }
    e.target.value = '';
  };
}

