// Synthetic SDK clients and deferred promises only. No .env, network or SQL execution.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProductLookup, createProductDetailLoader, initialProductDetail } from '../src/lib/product-detail.js';
import { productColumns } from '../src/lib/marketplace-core.js';
import { parseRoute, productRoute } from '../src/utils/navigation.js';

const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const row = { id: A, owner_id: B, title: 'Publicación fuera del lote del catálogo', description: 'Solo una prueba de consulta independiente.', category: 'Consolas', condition: 'Buen estado', sale_type: 'fixed', price: 1000, area: 'Centro', image_path: `${B}/fixture.webp`, profiles: { display_name: 'Vendedor de prueba' } };
const auction = { id: B, product_id: A, initial_price: 1000, highest_amount: 2300, bid_count: 3, ends_at: '2026-11-01T15:00:00Z', starts_at: '2026-11-01T12:00:00Z', status: 'active' };
const health = { data: { version: 5, server_time: '2026-11-01T12:00:01Z' }, error: null };
let checks = 0;
const pass = label => { checks++; console.log(`OK product detail ${checks}: ${label}`); };

function fixture({ productResponse = { data: row, error: null }, auctionResponse = { data: auction, error: null }, healthResponse = health, reject = null, onProduct = () => {} } = {}) {
  const calls = [];
  const withSignal = promise => Object.assign(promise, { abortSignal(signal) { calls.push({ action: 'signal', signal }); return promise; } });
  const client = {
    storage: { from(bucket) { assert.equal(bucket, 'product-images'); return { getPublicUrl(path) { return { data: { publicUrl: `https://images.example.invalid/${path}` } }; } }; } },
    from(table) {
      assert.ok(['products', 'auctions'].includes(table));
      const call = { table };
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(column, value) { call.column = column; call.value = value; return query; },
        maybeSingle() {
          calls.push(call);
          if (table === 'products') onProduct();
          return withSignal(reject ? Promise.reject(reject) : Promise.resolve(table === 'products' ? productResponse : auctionResponse));
        },
      };
      return query;
    },
    rpc(name) { assert.equal(name, 'auctions_health'); calls.push({ rpc: name }); return withSignal(Promise.resolve(healthResponse)); },
  };
  return { lookup: createProductLookup(client), calls };
}

{
  const { lookup, calls } = fixture();
  const result = await lookup(A);
  assert.equal(result.status, 'ready'); assert.equal(result.product.id, A); assert.equal(result.product.price, 1000);
  assert.deepEqual(calls, [{ table: 'products', columns: productColumns, column: 'id', value: A }]);
  pass('una publicación visible se obtiene por ID sin catálogo ni RPC de escritura');
}
{
  const { lookup, calls } = fixture();
  for (const id of [undefined, null, '', 'deleted', A + '/extra', ` ${A}`, 123, '%E0%A4%A']) {
    assert.equal(initialProductDetail(id).status, 'invalid');
    assert.equal((await lookup(id)).status, 'invalid');
  }
  assert.equal(calls.length, 0);
  assert.equal((await lookup(A.toUpperCase())).status, 'ready');
  pass('IDs inválidos no consultan Supabase; UUID válido se normaliza');
}
{
  const { lookup, calls } = fixture({ productResponse: { data: null, error: null } });
  assert.deepEqual(await lookup(A), { status: 'not_found', product: null });
  assert.equal(calls.length, 1);
  pass('fila eliminada o invisible por RLS no provoca consultas que revelen su existencia');
}
{
  for (const response of [{ data: null, error: { code: '42501', message: 'private SQL detail' } }, { data: null, error: { message: 'private session' }, status: 403 }, { data: null, error: { code: 'PGRST301' }, status: 401 }]) {
    const result = await fixture({ productResponse: response }).lookup(A);
    assert.deepEqual(result, { status: 'restricted', product: null });
    assert.ok(!JSON.stringify(result).includes('private'));
  }
  pass('denegaciones explícitas y sesión inválida tienen estado restringido sin detalles privados');
}
{
  const thrown = await fixture({ reject: new TypeError('Failed to fetch private URL') }).lookup(A);
  const sdk = await fixture({ productResponse: { data: null, error: { message: 'Failed to fetch private URL' }, status: 0 } }).lookup(A);
  for (const result of [thrown, sdk]) assert.deepEqual(result, { status: 'error', reason: 'connection', product: null });
  pass('errores de red no se convierten en publicación inexistente');
}
{
  const result = await fixture({ productResponse: { data: null, error: { code: 'PGRST205', message: 'private table name' }, status: 500 } }).lookup(A);
  assert.deepEqual(result, { status: 'error', reason: 'service', product: null });
  assert.equal((await createProductLookup(null)(A)).reason, 'configuration');
  pass('fallos del servicio y configuración no se presentan como eliminación o permisos');
}
{
  const { lookup, calls } = fixture({ productResponse: { data: { ...row, sale_type: 'auction' }, error: null } });
  const result = await lookup(A);
  assert.equal(result.status, 'ready'); assert.equal(result.product.price, 2300); assert.equal(result.product.auction.id, B);
  assert.equal(result.product.auction.bid_count, 3); assert.equal(result.product.endsAt, Date.parse(auction.ends_at));
  assert.equal(result.product.clock.epoch, Date.parse(health.data.server_time));
  assert.ok(calls.some(call => call.table === 'auctions' && call.column === 'product_id' && call.value === A));
  assert.deepEqual(calls.filter(call => call.rpc).map(call => call.rpc), ['auctions_health']);
  pass('subasta por producto conserva puja actual, identidad, vencimiento y reloj del servidor');
}
{
  const result = await fixture({ productResponse: { data: { ...row, sale_type: 'auction' }, error: null }, auctionResponse: { data: { ...auction, highest_amount: null, bid_count: 0 }, error: null } }).lookup(A);
  assert.equal(result.product.price, 1000);
  pass('subasta sin pujas conserva precio inicial');
}
{
  for (const override of [
    { auctionResponse: { data: null, error: null } },
    { auctionResponse: { data: { ...auction, product_id: B }, error: null } },
    { auctionResponse: { data: { ...auction, highest_amount: 'invalid' }, error: null } },
    { healthResponse: { data: { version: 4, server_time: health.data.server_time }, error: null } },
    { healthResponse: { data: { version: 5, server_time: 'invalid' }, error: null } },
  ]) {
    const result = await fixture({ productResponse: { data: { ...row, sale_type: 'auction' }, error: null }, ...override }).lookup(A);
    assert.equal(result.status, 'error'); assert.equal(result.product, null);
  }
  pass('subasta incompleta o incompatible nunca se degrada a precio fijo');
}
{
  const base = { productResponse: { data: { ...row, sale_type: 'auction' }, error: null } };
  assert.equal((await fixture({ ...base, auctionResponse: { data: null, error: { code: '42501' } } }).lookup(A)).status, 'restricted');
  assert.equal((await fixture({ ...base, healthResponse: { data: null, error: {}, status: 0 } }).lookup(A)).reason, 'connection');
  pass('fallos de consulta de subasta conservan clasificación de acceso/red');
}
{
  const controller = new AbortController(); controller.abort();
  const first = fixture(); await first.lookup(A, { signal: controller.signal }); assert.equal(first.calls.length, 0);
  const secondController = new AbortController();
  const second = fixture({ productResponse: { data: { ...row, sale_type: 'auction' }, error: null }, onProduct: () => secondController.abort() });
  await second.lookup(A, { signal: secondController.signal });
  assert.ok(!second.calls.some(call => call.table === 'auctions' || call.rpc));
  pass('cancelación antes o después de leer producto evita consultas adicionales de subasta');
}

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function controlled() {
  const requests = [], events = [];
  const loader = createProductDetailLoader((id, { signal }) => { const wait = deferred(); requests.push({ id, signal, ...wait }); return wait.promise; });
  return { loader, requests, events, publish: state => events.push(state) };
}
const ready = id => ({ status: 'ready', product: { id } });
{
  const { loader, requests, events, publish } = controlled();
  const first = loader.load(A, publish), duplicate = loader.load(A, publish);
  assert.equal(first, duplicate); await Promise.resolve(); assert.equal(requests.length, 1);
  requests[0].resolve(ready(A)); await first;
  assert.deepEqual(events.map(event => event.status), ['loading', 'ready']);
  pass('reintentos concurrentes del mismo ID comparten una única solicitud');
}
{
  const { loader, requests, events, publish } = controlled();
  const first = loader.load(A, publish); loader.cancel(); const second = loader.load(A, publish);
  await Promise.resolve(); assert.equal(requests.length, 1);
  requests[0].resolve(ready(A)); await Promise.all([first, second]);
  assert.equal(events.filter(event => event.status === 'ready').length, 1);
  pass('montaje/limpieza/remontaje de StrictMode no duplica la consulta');
}
{
  const { loader, requests, events, publish } = controlled();
  const first = loader.load(A, publish); await Promise.resolve();
  const second = loader.load(B, publish); await Promise.resolve();
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(ready(B)); await second;
  const count = events.length; requests[0].resolve(ready(A)); await first;
  assert.equal(events.length, count); assert.equal(events.at(-1).product.id, B);
  pass('respuesta antigua A no reemplaza B aunque el transporte ignore abort');
}
{
  const { loader, requests, events, publish } = controlled();
  const first = loader.load(A, publish); await Promise.resolve();
  const second = loader.load(B, publish); await Promise.resolve();
  const third = loader.load(A, publish); await Promise.resolve();
  requests[2].resolve({ ...ready(A), marker: 'current' }); await third;
  requests[0].resolve({ ...ready(A), marker: 'obsolete' }); requests[1].reject(new TypeError('old private failure'));
  await Promise.all([first, second]); assert.equal(events.at(-1).marker, 'current');
  pass('secuencia A/B/A ignora resultados y errores de generaciones anteriores');
}
{
  const { loader, requests, events, publish } = controlled();
  const request = loader.load(A, publish); await Promise.resolve(); loader.cancel();
  requests[0].resolve(ready(A)); await request;
  assert.equal(events.length, 1); assert.equal(requests[0].signal.aborted, true);
  pass('desmontaje cancela la consulta y evita actualizaciones posteriores');
}
{
  const { loader, requests, events, publish } = controlled();
  const first = loader.load(A, publish); await Promise.resolve(); requests[0].reject(new TypeError('private connection detail')); await first;
  assert.equal(events.at(-1).reason, 'connection');
  const retry = loader.load(A, publish); await Promise.resolve(); requests[1].resolve(ready(A)); await retry;
  assert.equal(events.at(-1).status, 'ready');
  pass('reintento tras error recupera producto con una solicitud nueva');
}
{
  const { loader, requests, events, publish } = controlled();
  const first = loader.load(A, publish); await Promise.resolve(); requests[0].resolve(ready(A)); await first;
  const retry = loader.load(A, publish); assert.equal(events.at(-1).status, 'ready'); assert.equal(events.at(-1).refreshing, true);
  await Promise.resolve(); requests[1].resolve({ status: 'ready', product: { id: A, price: 2500 } }); await retry;
  assert.equal(events.at(-1).product.price, 2500); assert.equal(events.at(-1).refreshing, false);
  pass('refresco mantiene el detalle montado y actualiza el precio');
}
{
  for (const hash of [`#${productRoute(A)}`, `#/product/${A}`, `#product/${A.toUpperCase()}`]) {
    const route = parseRoute(hash); assert.equal(route.page, 'product'); assert.equal(initialProductDetail(route.id).status, 'loading');
  }
  const app = await readFile('src/App.jsx', 'utf8');
  const branch = app.split("else if (route.page === 'product')")[1].split('else content')[0];
  assert.ok(branch.includes('<ProductDetailPage')); assert.ok(!/catalog\.|selected/.test(branch));
  assert.ok(branch.includes('auth.user?.id'), 'Identity changes remount the private lookup state.');
  pass('ruta existente sigue compatible con enlaces y no depende del catálogo ni comparte estado entre usuarios');
}
console.log(`PASS: ${checks} product detail checks. Synthetic clients only; no remote RLS verification.`);
