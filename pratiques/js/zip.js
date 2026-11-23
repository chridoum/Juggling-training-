// Mini-archive ZIP sans compression (les vidéos sont déjà compressées).
// Les données restent des Blob : rien n'est copié en mémoire, sauf pour calculer la somme de contrôle.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

async function crc32(blob) {
  let c = 0xffffffff;
  const reader = blob.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (let i = 0; i < value.length; i++) c = TABLE[(c ^ value[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const u16 = n => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
const enc = s => new TextEncoder().encode(s);

// files : [{ name, blob }] → Blob (.zip)
export async function buildZip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc(f.name), size = f.blob.size, crc = await crc32(f.blob);
    const local = [u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(size), u32(size), u16(name.length), u16(0), name];
    parts.push(...local, f.blob);
    central.push([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    offset += 30 + name.length + size;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) { parts.push(...c); cdSize += c.reduce((a, x) => a + x.length, 0); }
  parts.push(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(cdStart), u16(0));
  return new Blob(parts, { type: 'application/zip' });
}

// Lit une archive créée par buildZip (méthode « stockée ») → [{ name, blob }]
export async function readZip(file) {
  const tailLen = Math.min(file.size, 65557);
  const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Archive illisible');
  const count = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true);
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const out = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('Archive illisible');
    const method = cd.getUint16(p + 10, true), size = cd.getUint32(p + 24, true);
    const nl = cd.getUint16(p + 28, true), el = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), off = cd.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(cd.buffer, p + 46, nl));
    p += 46 + nl + el + cl;
    if (method !== 0) throw new Error('Archive compressée : seules les archives Juglog sont lues');
    const lh = new DataView(await file.slice(off, off + 30).arrayBuffer());
    const start = off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    out.push({ name, blob: file.slice(start, start + size) });
  }
  return out;
}
