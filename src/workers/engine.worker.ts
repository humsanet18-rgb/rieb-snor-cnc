/// <reference lib="webworker" />
import { runJob, type Job } from './jobs';

self.onmessage = async (e: MessageEvent<Job>) => {
  try {
    let last = 0;
    const result = await runJob(e.data, progress => {
      const now = Date.now();
      if (now - last < 80) return;
      last = now;
      self.postMessage({ type: 'progress', progress });
    });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
