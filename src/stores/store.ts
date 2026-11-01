import { useSyncExternalStore } from 'react';

/** The smallest shared state that works with React's concurrent rendering. */
export class Store<T> {
  private listeners = new Set<() => void>();
  constructor(private state: T) {}
  get = (): T => this.state;
  set = (next: T | ((s: T) => T)): void => {
    const value = typeof next === 'function' ? (next as (s: T) => T)(this.state) : next;
    if (value === this.state) return;
    this.state = value;
    this.listeners.forEach(l => l());
  };
  patch = (part: Partial<T>): void => this.set({ ...this.state, ...part });
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };
}

export function useStore<T, S>(store: Store<T>, select: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
