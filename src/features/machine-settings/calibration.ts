import type { MachineProfile } from '../../types/project';
import { defaultProfile } from '../nesting/model';

/** Values that describe the real machine; changing any of them means it has to be checked again. */
export const CALIBRATED: (keyof MachineProfile)[] = ['feed', 'power', 'm5', 'maxX', 'maxY'];

export type FieldState = 'sample' | 'set' | 'unset';

/** Whether a value is still the shipped sample, has been entered by the operator, or is missing. */
export function fieldState(p: MachineProfile, field: 'feed' | 'power' | 'maxX' | 'maxY'): FieldState {
  if (p[field] === null) return 'unset';
  return p[field] === defaultProfile()[field] ? 'sample' : 'set';
}

/** Applies an edit; touching a calibrated value clears the verification, so it is never stale. */
export function editProfile(p: MachineProfile, part: Partial<MachineProfile>): MachineProfile {
  const next = { ...p, ...part };
  return CALIBRATED.some(k => k in part && part[k] !== p[k]) ? { ...next, verifiedAt: null } : next;
}

export type Readiness = 'verified' | 'unverified' | 'incomplete';

/** Verified once confirmed on the machine; incomplete while feed is unusable or travel is unknown. */
export function readiness(p: MachineProfile): Readiness {
  if (!(p.feed > 0) || p.power < 0 || !p.name.trim() || p.maxX === null || p.maxY === null) return 'incomplete';
  return p.verifiedAt ? 'verified' : 'unverified';
}

/**
 * Mach3 axis calibration: the controller moved `commanded` mm but the wire travelled `measured` mm,
 * so the steps per mm in Motor Tuning should change by commanded / measured.
 */
export function correctedSteps(current: number, commanded: number, measured: number): { steps: number; errorPct: number } | null {
  if (!(current > 0) || !(commanded > 0) || !(measured > 0)) return null;
  return { steps: current * commanded / measured, errorPct: (measured - commanded) / commanded * 100 };
}
