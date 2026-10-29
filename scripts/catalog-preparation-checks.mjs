// Synthetic clients only. No credentials, SQL, Storage uploads or remote calls.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createCatalogPages, catalogQuery, CATALOG_PAGE_SIZE } from '../src/lib/catalog-page.js';
import { createCatalogPageLoader } from '../src/lib/catalog-page-loader.js';
import { createEditableProductLookup } from '../src/lib/editable-product.js';
import { createProductDetailLoader } from '../src/lib/product-detail.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B, C, D] = [1, 2, 3, 4].map(id);
const time = '2026-10-28T10:00:00.123456+00:00';
const product = (n, extra = {}) => ({ id: id(n), owner_id: A, title: `Artículo ${n}`, description: 'Publicación sintética para pruebas locales.', category: 'Consolas', condition: 'Buen estado', sale_type: 'fixed', price: 100 + n % 5, area: 'Centro', image_path: `${A}/fixture.webp`, created_at: time, updated_at: time, profiles: { display_name: 'Perfil sintético' }, ...extra });
const auction = (row, revision = 1, highest = null) => ({ id: id(900000 + Number(row.id.slice(-6))), product_id: row.id, initial_price: row.price, highest_amount: highest, bid_count: highest ? revision : 0, starts_at: time, ends_at: '2026-11-01T12:00:00Z', revision, status: 'active' });
const noop = () => {};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let checks = 0;
const pass = label => { checks++; console.log(`OK preparación catálogo ${checks}: ${label}`); };
function fixture(source = [], options = {}) {
  const calls = [];
  const client = {
    storage: { from: bucket => { assert.equal(bucket, 'product-images'); return { getPublicUrl: path => ({ data: { publicUrl: `https://images.invalid/${path}` } }) }; } },
    rpc(name) {
      assert.equal(name, 'auctions_health'); calls.push({ table: 'health' });
      const response = { data: { version: 5, server_time: '2026-10-28T10:00:01Z' }, error: options.failHealth ? { message: 'private' } : null };
      const promise = Promise.resolve(response); promise.abortSignal = () => promise; return promise;
    },
    from(table) {
      assert.ok(['products', 'auctions'].includes(table));
      const call = { table, filters: [], orders: [], limit: null, signal: null };
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(column, value) { call.filters.push(['eq', column, value]); return query; },
        gte(column, value) { call.filters.push(['gte', column, value]); return query; },
        lte(column, value) { call.filters.push(['lte', column, value]); return query; },
        in(column, values) { call.filters.push(['in', column, values]); assert.ok(values.length <= 12); return query; },
        order(column, options) { call.orders.push([column, options.ascending]); return query; },
        limit(value) { call.limit = value; assert.ok(value <= 13); return query; },
        or(value) { call.cursor = value; return query; },
        maybeSingle() { call.single = true; return query; },
        abortSignal(signal) { call.signal = signal; return query; },
        then(resolve, reject) {
          calls.push(call);
          if (options.throwNetwork) return Promise.reject(new TypeError('private URL')).then(resolve, reject);
          if (options.failTable === table) return Promise.resolve({ data: null, error: { code: options.code, message: 'private details' }, status: options.status ?? 0 }).then(resolve, reject);
          let rows = (table === 'products' ? source : options.auctions || []).filter(row => !row.visibleTo || row.visibleTo.includes(options.viewer));
          for (const [op, column, value] of call.filters) rows = rows.filter(row => op === 'eq' ? row[column] === value : op === 'gte' ? Number(row[column]) >= value : op === 'lte' ? Number(row[column]) <= value : value.includes(row[column]));
          if (call.cursor) {
            const date = call.cursor.match(/^created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\.([0-9a-f-]+)\)$/);
            const price = call.cursor.match(/^price\.(gt|lt)\.(\d+),and\(price\.eq\.(\d+),id\.(gt|lt)\.([0-9a-f-]+)\)$/);
            assert.ok(date || price, 'Only validated cursor grammar');
            if (date) { assert.equal(date[1], date[2]); rows = rows.filter(row => row.created_at < date[1] || (row.created_at === date[1] && row.id < date[3])); }
            else { assert.equal(price[1], price[4]); assert.equal(price[2], price[3]); const before = (a, b) => price[1] === 'gt' ? a > b : a < b; rows = rows.filter(row => before(Number(row.price), Number(price[2])) || (Number(row.price) === Number(price[2]) && before(row.id, price[5]))); }
          }
          rows = [...rows].sort((a, b) => { for (const [column, ascending] of call.orders) if (a[column] !== b[column]) return (a[column] < b[column] ? -1 : 1) * (ascending ? 1 : -1); return 0; });
          if (call.limit !== null) rows = rows.slice(0, call.limit);
          // A real HTTP response owns its objects; later fixture mutations must
          // not mutate a revision that the controller has already accepted.
          return Promise.resolve({ data: structuredClone(call.single ? rows[0] || null : rows), error: null }).then(resolve, reject);
        },
      }; return query;
    },
  };
  return { client, calls, service: createCatalogPages(client), edit: createEditableProductLookup(client) };
}
async function all(service, input = {}) {
  let cursor = null, result, items = [], hops = 0;
  do {
    result = await service.page(input, { cursor }); assert.equal(result.status, 'ready');
    assert.ok(result.items.length <= CATALOG_PAGE_SIZE); items.push(...result.items); cursor = result.cursor;
    assert.ok(++hops < 1000);
  } while (result.hasMore);
  return items;
}
for (const count of [0, 1, 12, 13, 100, 1001]) {
  const rows = Array.from({ length: count }, (_, n) => product(100 + n));
  const f = fixture(rows), items = await all(f.service);
  assert.deepEqual(items.map(row => row.id), rows.map(row => row.id).reverse());
  assert.equal(new Set(items.map(row => row.id)).size, count);
  assert.equal(f.calls.length, Math.max(1, Math.ceil(count / 12)));
  for (const call of f.calls) { assert.equal(call.limit, 13); assert.deepEqual(call.orders, [['created_at', false], ['id', false]]); }
  pass(`${count} publicaciones: recorrido completo y acotado, sin IDs repetidos u omitidos en datos estables`);
}
{
  const rows = Array.from({ length: 110 }, (_, n) => product(200 + n, { category: n % 2 ? 'Consolas' : 'Videojuegos', sale_type: n % 3 ? 'offers' : 'fixed' }));
  for (const sort of ['recent', 'price_asc', 'price_desc']) {
    const f = fixture(rows), input = { category: 'Videojuegos', type: 'offers', min: '101', max: '103', sort };
    const expected = rows.filter(row => row.category === input.category && row.sale_type === input.type && row.price >= 101 && row.price <= 103).sort((a, b) => sort === 'recent' ? b.id.localeCompare(a.id) : ((a.price - b.price) || a.id.localeCompare(b.id)) * (sort === 'price_asc' ? 1 : -1));
    assert.deepEqual((await all(f.service, input)).map(row => row.id), expected.map(row => row.id));
    assert.ok(f.calls.every(call => call.filters.length === 4));
  }
  pass('categoría, modalidad y precio se aplican en el servidor antes de paginar; orden global fijo/negociable con empates');
}
{
  const f = fixture([product(100)]);
  for (const input of [{ query: 'TECLADO MECANICO' }, { query: 'ñ' }, { sort: 'price_asc' }, { min: 1 }, { type: 'auction', sort: 'price_desc' }]) assert.equal((await f.service.page(input)).status, 'unsupported');
  for (const input of [null, [], { unexpectedFilter: 'ignored?' }, { category: 'invalid' }, { type: 'wallet' }, { sort: 'SQL' }, { min: -1 }, { min: 'NaN' }, { min: 20, max: 10 }, { query: 'x'.repeat(91) }]) assert.equal((await f.service.page(input)).status, 'invalid');
  assert.equal(f.calls.length, 0);
  const controller = createCatalogPageLoader(f.service, noop); await controller.reset(null); assert.equal(controller.getState().status, 'invalid'); assert.equal(f.calls.length, 0);
  assert.equal((await createCatalogPages(null).page()).reason, 'configuration');
  pass('contratos no soportados o inválidos no consultan ni degradan búsqueda con acentos o precio mixto a filtros locales');
}
{
  const f = fixture(Array.from({ length: 14 }, (_, n) => product(100 + n)));
  const first = await f.service.page({ sessionKey: A });
  assert.equal(first.cursor.createdAt, time);
  const calls = f.calls.length;
  for (const cursor of [{ ...first.cursor, id: 'invalid' }, { ...first.cursor, createdAt: time + ',SQL' }, { ...first.cursor, createdAt: 'invalid' }]) assert.equal((await f.service.page({ sessionKey: A }, { cursor })).status, 'invalid');
  assert.equal((await f.service.page({ sessionKey: B }, { cursor: first.cursor })).status, 'invalid');
  assert.equal((await f.service.page({ category: 'Consolas', sessionKey: A }, { cursor: first.cursor })).status, 'invalid');
  assert.equal(f.calls.length, calls);
  const later = fixture([...Array.from({ length: 14 }, (_, n) => product(100 + n)).filter(row => row.id !== first.cursor.id), product(999)]);
  const second = await later.service.page({ sessionKey: A }, { cursor: first.cursor });
  assert.deepEqual(second.items.map(row => row.id), [id(101), id(100)]);
  pass('cursor conserva microsegundos, no cruza filtros/sesiones y resiste inserción/eliminación en el límite');
}
for (const viewer of [A, B, C, D]) {
  const f = fixture([product(101, { visibleTo: [A] }), product(102, { visibleTo: [B] }), product(103)], { viewer });
  const items = await all(f.service, { sessionKey: viewer });
  assert.deepEqual(items.map(row => row.id), viewer === A ? [id(103), id(101)] : viewer === B ? [id(103), id(102)] : [id(103)]);
  pass(`sesión sintética ${[A, B, C, D].indexOf(viewer) + 1}: solo filas visibles por el cliente inyectado; no sustituye RLS real`);
}
{
  const rows = Array.from({ length: 13 }, (_, n) => product(200 + n, { sale_type: 'auction' }));
  const f = fixture(rows, { auctions: rows.map(row => auction(row, 2, 2300)) });
  const result = await f.service.page({ type: 'auction' });
  assert.equal(result.items.length, 12); assert.ok(result.items.every(row => row.price === 2300 && row.auction.revision === 2));
  assert.equal(f.calls.length, 3); assert.equal(f.calls.find(call => call.table === 'auctions').filters[0][2].length, 12);
  assert.ok(!f.calls.some(call => call.rpc === 'auction_snapshot'));
  const initial = await fixture([rows[0]], { auctions: [auction(rows[0])] }).service.page(); assert.equal(initial.items[0].price, rows[0].price);
  assert.equal((await fixture(rows, { auctions: [] }).service.page()).status, 'error');
  assert.equal((await fixture(rows, { auctions: rows.map(row => auction(row)), failHealth: true }).service.page()).status, 'error');
  const abort = new AbortController(); abort.abort(); const cancelled = fixture(rows); assert.equal((await cancelled.service.page({}, { signal: abort.signal })).status, 'error'); assert.equal(cancelled.calls.length, 0);
  assert.equal((await f.service.auctionUpdates(Array(13).fill(id(200)))).status, 'invalid');
  pass('subastas: un lote máximo de 12, precio actual/inicial correctos, reloj verificado y fallo seguro sin cierres ni consultas por tarjeta');
}
{
  const network = await fixture([], { throwNetwork: true }).service.page(); assert.equal(network.reason, 'connection');
  const denied = await fixture([], { failTable: 'products', status: 403, code: '42501' }).service.page(); assert.equal(denied.reason, 'restricted');
  assert.ok(!JSON.stringify([network, denied]).includes('private'));
  const duplicate = await fixture([product(100), product(100)]).service.page(); assert.equal(duplicate.status, 'error');
  pass('red, permisos y respuestas inválidas nunca se convierten en listas vacías ni muestran detalles privados');
}
{
  const rows = Array.from({ length: 30 }, (_, n) => product(300 + n)), f = fixture(rows), realPage = f.service.page.bind(f.service);
  let count = 0; f.service.page = async (...args) => ++count === 2 ? { status: 'error', reason: 'connection' } : realPage(...args);
  const loader = createCatalogPageLoader(f.service, noop); await loader.reset({});
  const first = loader.getState(), cursor = first.cursor;
  await loader.more(); assert.deepEqual(loader.getState().items, first.items); assert.deepEqual(loader.getState().cursor, cursor); assert.equal(loader.getState().error, 'connection');
  const one = loader.more(), two = loader.more(); assert.equal(one, two); await one;
  assert.equal(loader.getState().items.length, 24); assert.equal(new Set(loader.getState().items.map(row => row.id)).size, 24);
  loader.markChanged(); assert.equal(loader.getState().resultsChanged, true);
  await loader.refresh(); assert.equal(loader.getState().items.length, 12); assert.equal(loader.getState().resultsChanged, false);
  pass('fallo al agregar conserva páginas y cursor; doble clic comparte consulta; actualizar reinicia y limpia aviso');
}
{
  const old = deferred(), newer = fixture([product(701)]).service, signals = [];
  const loader = createCatalogPageLoader({ page: (input, options) => { signals.push(options.signal); return input.sessionKey === A ? old.promise : newer.page(input, options); } }, noop);
  const pending = loader.reset({ sessionKey: A }); await Promise.resolve();
  await loader.reset({ sessionKey: B }); old.resolve({ status: 'ready', items: [{ id: id(999) }], hasMore: false, unavailable: 0 }); await pending;
  assert.equal(signals[0].aborted, true); assert.deepEqual(loader.getState().items.map(row => row.id), [id(701)]);
  const late = deferred(); const cancelled = createCatalogPageLoader({ page: () => late.promise }, noop);
  const p = cancelled.reset({}); await Promise.resolve(); cancelled.cancel(); late.resolve({ status: 'ready', items: [], hasMore: false }); await p;
  assert.equal(cancelled.getState().status, 'loading');
  pass('cambios de sesión y desmontaje abortan y descartan respuestas antiguas aunque el transporte no cancele');
}
{
  const rows = Array.from({ length: 14 }, (_, n) => product(400 + n, { sale_type: 'auction' }));
  const auctions = rows.map(row => auction(row)), f = fixture(rows, { auctions });
  const loader = createCatalogPageLoader(f.service, noop); await loader.reset({});
  const order = loader.getState().items.map(row => row.id), first = order[0];
  const record = auctions.find(row => row.product_id === first); record.highest_amount = 3000; record.revision = 2;
  await loader.refreshAuctions([first]); assert.equal(loader.getState().items[0].price, 3000); assert.deepEqual(loader.getState().items.map(row => row.id), order); assert.equal(loader.getState().resultsChanged, true);
  assert.equal((await loader.more()).reason, 'results_changed'); assert.equal(loader.getState().items[0].price, 3000); assert.equal(loader.getState().items.length, 12);
  record.highest_amount = null; record.revision = 1; await loader.refreshAuctions([first]); assert.equal(loader.getState().items[0].price, 3000);
  assert.equal((await loader.refreshAuctions([id(999)])).status, 'invalid');
  await loader.refresh(); assert.equal(loader.getState().resultsChanged, true); assert.equal(loader.getState().items[0].price, 3000);
  record.highest_amount = 3000; record.revision = 3;
  await loader.refresh(); assert.equal(loader.getState().items.length, 12); assert.equal(loader.getState().resultsChanged, false);
  pass('actualizar pujas cambia precios en su sitio, pausa paginación con aviso e ignora revisiones antiguas');
}
{
  const row = product(600, { sale_type: 'auction' }), f = fixture([row], { auctions: [auction(row)] });
  const gate = deferred(), signal = [];
  const loader = createCatalogPageLoader({ ...f.service, auctionUpdates: (_ids, options) => { signal.push(options.signal); return gate.promise; } }, noop);
  assert.equal((await loader.refreshAuctions([])).status, 'invalid');
  await loader.reset({});
  const one = loader.refreshAuctions([row.id]); await Promise.resolve();
  assert.equal(one, loader.refreshAuctions([row.id])); assert.equal((await loader.refreshAuctions([])).status, 'busy');
  await loader.refresh(); gate.resolve({ status: 'ready', updates: [{ id: row.id, auction: auction(row, 4, 9999), price: 9999 }] }); await one;
  assert.equal(signal[0].aborted, true); assert.equal(loader.getState().items[0].price, row.price);
  const failing = createCatalogPageLoader({ ...f.service, auctionUpdates: async () => ({ status: 'error', reason: 'connection' }) }, noop);
  await failing.reset({}); await failing.refreshAuctions([row.id]);
  assert.equal(failing.getState().items[0].price, row.price); assert.equal(failing.getState().liveError, 'connection');
  pass('lotes de actualización coalescidos, busy explícito, errores sin perder precios y respuestas anteriores descartadas al reiniciar');
}
{
  const row = product(500), f = fixture([row, product(501, { owner_id: B }), product(502, { sale_type: 'auction' })]);
  const edited = await f.edit(row.id, A); assert.equal(edited.status, 'ready'); assert.equal(edited.product.updatedAt, time); assert.ok(edited.product.image.endsWith(row.image_path));
  assert.deepEqual(f.calls[0].filters, [['eq', 'id', row.id], ['eq', 'owner_id', A]]);
  assert.equal((await f.edit(id(501), A)).status, 'unavailable'); assert.equal((await f.edit(id(502), A)).status, 'blocked'); assert.equal((await f.edit(id(999), A)).status, 'unavailable');
  const before = f.calls.length;
  assert.equal((await f.edit('invalid', A)).status, 'invalid'); assert.equal((await f.edit(row.id, null)).status, 'restricted'); assert.equal(f.calls.length, before);
  assert.equal((await fixture([], { throwNetwork: true }).edit(row.id, A)).reason, 'connection');
  assert.equal((await fixture([], { failTable: 'products', code: '42501', status: 403 }).edit(row.id, A)).status, 'restricted');
  const ownUpper = await f.edit(row.id.toUpperCase(), A.toUpperCase()); assert.equal(ownUpper.status, 'ready');
  const c = new AbortController(); c.abort(); const noCall = fixture([row]); await noCall.edit(row.id, A, { signal: c.signal }); assert.equal(noCall.calls.length, 0);
  pass('edición propia por ID fuera del catálogo, fotografía/updated_at intactos; ajenos, subastas, eliminados, inválidos y red separados');
}
{
  const old = deferred(); const loader = createProductDetailLoader((key, options) => JSON.parse(key)[1] === A ? old.promise : fixture([product(701, { owner_id: B })]).edit(id(701), B, options));
  let result; const one = loader.load(JSON.stringify([id(700), A]), value => { result = value; }); await Promise.resolve();
  await loader.load(JSON.stringify([id(701), B]), value => { result = value; }); old.resolve({ status: 'ready', product: { id: id(700) } }); await one;
  assert.equal(result.product.id, id(701));
  pass('loader de edición descarta el resultado del ID/sesión anterior');
}

globalThis.window = { location: { hash: '', search: '' } };
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { EditProductState } = await server.ssrLoadModule('/src/pages/EditProductPage.jsx');
  const render = state => renderToStaticMarkup(createElement(EditProductState, { state, user: { id: A }, navigate: noop, onPublish: noop }));
  const row = product(800), state = await fixture([row]).edit(row.id, A), form = render(state);
  assert.ok(form.includes('Edita tu publicación')); assert.ok(form.includes(row.title)); assert.ok(form.includes('Guardar cambios')); assert.ok(form.includes(row.image_path));
  assert.ok(!render({ status: 'ready', product: { ...state.product, ownerId: B } }).includes('Guardar cambios'));
  for (const status of ['loading', 'invalid', 'unavailable', 'restricted', 'blocked', 'error']) assert.ok(!render({ status, reason: 'connection', refresh: noop }).includes('Guardar cambios'));
  assert.ok(render({ status: 'error', reason: 'connection', refresh: noop }).includes('Esto no indica'));
  const app = await readFile('src/App.jsx', 'utf8'); assert.ok(app.includes('<EditProductPage')); assert.ok(!app.includes('catalog.products.find'));
  const visible = await readFile('src/hooks/useMarketplace.js', 'utf8'); assert.ok(!visible.includes('catalog-page'));
  const saving = await readFile('src/lib/marketplace-core.js', 'utf8'); assert.ok(saving.includes("eq('updated_at', existing.updatedAt)")); assert.ok(saving.includes('existing.ownerId !== user.id'));
  const hook = await readFile('src/hooks/useEditableProduct.js', 'utf8'); assert.ok(!hook.includes('setInterval('));
  assert.equal(catalogQuery({}).status, 'supported');
  pass('render real de edición y estados; controles existentes de guardado, catálogo visible intacto y sin refrescos que borren borradores');
} finally { await server.close(); }
console.log(`PASS: ${checks} grupos; datos/identidades/red sintéticos, sin RLS remoto ni ejecución SQL.`);
