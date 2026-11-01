import { tr, validationText } from '../../app/i18n';
import { writePdf, type PdfPage } from '../../engines/export/pdf';
import type { ValidationIssue } from '../../engines/toolpath-engine/validate';
import { cleanBaseName, saveFile } from '../../services/download';
import { activeLayout, activeProfile, projectStore } from '../../stores/project-store';
import { toast, uiStore } from '../../stores/ui-store';
import type { Polygon } from '../../types/geometry';
import type { Layout, SheetLayout } from '../../types/project';
import { layoutStats, sheetItems } from '../nesting/model';

export const PAGE_W = 1240, PAGE_H = 1754, PAD = 90;
const FONT = 'Arial, Battambang, "Khmer UI", "Khmer OS", sans-serif';
export const INK = '#23211d', MUTED = '#6d675c', LINE = '#c9c2b4';

export function newPage(): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = PAGE_W; c.height = PAGE_H;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, PAGE_W, PAGE_H);
  return g;
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = INK, bold = false) {
  g.font = `${bold ? 700 : 400} ${size}px ${FONT}`;
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/** Wraps on spaces; Khmer sentences here are written with spaces between phrases. */
function paragraph(g: CanvasRenderingContext2D, s: string, x: number, y: number, width: number, size: number, color = INK): number {
  g.font = `400 ${size}px ${FONT}`;
  g.fillStyle = color;
  let line = '';
  for (const word of s.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (g.measureText(next).width > width && line) { g.fillText(line, x, y); y += size * 1.5; line = word; }
    else line = next;
  }
  g.fillText(line, x, y);
  return y + size * 1.5;
}

function trace(g: CanvasRenderingContext2D, polys: Polygon[], k: number, ox: number, oy: number) {
  for (const p of polys) {
    p.forEach((q, i) => (i ? g.lineTo(ox + q[0] * k, oy + q[1] * k) : g.moveTo(ox + q[0] * k, oy + q[1] * k)));
    g.closePath();
  }
}

function drawSheet(g: CanvasRenderingContext2D, sheet: SheetLayout, layout: Layout, x: number, y: number, width: number): number {
  const { project } = projectStore.get(), k = width / layout.sheetW, height = layout.sheetH * k;
  g.fillStyle = '#f6efdf';
  g.strokeStyle = LINE;
  g.lineWidth = 2;
  g.fillRect(x, y, width, height);
  g.strokeRect(x, y, width, height);
  g.fillStyle = '#f0b9a0';
  for (const z of layout.zones) g.fillRect(x + z.x * k, y + z.y * k, z.w * k, z.h * k);
  g.fillStyle = '#3f4c5a';
  for (const it of sheetItems(sheet, project.designs)) {
    g.beginPath();
    trace(g, [...it.outers, ...it.holes], k, x, y);
    g.fill('evenodd');
  }
  if ('box' in sheet.start) {
    const b = sheet.start.box;
    g.strokeStyle = '#c2410c';
    g.strokeRect(x + b.x * k, y + b.y * k, b.w * k, b.h * k);
  }
  return height;
}

export async function loadPdfFonts(): Promise<void> {
  await document.fonts.load(`400 24px Battambang`, 'ក').catch(() => undefined);
  await document.fonts.load(`700 24px Battambang`, 'ក').catch(() => undefined);
}

export const toJpeg = (g: CanvasRenderingContext2D): Promise<PdfPage> => new Promise((resolve, reject) => {
  g.canvas.toBlob(async blob => {
    if (!blob) { reject(new Error('jpeg')); return; }
    resolve({ jpeg: new Uint8Array(await blob.arrayBuffer()), pixelW: PAGE_W, pixelH: PAGE_H });
  }, 'image/jpeg', 0.85);
});

export async function makeCuttingReport(issues: ValidationIssue[]): Promise<void> {
  const state = projectStore.get(), { project } = state, layout = activeLayout(project), paths = uiStore.get().toolpaths;
  if (!layout || !paths) return;
  await loadPdfFonts();
  const lang = uiStore.get().lang, stats = layoutStats(layout, project.designs), profile = activeProfile(state);
  const cut = paths.sheets.reduce((s, x) => s + x.length, 0);
  const pages: CanvasRenderingContext2D[] = [];
  const footer = (g: CanvasRenderingContext2D, n: number) => text(g, tr('pdf.page', { n }), PAD, PAGE_H - 50, 22, MUTED);

  let g = newPage();
  pages.push(g);
  text(g, tr('pdf.title'), PAD, 150, 56, INK, true);
  const rows: [string, string][] = [
    [tr('pdf.project'), project.name],
    [tr('pdf.date'), new Date().toLocaleString(lang === 'km' ? 'km-KH' : 'en-GB')],
    [tr('pdf.foam'), `${layout.sheetW / 10} × ${layout.sheetH / 10} cm, ${project.settings.thickness} mm`],
    [tr('pdf.sheets'), String(stats.sheets)],
    [tr('pdf.pieces'), String(stats.pieces)],
    [tr('pdf.utilization'), `${(stats.utilization * 100).toFixed(1)}%`],
    [tr('pdf.cut'), `${(cut / 1000).toFixed(2)} ${tr('unit.m')}`],
    [tr('pdf.profile'), `${profile.name} (F${profile.feed} S${profile.power}${profile.m5 ? ' M5' : ''})`]
  ];
  let y = 240;
  for (const [k, v] of rows) {
    text(g, k, PAD, y, 28, MUTED);
    text(g, v, PAD + 380, y, 28);
    y += 54;
  }
  y += 40;
  text(g, tr('pdf.validation'), PAD, y, 36, INK, true);
  y += 56;
  const errors = issues.filter(i => i.severity === 'error').length;
  if (!issues.length || !errors) y = paragraph(g, tr('review.ok'), PAD, y, PAGE_W - PAD * 2, 26);
  for (const i of issues) {
    if (y > PAGE_H - 220) { footer(g, pages.length); g = newPage(); pages.push(g); y = 130; }
    const where = i.sheet < 0 ? tr('review.job') : tr('review.sheet', { n: i.sheet + 1 });
    const count = i.count > 1 ? ` × ${i.count}` : '';
    y = paragraph(g, `${where}: ${validationText(lang, i.code, i.detail)}${count}`, PAD, y, PAGE_W - PAD * 2, 24, i.severity === 'error' ? '#b42318' : INK);
  }
  y = paragraph(g, tr('pdf.note'), PAD, Math.max(y + 30, PAGE_H - 200), PAGE_W - PAD * 2, 24, MUTED);
  footer(g, pages.length);

  const width = PAGE_W - PAD * 2, h = width * layout.sheetH / layout.sheetW, perPage = Math.max(1, Math.floor((PAGE_H - 260) / (h + 110)));
  layout.sheets.forEach((sheet, i) => {
    if (i % perPage === 0) { g = newPage(); pages.push(g); y = 110; }
    const p = paths.sheets[i];
    text(g, `${tr('path.sheet', { n: i + 1 })} · ${p.pieces} ${tr('pdf.pieces')} · ${(p.length / 1000).toFixed(2)} ${tr('unit.m')}`, PAD, y, 28, INK, true);
    y += 24 + drawSheet(g, sheet, layout, PAD, y + 24, width) + 80;
    if (i % perPage === perPage - 1 || i === layout.sheets.length - 1) footer(g, pages.length);
  });

  const jpegs: PdfPage[] = [];
  for (const p of pages) jpegs.push(await toJpeg(p));
  const name = `${cleanBaseName(project.baseName)} report.pdf`;
  saveFile(name, writePdf(jpegs, project.name), 'application/pdf');
  toast(tr('toast.saved', { name }));
}
