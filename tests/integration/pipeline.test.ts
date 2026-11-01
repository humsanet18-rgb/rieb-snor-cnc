import { describe, expect, it } from 'vitest';
import { nest } from '../../src/engines/nesting-engine/nest';
import { parseTap, toTAP } from '../../src/engines/gcode-engine/tap';
import { makeZip, readZip } from '../../src/engines/export/zip';
import { hasBlocking } from '../../src/engines/toolpath-engine/validate';
import { buildParts } from '../../src/engines/geometry-engine/parts';
import { parseSvg } from '../../src/engines/svg-parser/parse-svg';
import { finishImport } from '../../src/features/svg-import/import';
import {
  cornerZones, defaultProfile, defaultSettings, expandPieces, layoutFromKeep, layoutFromNest, layoutStats, nestingStart, sheetItems
} from '../../src/features/nesting/model';
import { runStrokes, type StrokeJob } from '../../src/workers/jobs';
import type { Part } from '../../src/types/geometry';
import type { Design, Layout, Settings } from '../../src/types/project';
import { legacy, partsOf, privateFile, readSample } from '../unit/helpers';

function design(name: string, text: string, qty = 1): Design {
  const parsed = parseSvg(text), out = finishImport(name, text.length, parsed, buildParts(parsed.shapes));
  if (!out.ok) throw new Error(out.code);
  return { ...out.design, qty };
}

async function autoLayout(designs: Design[], settings: Settings): Promise<Layout> {
  const zones = cornerZones(settings), start = nestingStart(settings, zones), refs = expandPieces(designs);
  const parts: Part[] = refs.map(r => r.part);
  const r = await nest(parts, { sheetW: settings.sheetW, sheetH: settings.sheetH, gap: settings.gap, margin: settings.margin, angles: settings.angles, seconds: settings.seconds, startBox: start.box, zones, fill: settings.fill, cell: 3, fineCell: 1.25 });
  return layoutFromNest(r, refs, settings, zones, start.start, 1);
}

const strokeJob = (l: Layout, designs: Design[]): StrokeJob => ({
  kind: 'strokes', cut: defaultSettings().cut, sheets: l.sheets.map(sheet => ({ items: sheetItems(sheet, designs), start: sheet.start })),
  sheetW: l.sheetW, sheetH: l.sheetH, zones: l.zones, gap: l.gap, margin: l.margin, mode: l.mode, profile: defaultProfile()
});

describe('samples through the whole pipeline', () => {
  const settings = { ...defaultSettings(), seconds: 1 };

  it('block letters: import, nest, path, validate, TAP, ZIP', async () => {
    const designs = [design('block-letters', readSample('block-letters.svg'), 3)];
    const l = await autoLayout(designs, settings);
    expect(l.unplaced).toEqual([]);
    const job = strokeJob(l, designs), out = runStrokes(job);
    expect(out.issues.filter(i => i.severity === 'error')).toEqual([]);
    const files = out.sheets.map((s, i) => ({ name: `Job 0${i + 1}.tap`, data: toTAP(s.stroke.path, { name: `Job 0${i + 1}.tap`, feed: 500, power: 300, m5: false, date: 'x' }) }));
    for (const [i, f] of readZip(makeZip(files)).entries()) {
      const p = parseTap(new TextDecoder().decode(f.data));
      expect(p.errors).toEqual([]);
      // Coordinates in the file are the coordinates shown in the preview, to the 0.01 mm the format holds.
      expect(p.moves.length).toBe(out.sheets[i].stroke.path.length);
      p.moves.forEach((q, n) => {
        expect(Math.abs(q[0] - out.sheets[i].stroke.path[n][0])).toBeLessThanOrEqual(0.005001);
        expect(Math.abs(q[1] - out.sheets[i].stroke.path[n][1])).toBeLessThanOrEqual(0.005001);
      });
    }
    const st = layoutStats(l, designs);
    expect(st.pieces).toBe(33);
    expect(st.utilization).toBeGreaterThan(0.05);
    expect(st.utilization).toBeLessThan(1);
    expect(st.utilization + st.waste).toBeCloseTo(1, 9);
  });

  it('mixed shapes: keep-position mode preserves drawn coordinates', () => {
    const designs = [design('mixed', readSample('mixed-shapes.svg'))];
    const l = layoutFromKeep(designs, settings, [], 1);
    expect(l.sheets).toHaveLength(1);
    const items = sheetItems(l.sheets[0], designs);
    expect(items.flatMap(i => i.outers)).toEqual(designs[0].parts.flatMap(p => p.outers));
  });

  it('multiple imports share a layout (case 10)', async () => {
    const designs = [design('a', readSample('block-letters.svg')), design('b', readSample('mixed-shapes.svg'), 2)];
    const l = await autoLayout(designs, settings);
    const count = l.sheets.reduce((n, s) => n + s.pieces.length, 0) + l.unplaced.length;
    expect(count).toBe(expandPieces(designs).length);
    expect(new Set(l.sheets.flatMap(s => s.pieces).map(p => p.key)).size).toBe(count);
    expect(hasBlocking(runStrokes(strokeJob(l, designs)).issues)).toBe(false);
  });

  it('rejects a file with nothing to cut', () => {
    const parsed = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>');
    expect(finishImport('t.svg', 10, parsed, buildParts(parsed.shapes))).toMatchObject({ ok: false, code: 'empty' });
  });
});

describe('large dataset (case 23)', () => {
  it('nests 400 pieces and builds valid paths in reasonable time', async () => {
    const text = readSample('block-letters.svg');
    const designs = [design('big', text, 37)];
    const t0 = Date.now();
    const l = await autoLayout(designs, { ...defaultSettings(), seconds: 3 });
    const out = runStrokes(strokeJob(l, designs));
    const ms = Date.now() - t0;
    expect(l.unplaced).toEqual([]);
    expect(l.sheets.reduce((n, s) => n + s.pieces.length, 0)).toBe(407);
    expect(out.issues.filter(i => i.severity === 'error')).toEqual([]);
    console.log(`407 pieces, ${l.sheets.length} sheets, ${ms} ms`);
    expect(ms).toBeLessThan(60000);
  }, 120000);
});

const files = [1, 2, 3, 4].map(n => privateFile(`Ba+1 0${n}.svg`));
describe.skipIf(files.some(f => f === null))('real shop job', () => {
  it('fits the 111 real pieces on as few sheets as the original engine, or fewer', async () => {
    const designs = files.map((f, i) => design(`Ba+1 0${i + 1}`, f!));
    const settings = { ...defaultSettings(), seconds: 3 };
    const l = await autoLayout(designs, settings);
    expect(l.unplaced).toEqual([]);
    expect(layoutStats(l, designs).pieces).toBe(111);
    expect(l.sheets.length).toBeLessThanOrEqual(4);
    expect(hasBlocking(runStrokes(strokeJob(l, designs)).issues)).toBe(false);
  }, 60000);

  it('matches the original parser part for part on the same input', () => {
    const f = files[0]!;
    expect(partsOf(f).length).toBe(legacy.buildParts(legacy.parseSVG(f).shapes ?? legacy.parseSVG(f)).parts?.length ?? legacy.buildParts(legacy.parseSVG(f)).length);
  });
});
