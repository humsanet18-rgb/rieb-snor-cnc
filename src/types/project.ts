import type { FillDirection } from '../engines/nesting-engine/nest';
import type { ImportReport } from '../engines/svg-parser/report';
import type { Part, Polygon, Rect, StartSpec } from './geometry';

export type NestMode = 'auto' | 'keep' | 'manual';
export type CornerMode = 'bottom' | 'top' | 'all' | 'none';
export type Arrange = 'free' | 'rows';
export type CutOrder = 'shortest' | 'rows' | 'columns' | 'snake';

export interface RowSettings {
  /** Pieces within this many mm of the row's tallest piece share the row. */
  tolerance: number;
  align: 'bottom' | 'top' | 'center';
  order: 'height' | 'file';
  /** Lets shorter pieces use the free end of a row. */
  fillGaps: boolean;
  /** Closes up along the real letter shapes instead of their boxes. */
  tight: boolean;
}

export interface CutOptions { order: CutOrder; returnHome: boolean }

export interface Settings {
  sheetW: number; sheetH: number; thickness: number;
  gap: number; margin: number;
  corners: { mode: CornerMode; leftW: number; rightW: number; h: number };
  start: { enabled: boolean; x: number; y: number; w: number; h: number };
  fill: FillDirection;
  angles: number[];
  seconds: number;
  mode: NestMode;
  arrange: Arrange;
  rows: RowSettings;
  cut: CutOptions;
}

export interface Design {
  id: string;
  name: string;
  qty: number;
  /** 'fixed' keeps this design upright whatever the nesting rotation is. */
  rotation: 'inherit' | 'fixed';
  parts: Part[];
  markers: Polygon[];
  page: { w: number; h: number };
  report: ImportReport;
}

export interface MachineProfile {
  id: string;
  name: string;
  feed: number;
  power: number;
  m5: boolean;
  /** Machine travel in mm; null means not configured and not checked. */
  maxX: number | null;
  maxY: number | null;
}

export interface PlacedPiece { key: string; designId: string; partIndex: number; copy: number; deg: number; tx: number; ty: number }
export interface UnplacedPiece { designId: string; partIndex: number; copy: number }

export interface SheetLayout { pieces: PlacedPiece[]; start: StartSpec }

/** A generated arrangement. Sheet size, gap and zones are stored so a layout stays valid after settings change. */
export interface Layout {
  id: string;
  number: number;
  createdAt: string;
  mode: NestMode;
  sheetW: number; sheetH: number; gap: number; margin: number;
  zones: Rect[];
  fill: FillDirection;
  arrange: Arrange;
  /** The row settings used, or null for a layout that is not in rows. */
  rows: RowSettings | null;
  sheets: SheetLayout[];
  unplaced: UnplacedPiece[];
  passes: number;
  seconds: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  designs: Design[];
  settings: Settings;
  profileId: string;
  layouts: Layout[];
  activeLayoutId: string | null;
  baseName: string;
}
