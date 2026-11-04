// Métronome WebAudio à planification précise (anticipation), avec deux sorties :
//  - hp  : le haut-parleur / casque ;
//  - rec : le flux enregistré dans la vidéo (clic injecté directement, sans passer par le micro).
export class Metronome {
  constructor(ctx, recDest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.toSpeaker = true;   // toujours audible
    this.toRecording = false; // injecté dans la vidéo (mode casque)
    this.recDest = recDest;
    this.bpm = 100;
    this.beats = 4;           // temps par mesure (1 = pas d'accent)
    this.running = false;
    this.onBeat = null;       // callback visuel (n° du temps)
    this._timer = null;
    this._next = 0;
    this._n = 0;
    this._queue = [];
    this._raf = null;
    this.out.connect(ctx.destination);
  }

  setRouting({ recording }) {
    try { this.out.disconnect(this.recDest); } catch { /* pas connecté */ }
    this.toRecording = !!recording;
    if (recording && this.recDest) this.out.connect(this.recDest);
  }

  start(atTime) {
    if (this.running) return;
    this.running = true;
    this._n = 0;
    this._next = Math.max(atTime ?? 0, this.ctx.currentTime + 0.05);
    this._timer = setInterval(() => this._schedule(), 25);
    this._schedule();
    const tick = () => {
      const now = this.ctx.currentTime;
      while (this._queue.length && this._queue[0].t <= now) {
        const b = this._queue.shift();
        if (this.onBeat) this.onBeat(b.n, b.accent);
      }
      if (this.running) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  // Délai (ms) avant le prochain clic audible, pour situer le début d'un clip dans le rythme.
  msToNextBeat() {
    const t = this._queue.length ? this._queue[0].t : this._next;
    return Math.max(0, (t - this.ctx.currentTime) * 1000);
  }

  stop() {
    this.running = false;
    clearInterval(this._timer);
    cancelAnimationFrame(this._raf);
    this._queue = [];
  }

  _schedule() {
    const ahead = this.ctx.currentTime + 0.12;
    while (this._next < ahead) {
      const accent = this.beats > 1 && this._n % this.beats === 0;
      this._click(this._next, accent);
      this._queue.push({ t: this._next, n: this._n, accent });
      this._next += 60 / this.bpm;
      this._n++;
    }
  }

  _click(t, accent) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.6, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.06);
  }
}

// Tap tempo : moyenne des derniers intervalles, remise à zéro après 2 s d'inactivité.
export function makeTapper() {
  let taps = [];
  return () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    taps = taps.slice(-6);
    if (taps.length < 2) return null;
    const gaps = taps.slice(1).map((t, i) => t - taps[i]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    return Math.round(60000 / avg);
  };
}
