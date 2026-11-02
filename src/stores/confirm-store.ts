import { Store } from './store';

export interface ConfirmRequest {
  title: string; body: string; action: string; danger?: boolean;
  /** Asks for a line of text, such as a new name, instead of a plain yes or no. */
  input?: { label: string; value: string; maxLength?: number };
}
interface Pending extends ConfirmRequest { resolve: (value: string | null) => void }

export const confirmStore = new Store<Pending | null>(null);

function open(request: ConfirmRequest): Promise<string | null> {
  confirmStore.get()?.resolve(null);
  return new Promise(resolve => confirmStore.set({ ...request, resolve }));
}

/** Shows the app's own confirmation dialog and resolves to the operator's answer. */
export function ask(request: ConfirmRequest): Promise<boolean> {
  return open(request).then(v => v !== null);
}

/** Asks for text; resolves to the trimmed text, or null when cancelled. */
export function askText(request: ConfirmRequest & { input: NonNullable<ConfirmRequest['input']> }): Promise<string | null> {
  return open(request);
}

export function answer(yes: boolean, value = ''): void {
  const pending = confirmStore.get();
  confirmStore.set(null);
  pending?.resolve(yes ? value.trim() : null);
}
