// Outils sur les fichiers vidéo : lecture des informations d'un fichier, découpe d'un passage.
// Le passage est relu puis ré-enregistré : cela prend donc la durée du passage (pas de bibliothèque externe).
const MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

const once = (el, ev) => new Promise(res => el.addEventListener(ev, res, { once: true }));

export async function cutClip(url, start, end, onProgress = () => {}) {
  if (!window.MediaRecorder) throw new Error('Découpe non disponible sur ce navigateur');
  const v = document.createElement('video');
  v.src = url; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
  if (v.readyState < 1) await once(v, 'loadedmetadata');
  v.currentTime = start; await once(v, 'seeked');
  if (!v.captureStream) throw new Error('Découpe non disponible sur ce navigateur');

  // Le son passe par WebAudio vers l'enregistreur seulement : rien ne sort du haut-parleur.
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const dest = ctx.createMediaStreamDestination();
  ctx.createMediaElementSource(v).connect(dest);
  await ctx.resume();

  let thumb = null;
  try {
    const c = document.createElement('canvas');
    c.width = 240; c.height = Math.round(240 * (v.videoHeight || 9) / (v.videoWidth || 16));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    thumb = c.toDataURL('image/jpeg', 0.7);
  } catch { /* vignette facultative */ }

  const vt = v.captureStream().getVideoTracks();
  const stream = new MediaStream([...vt, ...dest.stream.getAudioTracks()]);
  const mime = MIMES.find(m => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = once(rec, 'stop');

  rec.start(1000);
  const t0 = performance.now();
  await v.play();
  await new Promise(res => {
    const iv = setInterval(() => {
      onProgress(Math.min(1, (v.currentTime - start) / (end - start)));
      if (v.currentTime >= end || v.ended) { clearInterval(iv); res(); }
    }, 40);
  });
  v.pause();
  if (rec.state !== 'inactive') rec.stop();
  await stopped;
  const duration = Math.round(((performance.now() - t0) / 1000) * 10) / 10;
  v.removeAttribute('src'); v.load();
  try { await ctx.close(); } catch { /* ignoré */ }

  const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
  return { blob: new Blob(chunks, { type }), mime: type, duration, thumb };
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
