import type { Matrix, Polygon } from '../../types/geometry';
import { bboxOf, matApply, matMul } from '../geometry-engine/geometry';
import { parseTransform, pathToPolys, type PathResult } from './path';
import { issueSeverity, type ImportIssue, type ImportIssueCode } from './report';

export const LIMITS = { fileBytes: 20 * 1024 * 1024, elements: 200_000, points: 2_000_000, useDepth: 8, entities: 64 };

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96, q: 0.25 };
const PX = UNIT_MM.px;
const SVG_NS = 'http://www.w3.org/2000/svg', XHTML_NS = 'http://www.w3.org/1999/xhtml';
const LENGTH = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*|%)\s*$/i;

function lengthMM(s: string | null): number | null {
  const m = LENGTH.exec(s || '');
  if (!m || !(m[2].toLowerCase() in UNIT_MM)) return null;
  return parseFloat(m[1]) * UNIT_MM[m[2].toLowerCase()];
}

export class SvgImportError extends Error {
  constructor(public code: ImportIssueCode, public detail?: string) { super(code); }
}

export interface ParsedSvg {
  page: { w: number; h: number };
  shapes: Polygon[];
  markers: Polygon[];
  imported: Record<string, number>;
  skipped: Record<string, number>;
  issues: ImportIssue[];
}

/* ---------- a small, deliberately limited CSS reader: enough for what design tools export ---------- */
interface Rule { tag?: string; id?: string; classes: string[]; specificity: number; order: number; decl: Map<string, string> }

function declarations(s: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of (s || '').split(';')) {
    const i = d.indexOf(':');
    if (i > 0) out.set(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).replace(/!important/i, '').trim());
  }
  return out;
}

function parseCss(text: string, onUnsupported: (what: string) => void): Rule[] {
  const rules: Rule[] = [];
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!\[CDATA\[|\]\]>|<!--|-->/g, '').replace(/@(?:import|charset|namespace)[^;]*;/g, '');
  let i = 0, order = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const head = src.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
    const body = src.slice(open + 1, j - 1);
    i = j;
    if (head.startsWith('@')) {
      if (!head.startsWith('@font-face')) onUnsupported(head);
      continue;
    }
    const decl = declarations(body);
    for (const raw of head.split(',')) {
      const sel = raw.trim();
      if (!sel) continue;
      const m = /^(\*|[a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/.exec(sel);
      if (!m) { onUnsupported(sel); continue; }
      const parts = m[2].match(/[.#][\w-]+/g) || [];
      const id = parts.find(p => p[0] === '#')?.slice(1);
      const classes = parts.filter(p => p[0] === '.').map(p => p.slice(1));
      const tag = m[1] && m[1] !== '*' ? m[1] : undefined;
      rules.push({ tag, id, classes, specificity: (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0), order: order++, decl });
    }
  }
  return rules;
}

/* ---------- document walker ---------- */
interface Inherited { fill: string; visibility: string }

const SILENT = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'symbol', 'marker', 'linearGradient', 'radialGradient', 'pattern', 'filter']);
const CONTAINERS = new Set(['g', 'a', 'switch']);

class Walker {
  shapes: Polygon[] = [];
  markers: Polygon[] = [];
  imported: Record<string, number> = {};
  skipped: Record<string, number> = {};
  page: { w: number; h: number } | null = null;
  private issues = new Map<ImportIssueCode, ImportIssue>();
  private rules: Rule[] = [];
  private ids = new Map<string, Element>();
  private using = new Set<Element>();
  private elements = 0;
  private points = 0;

  constructor(doc: Document) {
    for (const s of Array.from(doc.getElementsByTagNameNS('*', 'style'))) {
      const base = this.rules.length;
      this.rules.push(...parseCss(s.textContent || '', what => this.note('css-unsupported', what)).map(r => ({ ...r, order: r.order + base })));
    }
    this.rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
    for (const el of Array.from(doc.getElementsByTagNameNS('*', '*'))) {
      const id = el.getAttribute('id');
      if (id && !this.ids.has(id)) this.ids.set(id, el);
    }
  }

  note(code: ImportIssueCode, detail?: string, n = 1) {
    const i = this.issues.get(code);
    if (i) {
      i.count += n;
      if (detail && i.detail && !i.detail.includes(detail) && i.detail.length < 120) i.detail += ', ' + detail;
    } else this.issues.set(code, { code, severity: issueSeverity[code], count: n, detail });
  }
  issueList(): ImportIssue[] { return [...this.issues.values()]; }
  private tally(into: Record<string, number>, name: string) { into[name] = (into[name] || 0) + 1; }
  private skip(name: string, code: ImportIssueCode, detail?: string) { this.tally(this.skipped, name); this.note(code, detail); }

  private style(el: Element, inherited: Inherited) {
    const tag = el.localName, cls = (el.getAttribute('class') || '').split(/\s+/), id = el.getAttribute('id');
    let fill = el.getAttribute('fill') ?? inherited.fill;
    let visibility = el.getAttribute('visibility') ?? inherited.visibility;
    let display = el.getAttribute('display') ?? 'inline';
    const apply = (d: Map<string, string>) => {
      fill = d.get('fill') ?? fill;
      visibility = d.get('visibility') ?? visibility;
      display = d.get('display') ?? display;
    };
    for (const r of this.rules) {
      if ((!r.tag || r.tag === tag) && (!r.id || r.id === id) && r.classes.every(c => cls.includes(c))) apply(r.decl);
    }
    if (el.hasAttribute('style')) apply(declarations(el.getAttribute('style')));
    if (fill === 'inherit') fill = inherited.fill;
    if (visibility === 'inherit') visibility = inherited.visibility;
    return { fill: fill.trim(), visibility, display };
  }

  /** A length attribute in user units; absolute units convert through the CSS rule of 96 per inch. */
  private len(el: Element, name: string): number {
    const raw = el.getAttribute(name);
    if (raw === null) return 0;
    const m = LENGTH.exec(raw);
    const unit = m ? m[2].toLowerCase() : '%';
    if (!m || !(unit in UNIT_MM)) { this.note('bad-length', `${name}="${raw.slice(0, 24)}"`); return parseFloat(raw) || 0; }
    return unit ? parseFloat(m[1]) * UNIT_MM[unit] / PX : parseFloat(m[1]);
  }

  private count(el: Element) {
    if (++this.elements > LIMITS.elements) throw new SvgImportError('too-complex', `> ${LIMITS.elements} elements`);
    return el.localName;
  }

  private viewport(el: Element, base: Matrix, root: boolean): Matrix {
    const vb = (el.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const wmm = lengthMM(el.getAttribute('width')), hmm = lengthMM(el.getAttribute('height'));
    const hasBox = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
    let m = base;
    if (!root) m = matMul(m, [1, 0, 0, 1, this.len(el, 'x'), this.len(el, 'y')]);
    if (!root && !hasBox) return m;
    // The page scales to mm; inside it, sizes of nested viewports stay in user units.
    const k = root ? 1 : PX;
    if (hasBox) {
      let sx = wmm ? wmm / vb[2] / k : (root ? PX : 1), sy = hmm ? hmm / vb[3] / k : sx;
      if (!wmm && hmm) sx = sy;
      let ox = 0, oy = 0;
      const par = (el.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim();
      if (Math.abs(sx / sy - 1) > 1e-3 && !par.startsWith('none')) {
        const s = par.includes('slice') ? Math.max(sx, sy) : Math.min(sx, sy);
        const fx = par.includes('xMin') ? 0 : par.includes('xMax') ? 1 : 0.5, fy = par.includes('YMin') ? 0 : par.includes('YMax') ? 1 : 0.5;
        ox = (vb[2] * sx - vb[2] * s) * fx; oy = (vb[3] * sy - vb[3] * s) * fy;
        if (root) this.page = { w: vb[2] * sx, h: vb[3] * sy };
        sx = sy = s;
      } else if (root) this.page = { w: wmm || vb[2] * sx, h: hmm || vb[3] * sy };
      return matMul(matMul(matMul(m, [1, 0, 0, 1, ox, oy]), [sx, 0, 0, sy, 0, 0]), [1, 0, 0, 1, -vb[0], -vb[1]]);
    }
    this.page = { w: wmm || 0, h: hmm || 0 };
    return matMul(m, [PX, 0, 0, PX, 0, 0]);
  }

  walkRoot(el: Element) {
    this.count(el);
    const st = this.style(el, { fill: 'black', visibility: 'visible' });
    const own: Matrix = el.hasAttribute('transform') ? parseTransform(el.getAttribute('transform')) : [1, 0, 0, 1, 0, 0];
    this.children(el, this.viewport(el, own, true), { fill: st.fill, visibility: st.visibility }, 0);
  }

  private children(el: Element, m: Matrix, inherited: Inherited, depth: number) {
    for (const c of Array.from(el.children)) this.visit(c, m, inherited, depth);
  }

  private visit(el: Element, base: Matrix, inherited: Inherited, depth: number) {
    const name = this.count(el);
    if (el.namespaceURI && el.namespaceURI !== SVG_NS && el.namespaceURI !== XHTML_NS) return; // editor metadata
    if (SILENT.has(name)) return;
    if (name === 'script') { this.skip(name, 'script'); return; }
    const st = this.style(el, inherited);
    if (st.display === 'none' || (st.visibility !== 'visible' && !CONTAINERS.has(name))) { this.skip(name, 'hidden'); return; }
    const own = el.hasAttribute('transform') ? matMul(base, parseTransform(el.getAttribute('transform'))) : base;
    const next: Inherited = { fill: st.fill, visibility: st.visibility };
    if (CONTAINERS.has(name)) { this.children(el, own, next, depth); return; }
    if (name === 'svg') { this.children(el, this.viewport(el, own, false), next, depth); return; }
    if (name === 'use') { this.use(el, own, next, depth); return; }
    if (name === 'text') { this.skip(name, 'text'); return; }
    if (name === 'image') { this.skip(name, 'image'); return; }
    if (name === 'foreignObject') { this.skip(name, 'foreign-object'); return; }
    if (name === 'clipPath' || name === 'mask') { this.skip(name, 'clip-mask'); return; }
    if (name === 'line') { this.skip(name, 'line'); return; }

    const local: PathResult = { polys: [], open: 0, dropped: 0, malformed: 0 };
    if (name === 'path') pathToPolys(el.getAttribute('d') || '', own, local);
    else if (name === 'rect') this.rect(el, own, local);
    else if (name === 'circle' || name === 'ellipse') this.ellipse(el, name, own, local);
    else if (name === 'polygon' || name === 'polyline') this.poly(el, name, own, local);
    else { this.skip(name, 'unknown-element', name); return; }

    if (local.malformed) this.note('malformed-path', undefined, local.malformed);
    if (local.dropped) this.note('dropped-open', undefined, local.dropped);
    if (local.open) this.note('open-closed', undefined, local.open);
    if (!local.polys.length) { this.tally(this.skipped, name); return; }
    this.points += local.polys.reduce((s, p) => s + p.length, 0);
    if (this.points > LIMITS.points) throw new SvgImportError('too-complex', `> ${LIMITS.points} points`);
    const box = bboxOf(local.polys[0]);
    const isMarker = name === 'rect' && st.fill === 'none' && box.x1 - box.x0 <= 120 && box.y1 - box.y0 <= 120;
    this.tally(this.imported, name);
    for (const p of local.polys) (isMarker ? this.markers : this.shapes).push(p);
    if (isMarker) this.note('marker');
  }

  private poly(el: Element, name: string, m: Matrix, local: PathResult) {
    const v = (el.getAttribute('points') || '').match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || [];
    const p: Polygon = [];
    for (let i = 0; i + 1 < v.length; i += 2) p.push(matApply(m, +v[i], +v[i + 1]));
    if (p.length > 2) {
      local.polys.push(p);
      if (name === 'polyline' && (v[0] !== v[v.length - 2] || v[1] !== v[v.length - 1])) local.open++;
    } else if (p.length) local.dropped++;
  }

  private rect(el: Element, m: Matrix, local: PathResult) {
    const x = this.len(el, 'x'), y = this.len(el, 'y'), w = this.len(el, 'width'), h = this.len(el, 'height');
    if (!(w > 0) || !(h > 0)) { local.dropped++; return; }
    let rx = this.len(el, 'rx'), ry = this.len(el, 'ry');
    if (!el.hasAttribute('rx')) rx = ry;
    if (!el.hasAttribute('ry')) ry = rx;
    rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
    if (rx > 0 && ry > 0) {
      const a = `A${rx} ${ry} 0 0 1`;
      pathToPolys(`M${x + rx} ${y}H${x + w - rx}${a} ${x + w} ${y + ry}V${y + h - ry}${a} ${x + w - rx} ${y + h}H${x + rx}${a} ${x} ${y + h - ry}V${y + ry}${a} ${x + rx} ${y}Z`, m, local);
    } else local.polys.push(([[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as Polygon).map(q => matApply(m, q[0], q[1])));
  }

  private ellipse(el: Element, name: string, m: Matrix, local: PathResult) {
    const rx = name === 'circle' ? this.len(el, 'r') : this.len(el, 'rx'), ry = name === 'circle' ? this.len(el, 'r') : this.len(el, 'ry');
    if (!(rx > 0) || !(ry > 0)) { local.dropped++; return; }
    const k = 0.5522847498, cx = this.len(el, 'cx'), cy = this.len(el, 'cy');
    pathToPolys(`M${cx + rx} ${cy}C${cx + rx} ${cy + k * ry} ${cx + k * rx} ${cy + ry} ${cx} ${cy + ry}` +
      `C${cx - k * rx} ${cy + ry} ${cx - rx} ${cy + k * ry} ${cx - rx} ${cy}` +
      `C${cx - rx} ${cy - k * ry} ${cx - k * rx} ${cy - ry} ${cx} ${cy - ry}` +
      `C${cx + k * rx} ${cy - ry} ${cx + rx} ${cy - k * ry} ${cx + rx} ${cy}Z`, m, local);
  }

  private use(el: Element, m: Matrix, inherited: Inherited, depth: number) {
    const href = el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? el.getAttribute('xlink:href') ?? '';
    if (!href.startsWith('#')) { this.skip('use', 'use-external'); return; }
    const target = this.ids.get(href.slice(1));
    if (!target || this.using.has(target) || depth >= LIMITS.useDepth) { this.skip('use', 'use-cycle'); return; }
    this.tally(this.imported, 'use');
    const moved = matMul(m, [1, 0, 0, 1, this.len(el, 'x'), this.len(el, 'y')]);
    this.using.add(target);
    if (target.localName === 'symbol') this.children(target, moved, inherited, depth + 1);
    else this.visit(target, moved, inherited, depth + 1);
    this.using.delete(target);
  }
}

function parseDocument(text: string): { root: Element; scope: Document; recovered: boolean } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const broken = doc.getElementsByTagName('parsererror').length > 0;
  if (!broken) {
    if (doc.documentElement?.localName === 'svg') return { root: doc.documentElement, scope: doc, recovered: false };
    throw new SvgImportError('not-svg');
  }
  // Hand-copied markup often lacks xmlns:xlink; the HTML parser reads it, and DOMParser never runs scripts.
  const html = new DOMParser().parseFromString(text, 'text/html');
  const root = html.querySelector('svg');
  if (!root) throw new SvgImportError(/<svg[\s>]/i.test(text) ? 'invalid-xml' : 'not-svg');
  return { root, scope: html, recovered: true };
}

/** Reads SVG markup as data only: nothing from it is rendered, executed or fetched. */
export function parseSvg(text: string): ParsedSvg {
  if (text.length > LIMITS.fileBytes) throw new SvgImportError('file-too-large');
  if ((text.match(/<!ENTITY/g) || []).length > LIMITS.entities) throw new SvgImportError('too-complex', 'entities');
  // Counted before parsing: building the DOM is itself the expensive step for a hostile file.
  let tags = 0;
  for (let i = text.indexOf('<'); i >= 0; i = text.indexOf('<', i + 1)) if (++tags > LIMITS.elements * 2) throw new SvgImportError('too-complex', 'elements');
  let w: Walker;
  try {
    const { root, scope, recovered } = parseDocument(text);
    w = new Walker(scope);
    if (recovered) w.note('recovered-xml');
    w.walkRoot(root);
  } catch (e) {
    // Absurd nesting overflows the stack, in the browser's parser or in the walk.
    if (e instanceof RangeError) throw new SvgImportError('too-complex', 'nesting');
    throw e;
  }
  const finite = w.shapes.filter(p => p.every(q => Number.isFinite(q[0]) && Number.isFinite(q[1])));
  if (finite.length < w.shapes.length) { w.note('malformed-path', undefined, w.shapes.length - finite.length); w.shapes = finite; }
  // A rectangle drawn around the whole page is a frame, not something to cut.
  const pg = w.page || { w: 0, h: 0 };
  const isFrame = (p: Polygon) => {
    if (!pg.w || !pg.h || p.length > 6) return false;
    const b = bboxOf(p);
    return b.x1 - b.x0 >= pg.w * 0.9 && b.y1 - b.y0 >= pg.h * 0.9;
  };
  const kept = w.shapes.filter(p => !isFrame(p));
  const frames = kept.length ? w.shapes.length - kept.length : 0;
  if (frames) w.note('frame', undefined, frames);
  return { page: pg, shapes: frames ? kept : w.shapes, markers: w.markers, imported: w.imported, skipped: w.skipped, issues: w.issueList() };
}
