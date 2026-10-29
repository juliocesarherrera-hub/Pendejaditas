// Pure adapter tests: injected transport, no SDK credentials or remote calls.
import assert from 'node:assert/strict';
import { createCatalogRpcPages, catalogRpcQuery, normalizeCatalogSearch } from '../src/lib/catalog-rpc.js';
import { createCatalogReference, prepareSearch } from './support/catalog-contract-reference.mjs';
import { unicodeCorpus, catalogFixtures, fixtureId } from './support/catalog-postgres-corpus.mjs';
import { createCatalogPageLoader } from '../src/lib/catalog-page-loader.js';

let checks = 0;
async function test(label, fn) { await fn(); checks++; console.log(`OK adaptador catálogo ${checks}: ${label}`); }
const rows = catalogFixtures(13).map((row, i) => ({ ...row, image_path: `${row.owner_id}/${fixtureId(i + 50000)}.webp` }));
const reference = createCatalogReference({ readVisibleRows: () => rows, serverTime: () => '2026-10-28T10:00:00.123456Z' });
function payload(request = {}) { const data = reference.page(request); delete data.reference_only; data.consistency = 'statement_snapshot_only'; return data; }
function fake(response = null, options = {}) {
  const calls = [];
  const client = { rpc(name, args) {
    calls.push({ name, args });
    const call = Promise.resolve().then(() => {
      if (options.throw) throw new TypeError('synthetic-private');
      return response ?? { data: payload(args.p_request), error: null };
    });
    call.abortSignal = signal => { calls.at(-1).signal = signal; return call; }; return call;
  }, storage: { from: bucket => { assert.equal(bucket, 'product-images'); return { getPublicUrl: path => ({ data: { publicUrl: `https://images.invalid/${path}` } }) }; } } };
  return { calls, service: createCatalogRpcPages(client) };
}
await test('normalización UX coincide con referencia en el corpus sin ser autoridad del servidor', async () => {
  for (const input of unicodeCorpus) {
    const expected = prepareSearch(input);
    if (expected.ok) assert.equal(normalizeCatalogSearch(input), expected.normalized);
  }
  assert.notEqual(normalizeCatalogSearch('niño'), normalizeCatalogSearch('nino'));
});
await test('traduce filtros UI; sesión/identidad nunca se envían como autorización', async () => {
  const f = fake(); const result = await f.service.page({ query: 'POKÉMON', type: 'auction', sort: 'price_desc', min: '100', max: '3000', sessionKey: 'local-A' });
  assert.equal(result.status, 'ready'); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].name, 'catalog_page_v1');
  assert.deepEqual(f.calls[0].args, { p_request: { category: null, sale_type: 'auction', sort: 'price_desc', search: 'POKÉMON', min_price: 100, max_price: 3000, page_size: 12, cursor: null } });
  assert.notEqual(catalogRpcQuery({ sessionKey: 'A' }).key, catalogRpcQuery({ sessionKey: 'B' }).key);
});
await test('fragmentos de dos caracteres y signos se envían sin expandir ni comodines del cliente', async () => {
  for (const query of ['PS', 'PC', 'VR', 'DS', '%_', '!!', 'a_b']) {
    const f = fake(); assert.equal((await f.service.page({ query })).status, 'ready'); assert.equal(f.calls[0].args.p_request.search, query);
  }
});
await test('entrada inválida o un carácter no hace peticiones', async () => {
  const f = fake();
  for (const input of [null, [], { query: 'P' }, { query: 'n\u0303' }, { query: 'a'.repeat(91) }, { query: '\ud800' }, { min: '-1' }, { min: 50, max: 1 }, { sort: 'private' }, { p_role: 'admin' }]) assert.equal((await f.service.page(input)).status, 'invalid');
  const circular = { v: 1, fingerprint: 'a'.repeat(64) }; circular.position = circular;
  assert.equal((await f.service.page({}, { cursor: circular })).reason, 'invalid_cursor');
  assert.equal(f.calls.length, 0);
});
await test('DTO público se convierte a tarjetas sin usar el catálogo global', async () => {
  const f = fake(), result = await f.service.page();
  assert.equal(result.status, 'ready'); assert.equal(result.items.length, 12); assert.equal(result.hasMore, true);
  assert.equal(result.cursor.position.created_at.length, 27);
  assert.ok(result.items.every(row => row.image.startsWith('https://images.invalid/')));
  const auction = result.items.find(row => row.auction);
  assert.equal(auction.price, auction.auction.highest_amount ?? auction.auction.initial_price);
});
await test('lista vacía exitosa no se confunde con errores', async () => {
  assert.equal((await fake().service.page({ query: 'ZZ' })).status, 'ready');
  assert.deepEqual((await fake().service.page({ query: 'ZZ' })).items, []);
  assert.deepEqual(await createCatalogRpcPages(null).page(), { status: 'error', reason: 'configuration' });
});
await test('página siguiente usa cursor opaco exacto; sin consultas por tarjeta', async () => {
  const f = fake(), first = await f.service.page();
  const second = await f.service.page({}, { cursor: first.cursor });
  assert.equal(second.status, 'ready'); assert.equal(second.items.length, 1);
  assert.deepEqual(f.calls[1].args.p_request.cursor, first.cursor);
  assert.equal(f.calls.length, 2);
});
await test('cancelación antes/después del transporte descarta datos', async () => {
  const f = fake(), controller = new AbortController(); controller.abort();
  assert.equal((await f.service.page({}, { signal: controller.signal })).status, 'cancelled'); assert.equal(f.calls.length, 0);
  const second = new AbortController(), pending = f.service.page({}, { signal: second.signal }); second.abort();
  assert.equal((await pending).status, 'cancelled'); assert.equal(f.calls[0].signal, second.signal);
});
await test('red, permisos, timeout y RPC ausente permanecen separados', async () => {
  const cases = [['57014', 'timeout'], ['42501', 'restricted'], ['PGRST301', 'restricted'], ['PGRST202', 'not_installed'], ['42P01', 'not_installed'], ['XX000', 'service']];
  for (const [code, reason] of cases) {
    const f = fake({ data: null, error: { code, message: 'synthetic-private' }, status: 400 });
    assert.deepEqual(await f.service.page(), { status: 'error', reason }); assert.equal(f.calls.length, 1);
  }
  assert.deepEqual(await fake(null, { throw: true }).service.page(), { status: 'error', reason: 'connection' });
});
await test('rechazos de negocio HTTP 200 no son catálogo vacío o éxito', async () => {
  for (const code of ['invalid_request', 'invalid_cursor', 'query_too_short']) assert.deepEqual(await fake({ data: { ok: false, code }, error: null }).service.page(), { status: 'invalid', reason: code });
  assert.deepEqual(await fake({ data: { ok: false, code: 'unavailable' }, error: null }).service.page(), { status: 'error', reason: 'service' });
});
await test('respuestas incompatibles, privadas o financieras se rechazan', async () => {
  const mutators = [data => { data.items[0].email = 'synthetic-private'; }, data => { data.payments_enabled = true; },
    data => { data.cash_enabled = true; }, data => { data.items.push(data.items[0]); }, data => { data.page.returned = 0; },
    data => { data.normalization = 'other'; }, data => { data.page.next_cursor.position.id = fixtureId(999); },
    data => { data.items[0].image_path = '../private.pdf'; }, data => { data.server_time = 'invalid'; },
    data => { data.items[0].auction.highest_bid_id = 'synthetic-private'; }];
  for (const change of mutators) { const data = payload(); change(data); assert.deepEqual(await fake({ data, error: null }).service.page(), { status: 'error', reason: 'service' }); }
  assert.deepEqual(await fake({ data: null, error: null }).service.page(), { status: 'error', reason: 'service' });
});
await test('controlador preparado admite paginación RPC por precio mixto sin cambiar UI', async () => {
  const f = fake(), loader = createCatalogPageLoader(f.service, () => {});
  await loader.reset({ sort: 'price_asc' }); assert.equal(loader.getState().status, 'ready');
  await loader.more(); assert.equal(loader.getState().items.length, 13); assert.equal(f.calls.length, 2);
  loader.markChanged(); assert.equal((await loader.more()).reason, 'results_changed');
  await loader.refresh(); assert.equal(loader.getState().items.length, 12); loader.cancel();
});
console.log(`PASS: ${checks} grupos puros del adaptador; no conexión ni integración visible.`);
