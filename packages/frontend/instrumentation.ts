// Polyfill browser-only globals that WalletConnect / wagmi access at import time
// in the Node.js SSR environment before any page renders.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const g = globalThis as Record<string, unknown>;

    if (typeof g['indexedDB'] === 'undefined') {
      g['indexedDB'] = {
        open: () => ({}),
        deleteDatabase: () => ({}),
        databases: () => Promise.resolve([]),
      };
    }

    if (typeof g['localStorage'] === 'undefined') {
      const store: Record<string, string> = {};
      g['localStorage'] = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); },
        key: (i: number) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; },
      };
    }
  }
}
