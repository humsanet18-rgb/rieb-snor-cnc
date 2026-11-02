export interface PdfPage { jpeg: Uint8Array; pixelW: number; pixelH: number }

const PRODUCER = 'រៀបអក្សរ CNC';

/** A PDF text string in UTF-16BE with a byte-order mark, the form readers expect for non-Latin text. */
export function utf16Hex(s: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return `<${hex}>`;
}

/**
 * Minimal PDF writer: one full-page JPEG per A4 page. The pages are drawn by the browser,
 * which is what shapes Khmer script correctly; embedding fonts here would need a shaping engine.
 */
export function writePdf(pages: PdfPage[], title: string): Uint8Array {
  const W = 595.28, H = 841.89;
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const put = (d: string | Uint8Array) => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); pos += b.length; };
  const obj = (n: number, body: string) => { offsets[n] = pos; put(`${n} 0 obj\n${body}\nendobj\n`); };
  const ascii = title.replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '').trim() || 'Report';
  put('%PDF-1.4\n');
  const pageId = (i: number) => 4 + i * 3;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`);
  obj(3, `<< /Title (${ascii}) /Producer ${utf16Hex(PRODUCER)} >>`);
  pages.forEach((p, i) => {
    const page = pageId(i), content = page + 1, image = page + 2;
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`);
    const draw = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(content, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    offsets[image] = pos;
    put(`${image} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.pixelW} /Height ${p.pixelH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    put(p.jpeg);
    put('\nendstream\nendobj\n');
  });
  const start = pos, count = 4 + pages.length * 3;
  put(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) put(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${start}\n%%EOF\n`);
  const out = new Uint8Array(pos);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
