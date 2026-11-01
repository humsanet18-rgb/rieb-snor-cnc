import { describe, expect, it } from 'vitest';
import { defaultProfile, layoutFromKeep, newProject } from '../../src/features/nesting/model';
import { parseProjectFile, ProjectFileError, readProject, toProjectFile } from '../../src/services/project-io';
import { allKeys } from '../../src/app/i18n';
import { finishImport } from '../../src/features/svg-import/import';
import { parseSvg } from '../../src/engines/svg-parser/parse-svg';
import { buildParts } from '../../src/engines/geometry-engine/parts';
import type { Project } from '../../src/types/project';
import { svgDoc } from './helpers';

function sampleProject(): Project {
  const parsed = parseSvg(svgDoc('<path d="M10 10H90V90H10ZM30 30V70H70V30Z"/>'));
  const out = finishImport('a.svg', 100, parsed, buildParts(parsed.shapes));
  if (!out.ok) throw new Error('import failed');
  const p = newProject('Job ១');
  const designs = [{ ...out.design, qty: 3 }];
  const layout = layoutFromKeep(designs, p.settings, [], 1);
  return { ...p, designs, layouts: [layout], activeLayoutId: layout.id };
}

describe('project files (case 21)', () => {
  it('opens a file saved before rows and cutting options existed', () => {
    const p = sampleProject(), profile = defaultProfile(), file = JSON.parse(toProjectFile(p, profile));
    for (const k of ['arrange', 'rows', 'cut']) delete file.project.settings[k];
    for (const k of ['arrange', 'rows']) delete file.project.layouts[0][k];
    const r = parseProjectFile(JSON.stringify(file));
    expect(r.project.settings).toEqual(p.settings);
    expect(r.project.layouts[0]).toEqual(p.layouts[0]);
  });

  it('refuses a damaged cutting option', () => {
    const p = sampleProject(), file = JSON.parse(toProjectFile(p, defaultProfile()));
    file.project.settings.cut.order = 'sideways';
    expect(() => parseProjectFile(JSON.stringify(file))).toThrow(ProjectFileError);
  });

  it('restores everything after a full round trip', () => {
    const p = sampleProject(), profile = { ...defaultProfile(), feed: 420, name: 'Line 2', maxX: 1200 };
    const r = parseProjectFile(toProjectFile(p, profile));
    expect(r.project).toEqual(p);
    expect(r.profile).toEqual(profile);
  });

  it('refuses the wrong format, version and damaged JSON', () => {
    const good = JSON.parse(toProjectFile(sampleProject(), defaultProfile()));
    for (const text of ['not json', '{}', JSON.stringify({ ...good, format: 'x' }), JSON.stringify({ ...good, version: 99 })]) {
      expect(() => parseProjectFile(text)).toThrow(ProjectFileError);
    }
  });

  it('refuses bad values field by field', () => {
    const edit = (fn: (j: Record<string, any>) => void) => {
      const j = JSON.parse(toProjectFile(sampleProject(), defaultProfile()));
      fn(j);
      return () => parseProjectFile(JSON.stringify(j));
    };
    expect(edit(j => { j.project.settings.sheetW = -1; })).toThrow(ProjectFileError);
    expect(edit(j => { j.project.settings.sheetW = 'x'; })).toThrow(ProjectFileError);
    expect(edit(j => { j.project.designs[0].qty = -3; })).toThrow(ProjectFileError);
    expect(edit(j => { j.project.designs[0].parts[0].outers[0][0] = [null, 1]; })).toThrow(ProjectFileError);
    expect(edit(j => { j.profile.feed = 'fast'; })).toThrow(ProjectFileError);
    expect(edit(j => { j.project.layouts[0].sheets[0].pieces[0].designId = 'ghost'; })).toThrow(ProjectFileError);
  });

  it('limits an absurd copy count', () => {
    const j = JSON.parse(toProjectFile(sampleProject(), defaultProfile()));
    j.project.designs[0].qty = 1e9;
    expect(parseProjectFile(JSON.stringify(j)).project.designs[0].qty).toBe(999);
  });

  it('never copies unknown or prototype keys into the app', () => {
    const j = JSON.parse(toProjectFile(sampleProject(), defaultProfile()));
    j.project.evil = '<img src=x onerror=alert(1)>';
    const text = JSON.stringify(j).replace('"format"', '"__proto__":{"polluted":true},"format"');
    const r = parseProjectFile(text);
    expect((r.project as unknown as Record<string, unknown>).evil).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps hostile names as inert text', () => {
    const p = sampleProject();
    p.name = '<script>alert(1)</script>';
    expect(parseProjectFile(toProjectFile(p, defaultProfile())).project.name).toBe(p.name);
    expect(readProject(p).name).toBe(p.name);
  });
});

describe('translations', () => {
  it('has every key in both languages', () => {
    expect([...allKeys.km].sort()).toEqual([...allKeys.en].sort());
  });
});
