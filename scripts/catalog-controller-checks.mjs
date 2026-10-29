// Block 2: deterministic requests/events only. No browser, SQL or remote client.
import assert from 'node:assert/strict';
import { createCatalogPageLoader } from '../src/lib/catalog-page-loader.js';
import { catalogQuery, createCatalogPages } from '../src/lib/catalog-page.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [1, 2].map(id);
const row = (n, extra = {}) => ({ id: id(n), type: 'fixed', price: 100 + n,
  category: n % 2 ? 'Consolas' : 'Videojuegos', title: `Sintético ${n}`, ...extra });
const auction = n => row(n, { type: 'auction', auction: { id: id(n + 9000), revision: 1, status: 'active' }, endsAt: 10000, clock: { epoch: 100 } });
const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
let checks = 0;
async function test(label, run) { await run(); checks++; console.log(`OK controlador catálogo ${checks}: ${label}`); }

function harness(rows = Array.from({ length: 40 }, (_, i) => row(i + 10))) {
  const pages = [], live = [], states = [], pageQueue = [], liveQueue = [];
  function response(input = {}, cursor = null) {
    const spec = catalogQuery(input);
    if (spec.status !== 'supported') return spec;
    const f = spec.filters;
    const cmp = (a, b) => (f.sort === 'recent' ? b.id.localeCompare(a.id) : (a.price - b.price || a.id.localeCompare(b.id)) * (f.sort === 'price_asc' ? 1 : -1));
    const all = rows.filter(item => (f.category === 'Todas' || item.category === f.category) && (f.type === 'all' || item.type === f.type)).sort(cmp);
    const after = cursor ? all.filter(item => cmp(item, { id: cursor.id, price: cursor.price }) > 0) : all;
    const items = structuredClone(after.slice(0, 12)), last = items.at(-1);
    return { status: 'ready', items, hasMore: after.length > 12, unavailable: 0,
      cursor: last ? { queryKey: spec.key, id: last.id, price: last.price } : null,
      consistency: 'synthetic_only' };
  }
  const service = {
    page(input = {}, { cursor, signal }) {
      pages.push({ input: { ...input }, cursor: structuredClone(cursor), signal });
      return pageQueue.length ? pageQueue.shift().promise : Promise.resolve(response(input, cursor));
    },
    auctionUpdates(ids, { signal }) {
      live.push({ ids: [...ids], signal });
      return liveQueue.length ? liveQueue.shift().promise : Promise.resolve({ status: 'ready', updates: structuredClone(ids.map(key => {
        const item = rows.find(value => value.id === key);
        return { id: key, price: item.price, auction: item.auction, endsAt: item.endsAt, clock: item.clock };
      })) });
    },
  };
  const loader = createCatalogPageLoader(service, state => states.push(structuredClone(state)));
  return { rows, pages, live, states, loader, response,
    nextPage() { const gate = defer(); pageQueue.push(gate); return gate; },
    nextLive() { const gate = defer(); liveQueue.push(gate); return gate; } };
}
const ids = loader => loader.getState().items.map(item => item.id);
const liveResult = (item, revision, price = item.price) => ({ status: 'ready', updates: [{ id: item.id, price, auction: { ...item.auction, revision }, endsAt: item.endsAt, clock: { epoch: 200 } }] });

await test('cambio conocido bloquea Cargar más, también llamadas programáticas', async () => {
  const h = harness(); await h.loader.reset({}); const before = ids(h.loader);
  h.loader.markChanged();
  for (let i = 0; i < 3; i++) assert.deepEqual(await h.loader.more(), { status: 'blocked', reason: 'results_changed' });
  assert.equal(h.pages.length, 1); assert.deepEqual(ids(h.loader), before);
});
await test('cancela una página en vuelo e ignora al transporte que no cancela', async () => {
  const h = harness(); await h.loader.reset({}); const before = structuredClone(h.loader.getState());
  const gate = h.nextPage(), pending = h.loader.more(); await tick();
  h.loader.markChanged(); assert.equal(h.pages[1].signal.aborted, true);
  gate.resolve(h.response({}, before.cursor)); assert.equal((await pending).status, 'cancelled');
  assert.deepEqual(ids(h.loader), before.items.map(item => item.id));
  assert.equal(h.loader.getState().loadingMore, false); assert.deepEqual(h.loader.getState().cursor, before.cursor);
});
await test('un evento durante la primera carga no produce lista vacía ni loading infinito', async () => {
  const h = harness(), gate = h.nextPage(), pending = h.loader.reset({}); await tick();
  h.loader.notifyChange({ source: 'products', event: 'INSERT' });
  gate.resolve(h.response()); await pending;
  assert.equal(h.loader.getState().status, 'error'); assert.equal(h.loader.getState().resultsChanged, true);
  await h.loader.refresh(); assert.equal(h.loader.getState().status, 'ready');
});
await test('actualizar conserva las páginas hasta confirmar la primera página nueva', async () => {
  const h = harness(); await h.loader.reset({}); await h.loader.more(); const before = ids(h.loader);
  h.loader.markChanged(); h.rows.push(row(999));
  const gate = h.nextPage(), pending = h.loader.refresh(); await tick();
  assert.deepEqual(ids(h.loader), before); assert.equal(h.loader.getState().refreshing, true);
  assert.equal(h.pages.at(-1).cursor, null); assert.equal(h.loader.getState().resultsChanged, true);
  gate.resolve(h.response()); await pending;
  assert.equal(ids(h.loader).length, 12); assert.equal(ids(h.loader)[0], id(999));
  assert.equal(h.loader.getState().resultsChanged, false);
  await h.loader.more(); assert.equal(ids(h.loader).length, 24);
});
await test('fallo al actualizar conserva lista/cursor/aviso y exige reintento explícito', async () => {
  const h = harness(); await h.loader.reset({}); await h.loader.more();
  const before = structuredClone(h.loader.getState()); h.loader.markChanged();
  const gate = h.nextPage(), pending = h.loader.refresh(); await tick(); gate.reject(new TypeError('synthetic-private')); await pending;
  assert.deepEqual(h.loader.getState().items, before.items); assert.deepEqual(h.loader.getState().cursor, before.cursor);
  assert.equal(h.loader.getState().status, 'ready'); assert.equal(h.loader.getState().error, 'connection');
  assert.equal((await h.loader.more()).reason, 'results_changed');
  const count = h.pages.length; await tick(); assert.equal(h.pages.length, count);
  await h.loader.refresh(); assert.equal(h.loader.getState().resultsChanged, false);
});
await test('evento durante actualización invalida la respuesta y conserva el aviso', async () => {
  const h = harness(); await h.loader.reset({}); const before = ids(h.loader);
  const gate = h.nextPage(), pending = h.loader.refresh(); await tick();
  h.loader.notifyChange({ source: 'products', event: 'DELETE' });
  gate.resolve(h.response()); assert.equal((await pending).status, 'cancelled');
  assert.deepEqual(ids(h.loader), before); assert.equal(h.loader.getState().resultsChanged, true);
  assert.equal(h.loader.getState().refreshing, false);
});
await test('filtros cambiados descartan una respuesta tardía', async () => {
  const h = harness(), gate = h.nextPage(), first = h.loader.reset({ category: 'Consolas' }); await tick();
  await h.loader.reset({ category: 'Videojuegos' }); const before = ids(h.loader);
  assert.equal(h.pages[0].signal.aborted, true);
  gate.resolve(h.response({ category: 'Consolas' })); await first;
  assert.deepEqual(ids(h.loader), before); assert.ok(h.loader.getState().items.every(item => item.category === 'Videojuegos'));
});
await test('orden cambiado descarta el error de una solicitud antigua', async () => {
  const h = harness(), gate = h.nextPage(), old = h.loader.reset({ type: 'fixed', sort: 'price_asc' }); await tick();
  await h.loader.reset({ type: 'fixed', sort: 'price_desc' });
  gate.reject(new TypeError('synthetic-private')); await old;
  assert.equal(h.loader.getState().error, null); assert.equal(h.loader.getState().items[0].price, Math.max(...h.rows.map(item => item.price)));
});
await test('sesión A/B retira datos y cursor anteriores inmediatamente', async () => {
  const h = harness(); await h.loader.reset({ sessionKey: A }); await h.loader.more();
  const oldCursor = h.loader.getState().cursor, oldIds = ids(h.loader);
  h.rows.splice(0, h.rows.length, ...Array.from({ length: 30 }, (_, i) => row(i + 1000)));
  const gate = h.nextPage(), pending = h.loader.reset({ sessionKey: B });
  assert.deepEqual(ids(h.loader), []); assert.equal(h.loader.getState().cursor, null);
  await tick(); assert.equal(h.pages.at(-1).cursor, null);
  gate.resolve(h.response({ sessionKey: B })); await pending; await h.loader.more();
  assert.ok(ids(h.loader).every(key => !oldIds.includes(key)));
  assert.notEqual(h.pages.at(-1).cursor.queryKey, oldCursor.queryKey);
  assert.equal(h.pages.at(-1).input.sessionKey, B);
});
await test('A/B/A con respuestas fuera de orden solo publica la generación actual', async () => {
  const h = harness(), first = h.nextPage(), one = h.loader.reset({ sessionKey: A }); await tick();
  const second = h.nextPage(), two = h.loader.reset({ sessionKey: B }); await tick();
  await h.loader.reset({ sessionKey: A }); const before = h.loader.getState();
  second.resolve({ status: 'error', reason: 'restricted' });
  first.resolve({ status: 'ready', items: [row(99999)], hasMore: false, cursor: null, unavailable: 0 });
  await Promise.all([one, two]); assert.deepEqual(h.loader.getState(), before);
});
await test('doble clic comparte una única solicitud y no duplica tarjetas', async () => {
  const h = harness(); await h.loader.reset({}); const gate = h.nextPage();
  const one = h.loader.more(), two = h.loader.more(); assert.equal(one, two); await tick();
  assert.equal(h.pages.length, 2); gate.resolve(h.response({}, h.pages[1].cursor)); await one;
  assert.equal(ids(h.loader).length, 24); assert.equal(new Set(ids(h.loader)).size, 24);
});
await test('fallo al agregar conserva páginas y cursor; reintento utiliza ese cursor', async () => {
  const h = harness(); await h.loader.reset({}); const before = structuredClone(h.loader.getState());
  const gate = h.nextPage(), pending = h.loader.more(); await tick(); gate.resolve({ status: 'error', reason: 'connection' }); await pending;
  assert.deepEqual(h.loader.getState().items, before.items); assert.deepEqual(h.loader.getState().cursor, before.cursor);
  await h.loader.more(); assert.deepEqual(h.pages.at(-1).cursor, before.cursor);
  assert.equal(ids(h.loader).length, 24); assert.equal(h.loader.getState().error, null);
});
await test('solapamiento entre páginas o dentro de una respuesta no crea duplicados', async () => {
  const h = harness(); await h.loader.reset({}); const old = h.loader.getState().items[0];
  const gate = h.nextPage(), pending = h.loader.more(); await tick();
  const result = h.response({}, h.pages[1].cursor);
  result.items = [old, old, ...result.items.slice(0, 10)]; gate.resolve(result); await pending;
  assert.equal(ids(h.loader).length, 22); assert.equal(new Set(ids(h.loader)).size, 22);
});
await test('puja actualiza precio en su sitio y pausa nuevas páginas', async () => {
  const item = auction(999), h = harness([item, ...Array.from({ length: 20 }, (_, i) => row(i + 10))]);
  await h.loader.reset({}); const before = ids(h.loader);
  item.auction.revision = 2; item.price = 5000; item.endsAt += 120000;
  await h.loader.refreshAuctions([item.id]);
  assert.deepEqual(ids(h.loader), before); assert.equal(h.loader.getState().items[0].price, 5000);
  assert.equal(h.loader.getState().resultsChanged, true); assert.equal((await h.loader.more()).reason, 'results_changed');
});
await test('una puja cancela la página pendiente antes de publicar precios nuevos', async () => {
  const item = auction(999), h = harness([item, ...Array.from({ length: 20 }, (_, i) => row(i + 10))]);
  await h.loader.reset({}); const gate = h.nextPage(), pending = h.loader.more(); await tick();
  const oldPage = h.response({}, h.pages[1].cursor);
  item.auction.revision = 2; item.price = 8000; await h.loader.refreshAuctions([item.id]);
  assert.equal(h.pages[1].signal.aborted, true); gate.resolve(oldPage); await pending;
  assert.equal(ids(h.loader).length, 12); assert.equal(h.loader.getState().items[0].price, 8000);
});
await test('revisiones antiguas no revierten precios; mismo precio no exige más consultas', async () => {
  const item = auction(999), h = harness([item]); await h.loader.reset({});
  let gate = h.nextLive(), pending = h.loader.refreshAuctions([item.id]); await tick();
  gate.resolve(liveResult(item, 2)); await pending;
  assert.equal(h.loader.getState().resultsChanged, false);
  gate = h.nextLive(); pending = h.loader.refreshAuctions([item.id]); await tick(); gate.resolve(liveResult(item, 1, 1)); await pending;
  assert.equal(h.loader.getState().items[0].auction.revision, 2); assert.equal(h.loader.getState().items[0].price, item.price);
  assert.equal(h.pages.length, 1);
});
await test('revisión idéntica con precio contradictorio falla sin aplicar el dato', async () => {
  const item = auction(999), h = harness([item]); await h.loader.reset({});
  const gate = h.nextLive(), pending = h.loader.refreshAuctions([item.id]); await tick();
  gate.resolve(liveResult(item, 1, 9000)); assert.deepEqual(await pending, { status: 'error', reason: 'service' });
  assert.equal(h.loader.getState().items[0].price, item.price); assert.equal(h.loader.getState().resultsChanged, true);
});
await test('lotes equivalentes comparten consulta; otros lotes reciben busy y límite 12', async () => {
  const a = auction(999), b = auction(998), h = harness([a, b]); await h.loader.reset({});
  const gate = h.nextLive(), one = h.loader.refreshAuctions([a.id, b.id]);
  assert.equal(one, h.loader.refreshAuctions([b.id, a.id, a.id]));
  assert.equal((await h.loader.refreshAuctions([a.id])).status, 'busy'); await tick();
  assert.equal(h.live.length, 1); assert.equal(h.live[0].ids.length, 2);
  gate.resolve({ status: 'ready', updates: [liveResult(a, 2).updates[0], liveResult(b, 2).updates[0]] }); await one;
  assert.equal((await h.loader.refreshAuctions(Array(13).fill(a.id))).status, 'invalid');
  assert.equal((await h.loader.refreshAuctions([id(100)] )).status, 'invalid');
  await h.loader.refreshAuctions([]); assert.equal(h.live.length, 1);
});
await test('fallo de actualización de precios conserva valores y marca incertidumbre', async () => {
  const item = auction(999), h = harness([item]); await h.loader.reset({});
  const gate = h.nextLive(), pending = h.loader.refreshAuctions([item.id]); await tick();
  gate.reject(new TypeError('synthetic-private')); await pending;
  assert.equal(h.loader.getState().items[0].price, item.price); assert.equal(h.loader.getState().liveError, 'connection');
  assert.equal(h.loader.getState().resultsChanged, true);
  assert.ok(!JSON.stringify(h.loader.getState()).includes('synthetic-private'));
});
await test('precio pendiente de una sesión anterior no se publica después del reset', async () => {
  const item = auction(999), h = harness([item]); await h.loader.reset({ sessionKey: A });
  const gate = h.nextLive(), pending = h.loader.refreshAuctions([item.id]); await tick();
  await h.loader.reset({ sessionKey: B });
  gate.resolve(liveResult(item, 99, 9999)); assert.equal((await pending).status, 'cancelled');
  assert.equal(h.live[0].signal.aborted, true); assert.equal(h.loader.getState().items[0].price, item.price);
});
await test('refresh con revisión anterior conserva precio más reciente y no reanuda', async () => {
  const item = auction(999), h = harness([item]); await h.loader.reset({}); const oldResponse = h.response();
  item.auction.revision = 2; item.price = 9000; await h.loader.refreshAuctions([item.id]);
  const gate = h.nextPage(), pending = h.loader.refresh(); await tick(); gate.resolve(oldResponse); await pending;
  assert.equal(h.loader.getState().items[0].price, 9000); assert.equal(h.loader.getState().resultsChanged, true);
  await h.loader.refresh(); assert.equal(h.loader.getState().resultsChanged, false);
});
await test('publicaciones nuevas/eliminadas cambian membresía solo al actualizar', async () => {
  const h = harness(); await h.loader.reset({}); const before = ids(h.loader);
  h.rows.splice(h.rows.findIndex(item => item.id === before[0]), 1); h.rows.push(row(999));
  h.loader.notifyChange({ source: 'products', event: 'DELETE' }); h.loader.notifyChange({ source: 'products', event: 'INSERT' });
  assert.deepEqual(ids(h.loader), before); assert.equal(h.pages.length, 1);
  await h.loader.refresh(); assert.equal(ids(h.loader)[0], id(999)); assert.ok(!ids(h.loader).includes(before[0]));
});
await test('eventos externos y subasta fuera de pantalla invalidan sin consultas', async () => {
  const h = harness(); await h.loader.reset({});
  for (const source of ['products', 'auctions']) for (const event of ['INSERT', 'UPDATE', 'DELETE']) assert.equal(h.loader.notifyChange({ source, event, id: id(99999) }), true);
  assert.equal(h.pages.length, 1); assert.equal(h.live.length, 0); assert.equal(h.loader.getState().resultsChanged, true);
  assert.equal(h.loader.notifyChange({ source: 'claims', event: 'UPDATE' }), false); assert.equal(h.loader.notifyChange(null), false);
});
await test('desconexión cancela páginas y precios; reconectar no consulta automáticamente', async () => {
  const item = auction(999), h = harness([item, ...Array.from({ length: 20 }, (_, i) => row(i + 10))]); await h.loader.reset({});
  const pageGate = h.nextPage(), pendingPage = h.loader.more(), liveGate = h.nextLive(), pendingLive = h.loader.refreshAuctions([item.id]); await tick();
  h.loader.connectionChanged(false);
  assert.equal(h.pages[1].signal.aborted, true); assert.equal(h.live[0].signal.aborted, true);
  assert.equal((await h.loader.more()).reason, 'disconnected'); assert.equal((await h.loader.refresh()).reason, 'disconnected');
  pageGate.resolve(h.response({}, h.pages[1].cursor)); liveGate.resolve(liveResult(item, 99, 9999));
  await Promise.all([pendingPage, pendingLive]); h.loader.connectionChanged(true); await tick();
  assert.equal(h.pages.length, 2); assert.equal(h.live.length, 1); assert.equal(h.loader.getState().items[0].price, item.price);
  assert.equal((await h.loader.more()).reason, 'results_changed');
  await h.loader.refresh(); assert.equal(h.loader.getState().connected, true); assert.equal(h.loader.getState().resultsChanged, false);
});
await test('avisos repetidos de conexión no multiplican solicitudes', async () => {
  const h = harness(); await h.loader.reset({});
  h.loader.connectionChanged(false); const count = h.states.length;
  for (let i = 0; i < 10; i++) h.loader.connectionChanged(false);
  assert.equal(h.states.length, count);
  h.loader.connectionChanged(true); for (let i = 0; i < 10; i++) h.loader.connectionChanged(true);
  assert.equal(h.pages.length, 1); assert.equal(h.live.length, 0);
});
await test('doble actualización comparte consulta desde el inicio y bloquea más', async () => {
  const h = harness(); await h.loader.reset({});
  const gate = h.nextPage(), one = h.loader.refresh(), two = h.loader.refresh(); assert.equal(one, two);
  assert.equal((await h.loader.more()).status, 'blocked'); await tick();
  assert.equal(h.pages.length, 2); assert.equal(h.pages[1].cursor, null); gate.resolve(h.response()); await one;
});
await test('pérdida de permiso en página retira datos en vez de conservarlos', async () => {
  const h = harness(); await h.loader.reset({}); const gate = h.nextPage(), pending = h.loader.more(); await tick();
  gate.resolve({ status: 'error', reason: 'restricted' }); await pending;
  assert.deepEqual(ids(h.loader), []); assert.equal(h.loader.getState().cursor, null);
  assert.equal(h.loader.getState().hasMore, false); assert.equal(h.loader.getState().error, 'restricted');
});
await test('pérdida de permiso al actualizar precio cancela página y retira datos', async () => {
  const item = auction(999), h = harness([item, ...Array.from({ length: 20 }, (_, i) => row(i + 10))]); await h.loader.reset({});
  const pageGate = h.nextPage(), pendingPage = h.loader.more(), gate = h.nextLive(), pendingLive = h.loader.refreshAuctions([item.id]); await tick();
  gate.resolve({ status: 'error', reason: 'restricted' }); await pendingLive;
  pageGate.resolve(h.response({}, h.pages[1].cursor)); await pendingPage;
  assert.deepEqual(ids(h.loader), []); assert.equal(h.pages[1].signal.aborted, true);
});
await test('desmontaje cancela e impide consultas/publicaciones posteriores', async () => {
  const h = harness(), gate = h.nextPage(), pending = h.loader.reset({}); await tick();
  h.loader.cancel(); const count = h.states.length;
  gate.resolve(h.response()); await pending; h.loader.notifyChange({ source: 'products', event: 'INSERT' });
  await h.loader.more(); await h.loader.refresh();
  assert.equal(h.pages.length, 1); assert.equal(h.states.length, count); assert.equal(h.loader.getState().status, 'loading');
});
await test('sin resultados es distinto de fallo; búsqueda pendiente de servidor no degrada', async () => {
  const h = harness([]); await h.loader.reset({}); assert.equal(h.loader.getState().status, 'ready'); assert.deepEqual(ids(h.loader), []);
  const gate = h.nextPage(), pending = h.loader.refresh(); await tick(); gate.reject(new TypeError('private')); await pending;
  assert.equal(h.loader.getState().error, 'connection'); assert.equal(h.loader.getState().resultsChanged, true);
  const prepared = createCatalogPageLoader(createCatalogPages(null), () => {});
  await prepared.reset({ query: 'PS' }); assert.equal(prepared.getState().status, 'unsupported');
  assert.deepEqual(prepared.getState().items, []);
});
await test('respuesta malformada o cursor estancado conserva páginas con error neutro', async () => {
  const h = harness(); await h.loader.reset({}); const before = ids(h.loader);
  let gate = h.nextPage(), pending = h.loader.more(); await tick();
  gate.resolve({ status: 'ready', items: Array(13).fill(row(999)), hasMore: true, cursor: {} }); await pending;
  assert.deepEqual(ids(h.loader), before); assert.equal(h.loader.getState().error, 'service');
  gate = h.nextPage(); pending = h.loader.more(); await tick();
  gate.resolve({ status: 'ready', items: [], hasMore: true, cursor: h.loader.getState().cursor }); await pending;
  assert.deepEqual(ids(h.loader), before); assert.equal(h.loader.getState().error, 'service');
});
await test('un lote de la lista anterior no modifica la primera página recién confirmada', async () => {
  const item = auction(999), h = harness([item]); await h.loader.reset({});
  const pageGate = h.nextPage(), refreshing = h.loader.refresh(); await tick();
  const liveGate = h.nextLive(), pricing = h.loader.refreshAuctions([item.id]); await tick();
  pageGate.resolve(h.response()); await refreshing;
  liveGate.resolve(liveResult(item, 50, 9999)); assert.equal((await pricing).status, 'cancelled');
  assert.equal(h.live[0].signal.aborted, true); assert.equal(h.loader.getState().items[0].price, item.price);
  assert.equal(h.loader.getState().resultsChanged, false);
});
await test('primera página con revisión idéntica contradictoria no reemplaza precios conocidos', async () => {
  const item = auction(999), h = harness([item]); await h.loader.reset({}); const before = h.loader.getState().items;
  const gate = h.nextPage(), pending = h.loader.refresh(); await tick();
  const result = h.response(); result.items[0].price = 1; gate.resolve(result);
  assert.deepEqual(await pending, { status: 'error', reason: 'service' });
  assert.deepEqual(h.loader.getState().items, before); assert.equal(h.loader.getState().resultsChanged, true);
});
await test('actualización fallida que sustituye la carga inicial no queda en loading', async () => {
  const h = harness(), firstGate = h.nextPage(), first = h.loader.reset({}); await tick();
  const gate = h.nextPage(), refreshed = h.loader.refresh(); await tick();
  gate.resolve({ status: 'error', reason: 'connection' }); await refreshed;
  firstGate.resolve(h.response()); await first;
  assert.equal(h.loader.getState().status, 'error'); assert.equal(h.loader.getState().refreshing, false);
  assert.equal(h.loader.getState().resultsChanged, true); assert.deepEqual(ids(h.loader), []);
});

console.log(`PASS: ${checks} grupos de controlador; solicitudes, identidades y eventos sintéticos. Sin SQL, red ni suscripciones reales.`);
