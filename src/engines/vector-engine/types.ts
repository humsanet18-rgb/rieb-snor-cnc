import type { Matrix, Point } from '../../types/geometry';

/**
 * The design document: editable vector objects on a page, in millimetres, Y down.
 * Geometry is cubic Bézier; production only ever sees it flattened to polygons.
 */

/** A path node. `i` and `o` are the incoming and outgoing control points, absolute; absent means a straight segment end. */
export interface VNode { p: Point; i?: Point; o?: Point }

export interface Subpath { closed: boolean; nodes: VNode[] }

export interface VStyle {
  /** CSS colour, or null for no fill. The wire ignores colour; it is for telling objects apart. */
  fill: string | null;
  stroke: string | null;
  /** Outline width in mm, drawn only. */
  strokeWidth: number;
}

interface ItemBase {
  id: string;
  name: string;
  locked: boolean;
  hidden: boolean;
}

export interface PathItem extends ItemBase {
  type: 'path';
  /** What drew it, for the properties panel; the geometry is always the subpaths. */
  kind: ShapeKind;
  /** Local geometry; `matrix` places it on the page. */
  subpaths: Subpath[];
  matrix: Matrix;
  style: VStyle;
}

export interface GroupItem extends ItemBase {
  type: 'group';
  children: VItem[];
}

export type VItem = PathItem | GroupItem;

export type ShapeKind = 'path' | 'rect' | 'ellipse' | 'polygon' | 'star' | 'spiral' | 'grid' | 'line' | 'polyline' | 'freehand' | 'curves';

export interface VLayer { id: string; name: string; visible: boolean; locked: boolean; items: VItem[] }

export interface VectorDocument {
  version: 1;
  page: { w: number; h: number };
  /** Bottom to top. */
  layers: VLayer[];
  activeLayerId: string;
}

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export const DEFAULT_STYLE: VStyle = { fill: '#5b8bd9', stroke: '#1d3f7a', strokeWidth: 0.5 };
