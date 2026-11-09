// Outils sur les fichiers vidéo : informations d'un fichier, vignette à un instant donné.
// (Plus de découpe par ré-enregistrement : un segment lit simplement un passage de la vidéo d'origine.)
const once = (el, ev) => new Promise(res => el.addEventListener(ev, res, { once: true }));

// Vignette d'une vidéo à l'instant t ; null si le navigateur n'y arrive pas.
export async function frameThumb(url, t) {
  const v = document.createElement('video');
  v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto';
  const limit = ms => new Promise(res => setTimeout(res, ms));
  try {
    await Promise.race([once(v, 'loadedmetadata'), once(v, 'error'), limit(5000)]);
    v.currentTime = Math.max(0, t);
    await Promise.race([once(v, 'seeked'), once(v, 'error'), limit(3000)]);
    if (!v.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = 240; c.height = Math.round(240 * v.videoHeight / v.videoWidth);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch { return null; } finally { v.removeAttribute('src'); v.load(); }
}

// Durée et vignette d'un fichier vidéo choisi par l'utilisateur.
// Ne lève jamais : si le navigateur ne sait pas lire le fichier, on renvoie ce qu'on a.
export async function probeVideo(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto';
  const limit = ms => new Promise(res => setTimeout(res, ms));
  // Un fichier que le navigateur ne sait pas lire déclenche « error » : on n'attend pas pour rien.
  const bad = once(v, 'error').then(() => 'ko');
  let duration = 0, thumb = null, width = 0;
  try {
    if (await Promise.race([once(v, 'loadedmetadata').then(() => 'ok'), bad, limit(6000)]) === 'ko') throw new Error('format non lu');
    duration = isFinite(v.duration) ? v.duration : 0;
    if (!duration && v.duration === Infinity) { // WebM sans durée écrite
      v.currentTime = 1e101;
      await Promise.race([once(v, 'timeupdate'), bad, limit(3000)]);
      duration = isFinite(v.duration) ? v.duration : 0;
    }
    width = v.videoWidth || 0;
    v.currentTime = Math.min(1, (duration || 3) / 3);
    await Promise.race([once(v, 'seeked'), bad, limit(3000)]);
    if (v.videoWidth) {
      const c = document.createElement('canvas');
      c.width = 240; c.height = Math.round(240 * v.videoHeight / v.videoWidth);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      thumb = c.toDataURL('image/jpeg', 0.7);
    }
  } catch (err) { console.warn('Lecture du fichier impossible', err); }
  v.removeAttribute('src'); v.load();
  URL.revokeObjectURL(url);
  return { duration: Math.round(duration * 10) / 10, thumb, width };
}
