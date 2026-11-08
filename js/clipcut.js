// Découpe un passage d'une vidéo en un nouveau clip.
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
