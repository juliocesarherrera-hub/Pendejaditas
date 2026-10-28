// Synthetic A/B/C/D identities only. No .env credentials, network requests or SQL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createPublicCollections, favoriteReferences, COLLECTION_PAGE_SIZE } from '../src/lib/public-collections.js';
import { createPublicCollectionLoader } from '../src/lib/public-collection-loader.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B, C, D] = [1, 2, 3, 4].map(id);
const time = '2026-10-28T10:00:00.123456+00:00';
const row = (n, owner = A, extra = {}) => ({ id: id(n), owner_id: owner, title: `Publicación ${n}`, description: 'Una publicación de prueba con datos sintéticos.', category: 'Consolas', condition: 'Buen estado', sale_type: 'fixed', price: 1000, area: 'Centro', image_path: `${owner}/example.webp`, created_at: time, updated_at: time, profiles: { display_name: `Vendedor ${owner}` }, ...extra });
const profiles = [A, B, C, D].map(value => ({ id: value, display_name: `Perfil ${value}`, bio: 'Perfil sintético.', city: 'Querétaro', created_at: time }));
let checks = 0;
const pass = label => { checks++; console.log(`OK colecciones ${checks}: ${label}`); };

function fixture(viewer, source, { auctions = [], hiddenProfiles = [], failTable = null, failHealth = false, failureStatus = 0 } = {}) {
  const requests = [];
  const client = {
    storage: { from: () => ({ getPublicUrl: path => ({ data: { publicUrl: `https://images.invalid/${path}` } }) }) },
    rpc(name) {
      assert.equal(name, 'auctions_health'); requests.push({ table: 'health' });
      const result = { data: { version: 5, server_time: '2026-10-28T10:00:01Z' }, error: failHealth ? { code: 'private_detail' } : null };
      return Object.assign(Promise.resolve(result), { abortSignal: () => Promise.resolve(result) });
    },
    from(table) {
      assert.ok(['products', 'profiles', 'auctions'].includes(table));
      const request = { table, filters: [], orders: [], max: Infinity, cursor: null, signal: null };
      const query = {
        select(columns) { request.columns = columns; return query; },
        eq(column, value) { request.filters.push([column, value]); return query; },
        in(column, values) { request.in = [column, values]; assert.ok(values.length <= COLLECTION_PAGE_SIZE); return query; },
        order(column, options) { request.orders.push([column, options]); return query; },
        limit(value) { request.max = value; return query; },
        or(value) { request.cursor = value; return query; },
        maybeSingle() { request.single = true; return query; },
        abortSignal(signal) { request.signal = signal; return query; },
        then(resolve, reject) {
          requests.push(request);
          if (failTable === table) return Promise.resolve({ data: null, error: { message: 'private network information' }, status: failureStatus }).then(resolve, reject);
          let data = (table === 'products' ? source : table === 'profiles' ? profiles : auctions).filter(value => !value.visibleTo || value.visibleTo.includes(viewer));
          if (table === 'profiles') data = data.filter(value => !hiddenProfiles.includes(value.id));
          for (const [column, value] of request.filters) data = data.filter(item => item[column] === value);
          if (request.in) data = data.filter(item => request.in[1].includes(item[request.in[0]]));
          if (request.cursor) {
            const match = request.cursor.match(/^created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\.([0-9a-f-]+)\)$/);
            assert.ok(match); assert.equal(match[1], match[2]);
            data = data.filter(item => item.created_at < match[1] || (item.created_at === match[1] && item.id < match[3]));
          }
          data = [...data].sort((a, b) => { for (const [column, { ascending }] of request.orders) { if (a[column] !== b[column]) return (a[column] < b[column] ? -1 : 1) * (ascending ? 1 : -1); } return 0; }).slice(0, request.max);
          return Promise.resolve({ data: request.single ? data[0] || null : data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { service: createPublicCollections(client), requests };
}

const source = [...Array.from({ length: 31 }, (_, n) => row(100 + n)), row(200, B), row(201, B, { visibleTo: [A] }), row(202, C, { visibleTo: [C] })];
for (const viewer of [A, B, C, D]) {
  const { service, requests } = fixture(viewer, source);
  const result = await service.seller({ sellerId: A });
  assert.equal(result.status, 'ready'); assert.equal(result.items.length, 12);
  assert.ok(result.items.every(product => product.ownerId === A));
  assert.equal(result.items[0].id, id(130)); assert.ok(result.hasMore);
  assert.equal(result.profile.id, A);
  assert.deepEqual(requests.find(request => request.table === 'products').orders, [['created_at', { ascending: false }], ['id', { ascending: false }]]);
  const saved = await service.favorites({ favorites: [id(100), id(200), id(201), id(202)] });
  const visible = [id(202), id(201), id(200), id(100)].filter(value => value !== id(202) || viewer === C).filter(value => value !== id(201) || viewer === A);
  assert.deepEqual(saved.items.map(product => product.id), visible);
  assert.equal(saved.unavailable, 4 - visible.length);
  pass(`identidad ${[A, B, C, D].indexOf(viewer) + 1} de A/B/C/D: vendedor directo y favoritos sujetos a la visibilidad del cliente inyectado`);
}
{
  const { service } = fixture(A, source);
  const first = await service.seller({ sellerId: A });
  assert.equal(first.cursor.createdAt, time);
  const inserted = row(999);
  const changed = fixture(A, [...source.filter(value => value.id !== first.items.at(-1).id), inserted]).service;
  const second = await changed.seller({ sellerId: A, cursor: first.cursor });
  const third = await changed.seller({ sellerId: A, cursor: second.cursor });
  const all = [...first.items, ...second.items, ...third.items];
  assert.equal(all.length, 31); assert.equal(new Set(all.map(product => product.id)).size, 31); assert.equal(third.hasMore, false);
  assert.equal(second.items[0].id, id(118)); assert.ok(!all.some(value => value.id === inserted.id));
  pass('cursor por fecha completa e ID: empates, inserción y eliminación entre páginas no saltan el resto de publicaciones');
}
{
  const refs = favoriteReferences(['ps5', id(100), id(100).toUpperCase(), null, 7, 'keyboard', id(101)]);
  assert.deepEqual(refs.ids, [id(101), id(100)]); assert.equal(refs.legacyCount, 4);
  const raw = ['ps5', id(999), id(100), id(101).toUpperCase()];
  const copy = JSON.stringify(raw), { service, requests } = fixture(B, source);
  const result = await service.favorites({ favorites: raw });
  assert.deepEqual(result.items.map(product => product.id), [id(101), id(100)]); assert.equal(result.unavailable, 1);
  assert.equal(JSON.stringify(raw), copy);
  assert.ok(requests.filter(value => value.in).every(value => value.in[1].every(value => value !== 'ps5')));
  pass('favoritos antiguos, mayúsculas, duplicados, eliminados e inválidos se conservan sin consultas inseguras ni limpieza automática');
}
{
  const { service, requests } = fixture(A, source);
  const favorites = source.filter(value => value.owner_id === A).map(value => value.id);
  const first = await service.favorites({ favorites });
  const second = await service.favorites({ favorites, cursor: first.cursor });
  const third = await service.favorites({ favorites, cursor: second.cursor });
  assert.deepEqual([...first.items, ...second.items, ...third.items].map(value => value.id), [...favorites].reverse());
  assert.ok(requests.every(request => request.table !== 'products' || request.in[1].length <= 12));
  pass('favoritos paginados en lotes acotados con orden estable del dispositivo');
}
{
  const { service, requests } = fixture(A, []);
  assert.equal((await service.seller({ sellerId: A })).status, 'ready');
  assert.deepEqual((await service.seller({ sellerId: A })).items, []);
  assert.equal((await fixture(A, [], { hiddenProfiles: [A] }).service.seller({ sellerId: A })).status, 'unavailable');
  assert.equal((await service.seller({ sellerId: 'invalid' })).status, 'invalid');
  const before = requests.length;
  assert.equal((await service.favorites({ favorites: ['ps5'] })).status, 'ready');
  assert.equal(requests.length, before);
  assert.equal((await service.seller({ sellerId: A, cursor: { id: id(100), createdAt: 'bad,filter' } })).status, 'error');
  pass('perfil sin publicaciones, perfil invisible, ID inválido y favoritos vacíos tienen resultados distintos y sin sondeos adicionales');
}
{
  const down = fixture(A, source, { failTable: 'products' }).service;
  for (const result of [await down.seller({ sellerId: A }), await down.favorites({ favorites: [id(100)] })]) {
    assert.equal(result.status, 'error'); assert.equal(result.reason, 'connection'); assert.ok(!JSON.stringify(result).includes('private'));
  }
  assert.equal((await createPublicCollections(null).seller({ sellerId: A })).reason, 'configuration');
  assert.equal((await fixture(D, source, { failTable: 'products', failureStatus: 403 }).service.seller({ sellerId: A })).reason, 'restricted');
  pass('errores de red y configuración no se convierten en listas vacías ni revelan detalles privados');
}
{
  const { service } = fixture(D, []);
  const result = await service.favorites({ favorites: Array.from({ length: 25 }, (_, n) => id(100 + n)) });
  assert.equal(result.status, 'ready'); assert.deepEqual(result.items, []); assert.equal(result.unavailable, 12); assert.ok(result.hasMore); assert.equal(result.cursor, 12);
  pass('un grupo de favoritos no disponibles conserva el cursor y permite seguir consultando otros grupos');
}
{
  const auction = row(500, A, { sale_type: 'auction' });
  const result = await fixture(A, [auction], { auctions: [{ id: id(501), product_id: auction.id, initial_price: 1000, highest_amount: 2300, bid_count: 3, ends_at: '2026-10-29T10:00:00Z', starts_at: time, status: 'active' }] }).service.favorites({ favorites: [auction.id] });
  assert.equal(result.items[0].price, 2300); assert.equal(result.items[0].auction.bid_count, 3); assert.ok(result.items[0].clock.epoch);
  assert.equal((await fixture(A, [auction]).service.favorites({ favorites: [auction.id] })).status, 'error');
  assert.equal((await fixture(A, [auction], { failHealth: true }).service.seller({ sellerId: A })).status, 'error');
  pass('subastas conservan precio actual, estado, pujas y reloj; datos incompletos no se presentan como precio fijo');
}

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const page = (number, extra = {}) => ({ status: 'ready', items: [{ id: id(number) }], hasMore: true, cursor: number, unavailable: 0, ...extra });
{
  const requests = [], events = [];
  const loader = createPublicCollectionLoader((query, options) => { const request = { ...deferred(), query, options }; requests.push(request); return request.promise; });
  const first = loader.reset({ key: 'seller-A-as-B' }, value => events.push(value)); await Promise.resolve();
  const second = loader.reset({ key: 'seller-C-as-D' }, value => events.push(value)); await Promise.resolve();
  requests[1].resolve(page(202)); await second;
  requests[0].resolve(page(100)); await first;
  assert.equal(requests[0].options.signal.aborted, true); assert.equal(events.at(-1).key, 'seller-C-as-D'); assert.equal(events.at(-1).items[0].id, id(202));
  pass('cambios rápidos de perfil e identidad descartan respuestas antiguas incluso si el transporte ignora AbortSignal');
}
{
  const events = [], pending = deferred(); let calls = 0;
  const loader = createPublicCollectionLoader(async () => { calls++; return calls === 1 ? page(100) : pending.promise; });
  const publish = state => events.push(state);
  await loader.reset({ key: 'favorites-A' }, publish);
  const one = loader.more(publish), two = loader.more(publish);
  assert.equal(one, two); await Promise.resolve(); assert.equal(calls, 2);
  pending.resolve({ status: 'error', reason: 'connection' }); await one;
  assert.equal(events.at(-1).items[0].id, id(100)); assert.equal(events.at(-1).cursor, 100); assert.equal(events.at(-1).error, 'connection');
  const stop = loader.more(publish); loader.cancel(); await stop;
  pass('doble clic comparte solicitud; fallos al paginar conservan productos y cursor; desmontaje invalida respuestas');
}
{
  let calls = 0;
  const loader = createPublicCollectionLoader(async () => { calls++; return page(100, { hasMore: false }); });
  const first = loader.reset({ key: 'same' }, () => {}); loader.cancel(); const second = loader.reset({ key: 'same' }, () => {});
  await Promise.all([first, second]); await loader.more(() => {});
  assert.equal(calls, 1);
  pass('montaje/limpieza/remontaje no duplica la primera consulta y la última página no vuelve a consultar');
}
{
  const requested = [], events = [];
  const loader = createPublicCollectionLoader(async (_query, { cursor }) => { requested.push(cursor); return requested.length === 1 ? page(100) : requested.length === 2 ? { status: 'error', reason: 'connection' } : page(101, { hasMore: false }); });
  const publish = value => events.push(value);
  await loader.reset({ key: 'retry-page' }, publish); await loader.more(publish); await loader.more(publish);
  assert.deepEqual(requested, [undefined, 100, 100]); assert.deepEqual(events.at(-1).items.map(value => value.id), [id(100), id(101)]); assert.equal(events.at(-1).hasMore, false);
  pass('reintentar una página fallida utiliza el mismo cursor y conserva las publicaciones ya recibidas');
}

globalThis.window = { location: { hash: '', search: '' } };
globalThis.__publicCollectionFixture = {};
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'collections-test-hook', enforce: 'pre', transform(_source, file) { if (file.replaceAll('\\', '/').split('?')[0].endsWith('/src/hooks/usePublicCollection.js')) return 'export const usePublicCollection = () => globalThis.__publicCollectionFixture;'; } }] });
try {
  const [{ ProfilePage }, { HomePage }, { CollectionFeedback }] = await Promise.all([server.ssrLoadModule('/src/pages/ProfilePage.jsx'), server.ssrLoadModule('/src/pages/HomePage.jsx'), server.ssrLoadModule('/src/components/CollectionFeedback.jsx')]);
  const render = (component, props) => renderToStaticMarkup(createElement(component, props)), noop = () => {};
  const product = (await fixture(A, source).service.seller({ sellerId: A })).items[0];
  const state = { key: 'render', status: 'ready', profile: profiles[0], items: [product], hasMore: true, cursor: null, unavailable: 1, loadingMore: false, error: null, refresh: noop, loadMore: noop };
  globalThis.__publicCollectionFixture = state;
  const shared = { favorites: [product.id], toggleFavorite: noop, openProduct: noop, navigate: noop, onChange: noop, onNotice: noop };
  const owner = render(ProfilePage, { ...shared, profileId: A, user: { id: A }, products: [], favoritesCount: 0 });
  assert.ok(owner.includes(product.title)); assert.ok(owner.includes('Publicaciones consultadas')); assert.ok(owner.includes('Cargar más publicaciones')); assert.ok(owner.includes('Confirmar eliminación') === false); assert.ok(owner.includes('Eliminar'));
  const visitor = render(ProfilePage, { ...shared, profileId: A, user: { id: D }, products: [] });
  assert.ok(visitor.includes(product.title)); assert.ok(!visitor.includes('Eliminar')); assert.ok(!visitor.includes('Editar mi perfil'));
  const saved = render(HomePage, { ...shared, mode: 'saved', products: [{ ...product, title: 'DO_NOT_USE_CATALOG' }] });
  assert.ok(saved.includes(product.title)); assert.ok(!saved.includes('DO_NOT_USE_CATALOG')); assert.ok(saved.includes('Consultar siguientes guardados')); assert.ok(saved.includes('no están disponibles para tu sesión'));
  globalThis.__publicCollectionFixture = { ...state, status: 'error', reason: 'connection', items: [], profile: undefined };
  const offline = render(ProfilePage, { ...shared, profileId: A, user: { id: A } });
  assert.ok(offline.includes('No se pudo consultar el perfil')); assert.ok(offline.includes('Reintentar consulta')); assert.ok(!offline.includes('usuario no tiene'));
  assert.ok(render(CollectionFeedback, { state: { ...state, error: 'connection' } }).includes('role="alert"'));
  const profileSource = await readFile('src/pages/ProfilePage.jsx', 'utf8');
  assert.ok(profileSource.includes('setEditing(product)')); assert.ok(profileSource.includes('<PublishPage')); assert.ok(!profileSource.includes('products.filter'));
  pass('render real: perfiles y favoritos ignoran el catálogo, distinguen fallos y paginación, mantienen controles de propietario y reutilizan edición');
} finally { await server.close(); delete globalThis.__publicCollectionFixture; }
console.log(`PASS: ${checks} grupos de pruebas de perfiles/favoritos. A/B/C/D simulados; RLS remoto pendiente.`);
