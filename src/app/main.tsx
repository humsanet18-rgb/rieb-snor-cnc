import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/battambang/khmer-400.css';
import '@fontsource/battambang/khmer-700.css';
import '@fontsource/moul/khmer-400.css';
import '../styles/app.css';
import { readProject } from '../services/project-io';
import { loadProfiles, loadProject, saveProfiles } from '../services/db';
import { defaultProfile } from '../features/nesting/model';
import { flushSave, lastProjectId, loadInto, projectStore, rememberLast } from '../stores/project-store';
import { toast } from '../stores/ui-store';
import { tr } from './i18n';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';

async function restore() {
  try {
    const profiles = await loadProfiles();
    if (profiles.length) projectStore.patch({ profiles });
    else await saveProfiles([defaultProfile()]);
    const id = lastProjectId();
    const stored = id ? await loadProject(id) : undefined;
    if (stored) loadInto(readProject(stored));
    else { rememberLast(projectStore.get().project.id); await flushSave(); }
  } catch {
    // Without IndexedDB the app still works; the status in the top bar says nothing is being saved.
    projectStore.patch({ saveState: 'error', saveError: 'unavailable' });
  }
}

function registerServiceWorker() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const firstInstall = !navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      reg.installing?.addEventListener('statechange', e => {
        if (firstInstall && (e.target as ServiceWorker).state === 'activated') toast(tr('toast.offline'));
      });
    });
  }).catch(() => undefined);
}

void restore().finally(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>);
  registerServiceWorker();
});
