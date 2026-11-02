/** All geometry is in millimetres. X grows right, Y grows down, as on the SVG page and in the TAP file. */
export type Point = [number, number];
export type Polygon = Point[];
export type Matrix = [number, number, number, number, number, number];

export interface BBox { x0: number; y0: number; x1: number; y1: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** One physical foam piece: outer contours plus the holes inside them. */
export interface Part {
  outers: Polygon[];
  holes: Polygon[];
  area: number;
  bbox: BBox;
}

/** Geometry of a piece already placed on a sheet. */
export interface PlacedItem {
  outers: Polygon[];
  holes: Polygon[];
  area: number;
}

export type StartSpec = { box: Rect } | { x: number; y: number };

export interface Stroke {
  path: Point[];
  bridges: [Point, Point][];
  /** Contours that could not be linked into the stroke; anything above 0 must never be cut. */
  unlinked: number;
  /** Item indexes in the order the wire first reaches them. */
  order: number[];
  /** Item indexes by row (or column) in cutting order; absent for the shortest-path order, which has no rows. */
  rows?: number[][];
}
