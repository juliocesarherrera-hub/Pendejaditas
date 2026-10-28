const identity = value => value;

// One synchronous snapshot and ordered update queue per store. Web Locks can
// coordinate cooperating same-origin tabs; localStorage itself is NOT a transaction.
export function createLocalStorageStore({ key, fallback, validate, normalize = identity, storage = null, eventTarget = null, locks = null }) {
  const immutable = value => Array.isArray(value) ? Object.freeze([...value]) : value;
  const serverSnapshot = Object.freeze({ value: immutable(normalize(fallback)), warning: false });
  let snapshot = serverSnapshot, signature = JSON.stringify(snapshot.value);
  let lastRaw, initialized = false, blocked = false, dirty = false, queue = Promise.resolve();
  const listeners = new Set();

  function publish(value, warning) {
    const nextSignature = JSON.stringify(value);
    if (signature === nextSignature && snapshot.warning === warning) return;
    snapshot = Object.freeze({ value: immutable(value), warning });
    signature = nextSignature;
    for (const listener of listeners) listener();
  }
  function synchronize() {
    if (!storage) { blocked = true; publish(snapshot.value, true); return; }
    try {
      const raw = storage.getItem(key);
      if (initialized && raw === lastRaw) {
        const wasBlocked = blocked;
        blocked = false;
        if (wasBlocked && !dirty) publish(snapshot.value, false);
        return;
      }
      const value = raw === null ? fallback : JSON.parse(raw);
      if (!validate(value)) throw new Error('invalid_stored_value');
      const lostUnpersistedChange = dirty;
      lastRaw = raw; initialized = true; blocked = false; dirty = false;
      publish(normalize(value), lostUnpersistedChange);
    } catch {
      // Never overwrite unreadable/malformed existing storage with an empty list.
      blocked = true; publish(snapshot.value, true);
    }
  }
  function apply(next) {
    synchronize();
    const value = typeof next === 'function' ? next(snapshot.value) : next;
    if (value === snapshot.value) return snapshot;
    if (!validate(value)) { publish(snapshot.value, true); return snapshot; }
    const normalized = normalize(value), serialized = JSON.stringify(normalized);
    if (serialized === signature && !dirty) return snapshot;
    if (blocked) { dirty = true; publish(normalized, true); return snapshot; }
    try {
      storage.setItem(key, serialized);
      lastRaw = serialized; initialized = true; dirty = false;
      publish(normalized, false);
    } catch { dirty = true; publish(normalized, true); }
    return snapshot;
  }
  async function execute(next) {
    if (typeof locks?.request === 'function') {
      let entered = false;
      try {
        return await locks.request(`pendejaditas:storage:${key}`, { mode: 'exclusive' }, () => { entered = true; return apply(next); });
      } catch {
        // Do not replay an updater if its callback already ran.
        if (entered) { publish(snapshot.value, true); return snapshot; }
      }
    }
    return apply(next);
  }
  function update(next) {
    queue = queue.then(() => execute(next)).catch(() => { publish(snapshot.value, true); return snapshot; });
    return queue;
  }
  function onStorage(event) {
    if ((event.key === key || event.key === null) && (!event.storageArea || event.storageArea === storage)) synchronize();
  }
  function subscribe(listener) {
    if (listeners.size === 0) {
      eventTarget?.addEventListener('storage', onStorage);
      eventTarget?.addEventListener('focus', synchronize);
    }
    listeners.add(listener);
    synchronize();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        eventTarget?.removeEventListener('storage', onStorage);
        eventTarget?.removeEventListener('focus', synchronize);
      }
    };
  }
  synchronize();
  return { getSnapshot: () => snapshot, getServerSnapshot: () => serverSnapshot, subscribe, update };
}
