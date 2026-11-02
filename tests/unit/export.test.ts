import { describe, expect, it } from 'vitest';
import { utf16Hex, writePdf } from '../../src/engines/export/pdf';
import { toSVG } from '../../src/engines/export/svg-export';
import { makeZip, readZip } from '../../src/engines/export/zip';
import { parseSvg } from '../../src/engines/svg-parser/parse-svg';
import { cleanBaseName, sheetFileName } from '../../src/services/download';
import { buildParts } from '../../src/engines/geometry-engine/parts';
import { box } from './helpers';

describe('SVG export (case 19)', () => {
  const items = [{ outers: [box(100, 100, 80, 60)], holes: [box(120, 115, 30, 25)], area: 1 }];
  const text = toSVG(items, 1000, 480, { x: 1.5, y: 1, w: 15, h: 18 });

  it('states the sheet size in cm, the way CorelDRAW writes it', () => {
    expect(text).toContain('width="100cm"');
    expect(text).toContain('height="48cm"');
  });

  it('re-imports with the same geometry, hole and start marker', () => {
    const p = parseSvg(text), r = buildParts(p.shapes);
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].holes).toHaveLength(1);
    expect(r.parts[0].outers[0]).toEqual(expect.arrayContaining([[100, 100], [180, 160]]));
    expect(p.markers).toHaveLength(1);
  });
});

describe('ZIP export (case 20)', () => {
  const text = 'N00000 F500\n';
  const data = new Uint8Array(70000).map((_, i) => i % 251);
  const zip = makeZip([{ name: 'Foam 01.tap', data: text }, { name: 'Foam 01.svg', data }]);

  it('round-trips names and bytes with CRC checks', () => {
    const files = readZip(zip);
    expect(files.map(f => f.name)).toEqual(['Foam 01.tap', 'Foam 01.svg']);
    expect(new TextDecoder().decode(files[0].data)).toBe(text);
    expect(files[1].data).toEqual(data);
  });

  it('refuses a corrupted archive', () => {
    const bad = zip.slice();
    bad[45] ^= 0xff;
    expect(() => readZip(bad)).toThrow();
  });
});

describe('PDF writer', () => {
  it('writes a valid wrapper with a correct cross-reference table', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const bytes = writePdf([{ jpeg, pixelW: 100, pixelH: 141 }, { jpeg, pixelW: 100, pixelH: 141 }], 'Job (1)');
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text.match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
    const xrefAt = +text.match(/startxref\s+(\d+)/)![1];
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const rows = text.slice(xrefAt).match(/^(\d{10}) 00000 n/gm)!;
    rows.forEach((row, i) => {
      const at = +row.slice(0, 10);
      expect(text.slice(at, at + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });
  });

  it('names the producer រៀបអក្សរ CNC as a UTF-16 string, in plain ASCII bytes', () => {
    const bytes = writePdf([{ jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), pixelW: 100, pixelH: 141 }], 'Job');
    const text = new TextDecoder('latin1').decode(bytes);
    const hex = /\/Producer <FEFF([0-9A-F]+)>/.exec(text)![1];
    const name = String.fromCharCode(...hex.match(/.{4}/g)!.map(h => parseInt(h, 16)));
    expect(name).toBe('រៀបអក្សរ CNC');
    expect(text).not.toMatch(/rieb\s*snor/i);
    expect(utf16Hex('A')).toBe('<FEFF0041>');
  });
});

describe('file names', () => {
  it('keeps names Mach3 can open', () => {
    expect(cleanBaseName('បា+1 Job/../x')).toBe('+1 Job..x');
    expect(cleanBaseName('ក')).toBe('Foam');
    expect(sheetFileName('Job', 0)).toBe('Job 01');
    expect(sheetFileName('Job', 11)).toBe('Job 12');
  });
});
