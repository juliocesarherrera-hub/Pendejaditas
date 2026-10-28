import { useMemo, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../lib/local-storage-store';

const identity = value => value;
const stores = new WeakMap();

function getStore(key, fallback, validate, normalize) {
  const browser = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  if (!browser) return createLocalStorageStore({ key, fallback, validate, normalize });
  let registry = stores.get(browser);
  if (!registry) { registry = new Map(); stores.set(browser, registry); }
  const previous = registry.get(key);
  if (previous?.validate === validate && previous.normalize === normalize) return previous.store;
  let storage = null, locks = null;
  try { storage = browser.localStorage; } catch { /* Keep in-memory state and warning. */ }
  try { locks = browser.navigator?.locks; } catch { /* Use documented best-effort fallback. */ }
  const store = createLocalStorageStore({ key, fallback, validate, normalize, storage, eventTarget: browser, locks });
  registry.set(key, { store, validate, normalize });
  return store;
}

export function useLocalStorage(key, fallback, validate, normalize = identity) {
  const store = useMemo(() => getStore(key, fallback, validate, normalize), [key, fallback, validate, normalize]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return [snapshot.value, store.update, snapshot.warning];
}
