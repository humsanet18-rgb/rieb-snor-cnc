import { Store } from './store';

export interface ConfirmRequest { title: string; body: string; action: string; danger?: boolean }
interface Pending extends ConfirmRequest { resolve: (yes: boolean) => void }

export const confirmStore = new Store<Pending | null>(null);

/** Shows the app's own confirmation dialog and resolves to the operator's answer. */
export function ask(request: ConfirmRequest): Promise<boolean> {
  confirmStore.get()?.resolve(false);
  return new Promise(resolve => confirmStore.set({ ...request, resolve }));
}

export function answer(yes: boolean): void {
  const pending = confirmStore.get();
  confirmStore.set(null);
  pending?.resolve(yes);
}
