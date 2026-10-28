// Local memory fixtures only. Never reads/writes the browser's real favorites.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { normalizeFavoriteId, normalizeFavorites, favoriteReferences, toggleFavorite } from '../src/lib/favorites.js';
import { createLocalStorageStore } from '../src/lib/local-storage-store.js';

const KEY = 'pendejaditas:favorites:v1';
const id = n => `abcdef01-1234-4000-8000-${n.toString(16).padStart(12, '0')}`;
const [A, B, C, D] = [1, 2, 3, 4].map(id);
let checks = 0;
const pass = text => { checks++; console.log(`OK favoritos ${checks}: ${text}`); };

function hub(initial = []) {
  const values = new Map([[KEY, JSON.stringify(initial)]]), tabs = [], events = [];
  let writes = 0;
  function tab(locks = null) {
    const listeners = new Map();
    const target = {
      addEventListener(type, listener) { const set = listeners.get(type) || new Set(); set.add(listener); listeners.set(type, set); },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
      fire(type, event = {}) { for (const listener of listeners.get(type) || []) listener(event); },
    };
    const storage = {
      failRead: false, failWrite: false,
      getItem(key) { if (storage.failRead) throw new Error('blocked'); return values.get(key) ?? null; },
      setItem(key, value) {
        if (storage.failWrite) throw new Error('quota');
        const oldValue = values.get(key) ?? null; values.set(key, value); writes++;
        for (const other of tabs) if (other.storage !== storage) events.push(() => other.target.fire('storage', { key, oldValue, newValue: value, storageArea: other.storage }));
      },
    };
    const store = createLocalStorageStore({ key: KEY, fallback: [], validate: Array.isArray, normalize: normalizeFavorites, storage, eventTarget: target, locks });
    const result = { store, storage, target, listeners }; tabs.push(result); return result;
  }
  return { values, tab, get writes() { return writes; }, flush(reverse = false) { const pending = events.splice(0); if (reverse) pending.reverse(); pending.forEach(event => event()); } };
}
function lockManager() {
  const queues = new Map(); let active = 0, maximum = 0;
  return {
    get maximum() { return maximum; },
    request(name, options, callback) {
      assert.equal(options.mode, 'exclusive');
      const operation = (queues.get(name) || Promise.resolve()).then(async () => {
        active++; maximum = Math.max(maximum, active);
        try { await Promise.resolve(); return await callback(); } finally { active--; }
      });
      queues.set(name, operation.catch(() => {})); return operation;
    },
  };
}

{
  const old = ['ps5', A.toUpperCase(), B, A, null, { old: 'preserve' }];
  const before = JSON.stringify(old), normalized = normalizeFavorites(old);
  assert.deepEqual(normalized, ['ps5', B, A, null, { old: 'preserve' }]);
  assert.equal(JSON.stringify(old), before);
  assert.deepEqual(favoriteReferences(old), { ids: [A, B], legacyCount: 3 });
  assert.equal(normalizeFavoriteId(A.toUpperCase()), A);
  pass('normalización consistente, duplicados reales con letras y conservación de referencias antiguas desconocidas');
}
{
  const memory = hub([A.toUpperCase(), A, 'ps5', null]), { store } = memory.tab();
  assert.deepEqual(store.getSnapshot().value, [A, 'ps5', null]);
  assert.equal(memory.writes, 0);
  await store.update(value => toggleFavorite(value, A.toUpperCase()));
  assert.deepEqual(store.getSnapshot().value, ['ps5', null]);
  assert.deepEqual(JSON.parse(memory.values.get(KEY)), ['ps5', null]);
  pass('un clic elimina todas las variantes equivalentes; leer datos antiguos no los reescribe');
}
{
  const memory = hub([A, 'ps5', null]), { store } = memory.tab();
  for (const value of ['bad-id', '', 'A', 123, null, undefined, { id: B }]) await store.update(previous => toggleFavorite(previous, value));
  assert.equal(memory.writes, 0); assert.deepEqual(store.getSnapshot().value, [A, 'ps5', null]);
  await store.update(value => toggleFavorite(value, B));
  assert.ok(store.getSnapshot().value.includes(A));
  pass('IDs inválidos no escriben ni eliminan datos; una referencia válida no se borra por falta de disponibilidad');
}
{
  const memory = hub(), { store } = memory.tab();
  await Promise.all([store.update(value => toggleFavorite(value, A)), store.update(value => toggleFavorite(value, B)), store.update(value => toggleFavorite(value, C))]);
  assert.deepEqual(store.getSnapshot().value, [A, B, C]);
  assert.deepEqual(JSON.parse(memory.values.get(KEY)), [A, B, C]);
  await Promise.all([store.update(value => toggleFavorite(value, D)), store.update(value => toggleFavorite(value, D))]);
  assert.deepEqual(store.getSnapshot().value, [A, B, C]);
  pass('clics consecutivos sobre distintos favoritos y doble clic sobre el mismo utilizan el estado más reciente');
}
{
  const memory = hub(), { store } = memory.tab();
  let expected = [];
  const operations = Array.from({ length: 100 }, (_, n) => id(n % 17));
  const pending = operations.map(value => { expected = toggleFavorite(expected, value); return store.update(current => toggleFavorite(current, value)); });
  await Promise.all(pending);
  assert.deepEqual(store.getSnapshot().value, expected); assert.deepEqual(JSON.parse(memory.values.get(KEY)), expected);
  pass('cien operaciones en cola coinciden con la aplicación secuencial sin actualizaciones perdidas');
}
{
  const memory = hub(), tab = memory.tab(); let notificationsA = 0, notificationsB = 0;
  const unsubscribeA = tab.store.subscribe(() => notificationsA++), unsubscribeB = tab.store.subscribe(() => notificationsB++);
  const stable = tab.store.getSnapshot(); assert.equal(tab.store.getSnapshot(), stable); assert.ok(Object.isFrozen(stable.value));
  await tab.store.update(value => toggleFavorite(value, A));
  assert.equal(notificationsA, 1); assert.equal(notificationsB, 1);
  unsubscribeA(); assert.equal(tab.listeners.get('storage').size, 1);
  unsubscribeB(); assert.equal(tab.listeners.get('storage').size, 0);
  pass('instantáneas estables para React, notificación a consumidores y limpieza de listeners');
}
{
  const memory = hub([A]), tab = memory.tab();
  const unmountA = tab.store.subscribe(() => {}); await tab.store.update(value => toggleFavorite(value, B)); unmountA();
  for (const session of ['B', 'C', 'D']) { const stop = tab.store.subscribe(() => {}); assert.deepEqual(tab.store.getSnapshot().value, [A, B], session); stop(); }
  assert.deepEqual(JSON.parse(memory.values.get(KEY)), [A, B]);
  pass('cambios de sesión conservan el modelo por dispositivo y no vacían los favoritos');
}
{
  const memory = hub(), one = memory.tab(), two = memory.tab();
  const stopOne = one.store.subscribe(() => {}), stopTwo = two.store.subscribe(() => {});
  await one.store.update(value => toggleFavorite(value, A));
  await two.store.update(value => toggleFavorite(value, B)); // rereads shared storage even before its event arrives
  memory.flush(true);
  assert.deepEqual(one.store.getSnapshot().value, [A, B]); assert.deepEqual(two.store.getSnapshot().value, [A, B]);
  two.target.fire('storage', { key: KEY, storageArea: {}, newValue: '[]' });
  assert.deepEqual(two.store.getSnapshot().value, [A, B]);
  stopOne(); stopTwo();
  pass('pestañas sincronizan eventos retrasados/fuera de orden leyendo el valor actual y descartan eventos de otro almacenamiento');
}
{
  const memory = hub([A]), tab = memory.tab(); const stop = tab.store.subscribe(() => {});
  memory.values.set(KEY, JSON.stringify([B])); tab.target.fire('focus');
  assert.deepEqual(tab.store.getSnapshot().value, [B]);
  memory.values.delete(KEY); tab.target.fire('storage', { key: null, storageArea: tab.storage });
  assert.deepEqual(tab.store.getSnapshot().value, []); assert.equal(memory.writes, 0); stop();
  pass('recuperar foco y borrado externo explícito se reflejan sin escrituras de reparación automáticas');
}
{
  const memory = hub(), locks = lockManager(), one = memory.tab(locks), two = memory.tab(locks);
  const stopOne = one.store.subscribe(() => {}), stopTwo = two.store.subscribe(() => {});
  await Promise.all(Array.from({ length: 30 }, (_, n) => (n % 2 ? one : two).store.update(value => toggleFavorite(value, id(n)))));
  memory.flush();
  assert.equal(locks.maximum, 1); assert.equal(favoriteReferences(JSON.parse(memory.values.get(KEY))).ids.length, 30);
  assert.deepEqual(one.store.getSnapshot(), two.store.getSnapshot()); stopOne(); stopTwo();
  pass('Web Locks coordina operaciones simultáneas de pestañas cooperantes mediante un bloqueo por clave');
}
{
  const memory = hub(), tab = memory.tab({ request: async () => { throw new Error('unsupported'); } });
  await tab.store.update(value => toggleFavorite(value, A));
  assert.deepEqual(tab.store.getSnapshot().value, [A]);
  const staleExternalCopy = [];
  memory.values.set(KEY, JSON.stringify(toggleFavorite(staleExternalCopy, B))); tab.target.fire('focus');
  assert.deepEqual(tab.store.getSnapshot().value, [A]); // no subscriber installed yet
  const stop = tab.store.subscribe(() => {});
  assert.deepEqual(tab.store.getSnapshot().value, [B]); stop();
  pass('sin coordinación no se promete atomicidad: una escritura externa obsoleta puede prevalecer y la sincronización refleja lo persistido');
}
{
  const memory = hub([A]), tab = memory.tab(); tab.storage.failWrite = true;
  await tab.store.update(value => toggleFavorite(value, B)); await tab.store.update(value => toggleFavorite(value, C));
  assert.deepEqual(tab.store.getSnapshot().value, [A, B, C]); assert.ok(tab.store.getSnapshot().warning);
  assert.deepEqual(JSON.parse(memory.values.get(KEY)), [A]);
  tab.storage.failWrite = false; await tab.store.update(value => toggleFavorite(value, D));
  assert.deepEqual(JSON.parse(memory.values.get(KEY)), [A, B, C, D]); assert.equal(tab.store.getSnapshot().warning, false);
  pass('fallos de cuota mantienen cambios en memoria con aviso y recuperan la persistencia sin perder la cola');
}
{
  for (const raw of ['broken json', '{"old":"do not overwrite"}']) {
    const memory = hub(); memory.values.set(KEY, raw); const { store } = memory.tab();
    await store.update(value => toggleFavorite(value, A));
    assert.equal(memory.values.get(KEY), raw); assert.equal(memory.writes, 0); assert.ok(store.getSnapshot().warning);
  }
  const memory = hub(), tab = memory.tab(); tab.storage.failRead = true;
  await tab.store.update(value => toggleFavorite(value, A)); assert.equal(memory.writes, 0); assert.ok(tab.store.getSnapshot().warning);
  pass('datos raíz corruptos, esquema desconocido o lectura bloqueada se conservan sin sobrescribirlos');
}
{
  const memory = hub([A]), tab = memory.tab();
  tab.storage.failRead = true; await tab.store.update(value => toggleFavorite(value, B));
  assert.deepEqual(tab.store.getSnapshot().value, [A, B]); assert.equal(memory.writes, 0);
  tab.storage.failRead = false; await tab.store.update(value => toggleFavorite(value, C));
  assert.deepEqual(JSON.parse(memory.values.get(KEY)), [A, B, C]); assert.equal(tab.store.getSnapshot().warning, false);
  pass('recuperar la lectura del mismo valor almacenado desbloquea la persistencia sin perder los cambios locales pendientes');
}
{
  const memory = hub([A]), { store } = memory.tab();
  await store.update(() => { throw new Error('bad updater'); }); assert.ok(store.getSnapshot().warning);
  await store.update(value => toggleFavorite(value, B)); assert.deepEqual(store.getSnapshot().value, [A, B]);
  assert.deepEqual(store.getServerSnapshot(), { value: [], warning: false });
  pass('un actualizador fallido no rompe la siguiente operación y SSR no expone almacenamiento del navegador');
}

// Check the actual App/Layout output with an injected local-store snapshot.
const memory = hub([A.toUpperCase(), A, B, 'ps5']), { store } = memory.tab();
globalThis.window = { location: { hash: '', search: '' } };
globalThis.__favoriteSnapshot = store.getSnapshot();
globalThis.__favoriteViewer = null;
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'favorites-state-fixtures', enforce: 'pre', transform(_code, file) {
  const path = file.replaceAll('\\', '/').split('?')[0];
  if (path.endsWith('/src/hooks/useLocalStorage.js')) return 'export const useLocalStorage=()=>[globalThis.__favoriteSnapshot.value,()=>{},globalThis.__favoriteSnapshot.warning];';
  if (path.endsWith('/src/hooks/useAuth.js')) return 'export const useAuth=()=>({user:globalThis.__favoriteViewer,loading:false,error:""});';
} }] });
try {
  const { default: App } = await server.ssrLoadModule('/src/App.jsx');
  for (const viewer of [null, A, B, C, D]) {
    globalThis.__favoriteViewer = viewer ? { id: viewer } : null;
    const html = renderToStaticMarkup(createElement(App));
    assert.ok(html.includes('Guardados<span class="count">2</span>'));
  }
  const source = await readFile('src/App.jsx', 'utf8');
  assert.ok(source.includes("useLocalStorage('pendejaditas:favorites:v1', [], Array.isArray, normalizeFavorites)"));
  assert.ok(!source.includes('favoritesCount={catalog.products.filter'));
  pass('contador real App/Layout con catálogo vacío: UUID únicos normalizados, independiente de catálogo y sesión');
} finally { await server.close(); delete globalThis.__favoriteSnapshot; delete globalThis.__favoriteViewer; }
console.log(`PASS: ${checks} grupos de favoritos; almacenamiento, eventos y Web Locks simulados, sin datos reales ni Supabase.`);
