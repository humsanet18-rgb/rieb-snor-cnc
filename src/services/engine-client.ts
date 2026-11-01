import type { NestProgress } from '../engines/nesting-engine/nest';
import type { Job, JobResult } from '../workers/jobs';

export class JobCancelled extends Error {
  constructor() { super('cancelled'); }
}

export interface RunningJob<T> { promise: Promise<T>; cancel: () => void }

/** One worker per job: terminating it is the only cancel that works mid-computation. */
export function startJob<J extends Job>(job: J, onProgress?: (p: NestProgress | number) => void): RunningJob<JobResult<J>> {
  const worker = new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' });
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<JobResult<J>>((resolve, rej) => {
    reject = rej;
    worker.onmessage = e => {
      if (e.data.type === 'progress') { onProgress?.(e.data.progress); return; }
      worker.terminate();
      if (e.data.type === 'done') resolve(e.data.result);
      else rej(new Error(e.data.message));
    };
    worker.onerror = e => { worker.terminate(); rej(new Error(e.message || 'worker failed')); };
  });
  worker.postMessage(job);
  return { promise, cancel: () => { worker.terminate(); reject(new JobCancelled()); } };
}
