export interface ZipFile { name: string; data: string | Uint8Array }

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(b: Uint8Array): number {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Store-only ZIP: toolpaths are small and every unzip tool reads it. Returns the raw bytes. */
export function makeZip(files: ZipFile[]): Uint8Array {
  const enc = new TextEncoder(), chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  const u16 = (v: number) => [v & 255, (v >>> 8) & 255], u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, c = crc32(data);
    const head = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    const local = new Uint8Array([0x50, 0x4b, 3, 4, ...head]);
    chunks.push(local, name, data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...head, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += local.length + name.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  const all = [...chunks, ...central, end], out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

/** Reads a store-only ZIP back to verify what was written: signatures, sizes and CRC. */
export function readZip(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22;
  while (e >= 0 && view.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('zip: no end record');
  const count = view.getUint16(e + 10, true);
  let p = view.getUint32(e + 16, true);
  const dec = new TextDecoder(), out: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('zip: bad central record');
    const crc = view.getUint32(p + 16, true), size = view.getUint32(p + 24, true), nameLen = view.getUint16(p + 28, true), local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('zip: bad local record');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error('zip: CRC mismatch in ' + name);
    out.push({ name, data });
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return out;
}
