export type ImportIssueCode =
  | 'invalid-xml' | 'not-svg' | 'file-too-large' | 'too-complex' | 'recovered-xml' | 'empty'
  | 'text' | 'image' | 'use-external' | 'use-cycle' | 'script' | 'foreign-object' | 'clip-mask'
  | 'hidden' | 'line' | 'open-closed' | 'dropped-open' | 'malformed-path' | 'frame' | 'bad-length'
  | 'css-unsupported' | 'unknown-element' | 'tiny' | 'duplicates' | 'overlaps' | 'marker';

export type Severity = 'info' | 'warning' | 'error';

export interface ImportIssue { code: ImportIssueCode; severity: Severity; count: number; detail?: string }

/** What happened to a file: nothing a designer drew is dropped without being listed here. */
export interface ImportReport {
  fileName: string;
  fileBytes: number;
  imported: Record<string, number>;
  skipped: Record<string, number>;
  issues: ImportIssue[];
  stats: { parts: number; contours: number; holes: number; points: number; width: number; height: number; area: number };
}

export const issueSeverity: Record<ImportIssueCode, Severity> = {
  'invalid-xml': 'error', 'not-svg': 'error', 'file-too-large': 'error', 'too-complex': 'error', 'empty': 'error',
  'text': 'warning', 'image': 'warning', 'use-external': 'warning', 'use-cycle': 'warning', 'foreign-object': 'warning',
  'clip-mask': 'warning', 'line': 'warning', 'open-closed': 'warning', 'dropped-open': 'warning', 'malformed-path': 'warning',
  'overlaps': 'warning', 'bad-length': 'warning', 'css-unsupported': 'warning', 'unknown-element': 'warning',
  'recovered-xml': 'warning', 'script': 'info', 'hidden': 'info', 'frame': 'info', 'tiny': 'info', 'duplicates': 'info', 'marker': 'info'
};

export const needsCorrection = (r: ImportReport): boolean => r.issues.some(i => i.severity !== 'info');
