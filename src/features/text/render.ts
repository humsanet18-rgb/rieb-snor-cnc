import { inkBounds, outlines } from '../../engines/text-engine/trace';
import type { Polygon } from '../../types/geometry';
import { scaleOutlines } from './geometry';

export interface FontChoice { id: string; family: string; weight: number; label: string; source: 'bundled' | 'system' | 'file' }

/** Shipped with the app, so they work offline on every device. */
export const BUNDLED_FONTS: FontChoice[] = [
  { id: 'battambang-400', family: 'Battambang', weight: 400, label: 'Battambang', source: 'bundled' },
  { id: 'battambang-700', family: 'Battambang', weight: 700, label: 'Battambang Bold', source: 'bundled' },
  { id: 'moul-400', family: 'Moul', weight: 400, label: 'Moul', source: 'bundled' }
];

/** Khmer fonts commonly installed with Windows, macOS, Khmer Unicode packs or Google Fonts. Only those found are offered. */
const SYSTEM_CANDIDATES = [
  'Khmer OS Battambang', 'Khmer OS Siemreap', 'Khmer OS Muol Light', 'Khmer OS Muol', 'Khmer OS Muol Pali', 'Khmer OS Bokor',
  'Khmer OS Content', 'Khmer OS System', 'Khmer OS Fasthand', 'Khmer OS Freehand', 'Khmer OS Metal Chrieng',
  'Khmer UI', 'DaunPenh', 'MoolBoran', 'Khmer MN', 'Khmer Sangam MN', 'Noto Sans Khmer', 'Noto Serif Khmer',
  'Kantumruy Pro', 'Hanuman', 'Koulen', 'Dangrek', 'Bayon', 'Bokor', 'Siemreap', 'Content', 'Angkor', 'Preahvihear', 'Suwannaphum'
];

const fontCss = (f: FontChoice, px: number) => `${f.weight} ${px}px "${f.family}"`;

/** A font is installed when text set in it measures differently from text set in a generic fallback. */
function installed(family: string, ctx: CanvasRenderingContext2D): boolean {
  const sample = 'កខគឃង ញដឋ abcmwi 0123';
  return ['monospace', 'serif', 'sans-serif'].some(generic => {
    ctx.font = `72px ${generic}`;
    const base = ctx.measureText(sample).width;
    ctx.font = `72px "${family}", ${generic}`;
    return Math.abs(ctx.measureText(sample).width - base) > 0.5;
  });
}

export function findSystemFonts(): FontChoice[] {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return [];
  return SYSTEM_CANDIDATES.filter(f => installed(f, ctx)).map(family => ({ id: `system-${family}`, family, weight: 400, label: family, source: 'system' }));
}

let uploads = 0;
/** Loads a font file for this session only; it is never uploaded anywhere. */
export async function loadFontFile(file: File): Promise<FontChoice> {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new TextRenderError('font-type');
  if (file.size > 30e6) throw new TextRenderError('font-size');
  const family = `RiebSnor Upload ${++uploads}`;
  const face = new FontFace(family, await file.arrayBuffer());
  try { await face.load(); } catch { throw new TextRenderError('font-bad'); }
  document.fonts.add(face);
  return { id: `file-${uploads}`, family, weight: 400, label: file.name.replace(/\.(ttf|otf|woff2?)$/i, ''), source: 'file' };
}

export type TextRenderCode = 'font-type' | 'font-size' | 'font-bad' | 'no-canvas' | 'ref-blank' | 'blank';
export class TextRenderError extends Error {
  constructor(readonly code: TextRenderCode) { super(code); }
}

function canvas(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new TextRenderError('no-canvas');
  return ctx;
}

function coverage(ctx: CanvasRenderingContext2D): Uint8Array {
  const { width: w, height: h } = ctx.canvas, rgba = ctx.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = rgba[i * 4 + 3];
  return a;
}

/** Ink height of a glyph drawn at `px`, from its traced outline, so it is accurate to a fraction of a pixel. */
function glyphInk(font: FontChoice, glyph: string, px: number): number {
  const size = Math.ceil(px * 3), ctx = canvas(size, size);
  ctx.font = fontCss(font, px);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(glyph, px, px * 2);
  const a = coverage(ctx);
  ctx.canvas.width = ctx.canvas.height = 0;
  if (!inkBounds(a, size, size)) return 0;
  const ys = outlines(a, size, size, { tolerance: 0, minArea: 1 }).flat().map(p => p[1]);
  return Math.max(...ys) - Math.min(...ys);
}

/** Ink height of the reference glyph as a fraction of the font size, measured from the browser's own rendering. */
export async function referenceRatio(font: FontChoice, glyph: string): Promise<number> {
  const px = 400;
  await document.fonts.load(fontCss(font, px), glyph);
  const ink = glyphInk(font, glyph, px);
  if (!ink) throw new TextRenderError('ref-blank');
  return ink / px;
}

export interface TextRenderInput {
  text: string; font: FontChoice; refGlyph: string; refHeight: number;
  align: 'left' | 'center' | 'right'; lineGap: number;
}

export interface TextRenderResult {
  /** Closed outlines in mm, top-left of the text at 0, 0. */
  rings: Polygon[];
  /** Pixels per mm actually used; lower than asked when a line was too large to draw at once. */
  pxPerMm: number;
  /** The reference glyph's ink height at the final scale, as a check on the scale. */
  refMeasured: number;
  lines: number;
}

const WANTED_PX_PER_MM = 4, MIN_PX_PER_MM = 1.5, MAX_SIDE = 16000, MAX_AREA = 14e6, SIMPLIFY_MM = 0.05;

const tick = () => new Promise(r => setTimeout(r));

/**
 * Draws each line with the browser's text engine, which shapes Khmer correctly (subscripts, vowels, reordering),
 * then traces the ink into closed outlines scaled so the reference glyph is exactly `refHeight` mm tall.
 */
export async function renderText(input: TextRenderInput, onProgress?: (done: number, total: number) => void): Promise<TextRenderResult> {
  const { font } = input;
  const lines = input.text.split(/\r?\n/).map(l => l.replace(/\s+$/, ''));
  await document.fonts.load(fontCss(font, 100), input.text + input.refGlyph);
  const ratio = await referenceRatio(font, input.refGlyph);
  const measure = canvas(1, 1);
  const sizeAt = (pxPerMm: number) => {
    const fontPx = input.refHeight * pxPerMm / ratio;
    measure.font = fontCss(font, fontPx);
    const pad = Math.ceil(4 + fontPx * 0.04);
    return lines.map(line => {
      const m = measure.measureText(line || ' ');
      const left = Math.ceil(m.actualBoundingBoxLeft), asc = Math.ceil(m.actualBoundingBoxAscent);
      return { line, left, asc, pad, w: Math.ceil(m.actualBoundingBoxRight) + left + pad * 2, h: asc + Math.ceil(m.actualBoundingBoxDescent) + pad * 2 };
    });
  };
  let pxPerMm = WANTED_PX_PER_MM;
  const first = sizeAt(pxPerMm);
  const shrink = Math.min(1, ...first.map(s => Math.min(MAX_SIDE / s.w, MAX_SIDE / s.h, Math.sqrt(MAX_AREA / (s.w * s.h)))));
  if (shrink < 1) pxPerMm = Math.max(MIN_PX_PER_MM, pxPerMm * shrink * 0.98);
  const sizes = shrink < 1 ? sizeAt(pxPerMm) : first;
  const fontPx = input.refHeight * pxPerMm / ratio;

  const blocks: { rings: Polygon[]; w: number; h: number }[] = [];
  for (let i = 0; i < sizes.length; i++) {
    onProgress?.(i, sizes.length);
    await tick();
    const s = sizes[i];
    if (!s.line.trim()) { blocks.push({ rings: [], w: 0, h: input.refHeight }); continue; }
    const ctx = canvas(s.w, s.h);
    ctx.font = fontCss(font, fontPx);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s.line, s.pad + s.left, s.pad + s.asc);
    const px = outlines(coverage(ctx), s.w, s.h, { tolerance: SIMPLIFY_MM * pxPerMm, minArea: Math.max(2, (0.5 * pxPerMm) ** 2) });
    ctx.canvas.width = ctx.canvas.height = 0;
    const rings = scaleOutlines(px, 1 / pxPerMm);
    const flat = rings.flat();
    blocks.push({ rings, w: flat.length ? Math.max(...flat.map(p => p[0])) : 0, h: flat.length ? Math.max(...flat.map(p => p[1])) : 0 });
  }
  onProgress?.(sizes.length, sizes.length);

  const width = Math.max(0, ...blocks.map(b => b.w));
  const rings: Polygon[] = [];
  let y = 0;
  for (const b of blocks) {
    const dx = input.align === 'center' ? (width - b.w) / 2 : input.align === 'right' ? width - b.w : 0;
    for (const r of b.rings) rings.push(r.map(([px, py]) => [+(px + dx).toFixed(3), +(py + y).toFixed(3)]));
    y += b.h + input.lineGap;
  }
  if (!rings.length) throw new TextRenderError('blank');

  // Re-measure the reference glyph at (up to) the size the text was drawn, as an independent check on the scale.
  const checkPx = Math.min(fontPx, MAX_SIDE / 3);
  const refMeasured = glyphInk(font, input.refGlyph, checkPx) * (fontPx / checkPx) / pxPerMm;
  return { rings, pxPerMm, refMeasured, lines: lines.filter(l => l.trim()).length };
}
