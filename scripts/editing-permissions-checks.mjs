// Local simulations only. Does not read .env, log in, run SQL or modify Storage.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMarketplace } from '../src/lib/marketplace-core.js';
import { createEditableProductLookup } from '../src/lib/editable-product.js';
import { createProductDetailLoader } from '../src/lib/product-detail.js';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B, C, D] = [1, 2, 3, 4].map(id);
const original = () => ({ id: id(10), owner_id: A, title: 'Publicación técnica de edición', description: 'Solo existe dentro del simulador de pruebas local.', category: 'Consolas', condition: 'Buen estado', sale_type: 'fixed', price: 500, area: 'Centro', image_path: `${A}/${id(11)}.webp`, created_at: '2026-10-28T10:00:00Z', updated_at: '2026-10-28T10:00:00Z', profiles: { display_name: 'Vendedor técnico' } });
const input = row => ({ title: row.title, description: row.description, category: row.category, condition: row.condition, type: row.sale_type, price: Number(row.price), area: row.area });
const photo = { type: 'image/webp', size: 200 };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let checks = 0;
const pass = label => { checks++; console.log(`OK permisos edición ${checks}: ${label}`); };

function fixture({ user = A, kind = 'free', fail = null, uploadError = false } = {}) {
  let row = original(); if (kind === 'auction') row.sale_type = 'auction';
  const photos = new Map([[row.image_path, 'original-photo-bytes']]), calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }) },
    storage: { from: bucket => {
      assert.equal(bucket, 'product-images');
      return {
        getPublicUrl: path => ({ data: { publicUrl: `https://images.invalid/${path}` } }),
        upload: async (path, _file, options) => { calls.push({ action: 'upload', path }); assert.equal(options.upsert, false); assert.ok(!photos.has(path)); if (!uploadError) photos.set(path, 'replacement-photo-bytes'); return { error: uploadError ? { code: '42501' } : null }; },
        remove: async paths => { calls.push({ action: 'remove', paths }); for (const path of paths) { assert.notEqual(path, row.image_path, 'Never delete a live photo'); photos.delete(path); } return { data: paths.map(name => ({ name })), error: null }; },
      };
    } },
    from: table => {
      assert.equal(table, 'products'); const filters = [], call = { action: 'read', filters }; let payload, single = false;
      const query = {
        select: () => query,
        update(value) { call.action = 'update'; payload = value; return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        maybeSingle() { single = true; return query; },
        single() { single = true; return query; },
        limit: () => query,
        abortSignal: () => query,
        then(resolve, reject) {
          calls.push(structuredClone(call));
          if (call.action === 'read') {
            const matches = filters.every(([column, value]) => row[column] === value);
            return Promise.resolve({ data: single ? matches ? structuredClone(row) : null : matches ? [{ id: row.id }] : [], error: null }).then(resolve, reject);
          }
          // This is an explicit model of the reviewed rules, not a real RLS test.
          const allowed = row.owner_id === user && filters.every(([column, value]) => row[column] === value);
          if (!allowed) return Promise.resolve({ data: null, error: { code: 'PGRST116' } }).then(resolve, reject);
          const immutable = kind === 'auction' || ['delivery_ready', 'delivery_recorded', 'delivery_review'].includes(kind);
          if (immutable) return Promise.resolve({ data: null, error: { code: 'P0001' } }).then(resolve, reject);
          if (fail === 'network_before') return Promise.reject(new TypeError('Synthetic network failure')).then(resolve, reject);
          row = { ...row, ...payload, updated_at: '2026-10-28T10:01:00Z' };
          if (fail === 'lost_response') return Promise.resolve({ data: null, error: { code: 'NETWORK' } }).then(resolve, reject);
          return Promise.resolve({ data: structuredClone(row), error: null }).then(resolve, reject);
        },
      }; return query;
    },
  };
  return { client, api: createMarketplace(client), lookup: createEditableProductLookup(client), calls, photos, row: () => structuredClone(row) };
}

for (const user of [A, B, C, D]) {
  const f = fixture({ user }), before = f.row(), existing = f.api.toProduct(before);
  if (user === A) {
    const result = await f.api.saveProduct({ ...input(before), title: before.title + ' revisada' }, null, existing);
    assert.equal(result.product.title, before.title + ' revisada'); assert.equal(result.product.imagePath, before.image_path); assert.equal(f.photos.get(before.image_path), 'original-photo-bytes');
    for (const field of ['description', 'category', 'condition', 'sale_type', 'price', 'area', 'owner_id', 'created_at']) assert.equal(f.row()[field], before[field]);
    assert.ok(f.calls.some(call => call.action === 'update' && call.filters.some(([column, value]) => column === 'updated_at' && value === before.updated_at)));
  } else {
    await assert.rejects(f.api.saveProduct({ ...input(before), title: 'Intento ajeno rechazado' }, null, existing), /propias publicaciones/);
    assert.equal(f.calls.length, 0); assert.deepEqual(f.row(), before);
    // Forging the client-side owner still cannot make the modeled server match.
    await assert.rejects(f.api.saveProduct({ ...input(before), title: 'Propietario falsificado' }, null, { ...existing, ownerId: user }));
    assert.deepEqual(f.row(), before); assert.equal(f.photos.get(before.image_path), 'original-photo-bytes');
  }
  pass(`${['A', 'B', 'C', 'D'][[A, B, C, D].indexOf(user)]}: guardado propio o rechazo ajeno sin tocar fotografía/datos en el simulador`);
}
{
  const f = fixture({ user: null }); await assert.rejects(f.api.saveProduct(input(f.row()), null, f.api.toProduct(f.row())), /Inicia sesión/); assert.equal(f.calls.length, 0);
  const old = fixture(), before = old.row(); await assert.rejects(old.api.saveProduct({ ...input(before), title: 'Borrador obsoleto rechazado' }, null, { ...old.api.toProduct(before), updatedAt: '2000-01-01T00:00:00Z' })); assert.deepEqual(old.row(), before);
  pass('sesión ausente y updated_at obsoleto rechazan guardados sin cambios');
}
for (const kind of ['free', 'appointment_only', 'claim_only', 'hold_only', 'delivery_cancelled', 'auction', 'delivery_ready', 'delivery_recorded', 'delivery_review']) {
  const f = fixture({ kind }), before = f.row(), existing = f.api.toProduct(before);
  const blocked = ['auction', 'delivery_ready', 'delivery_recorded', 'delivery_review'].includes(kind);
  const changed = { ...input(before), type: 'fixed', title: before.title + ' cambio técnico' };
  if (blocked) { await assert.rejects(f.api.saveProduct(changed, null, existing)); assert.deepEqual(f.row(), before); }
  else { await f.api.saveProduct(changed, null, existing); assert.equal(f.row().title, changed.title); }
  assert.equal(f.photos.get(before.image_path), 'original-photo-bytes');
  pass(`${kind}: regla modelada ${blocked ? 'bloquea' : 'no congela por sí sola'} la edición; sin pretender validación del trigger remoto`);
}
{
  const f = fixture(), before = f.row(); const result = await f.api.saveProduct(input(before), photo, f.api.toProduct(before));
  assert.notEqual(result.product.imagePath, before.image_path); assert.equal(f.photos.get(result.product.imagePath), 'replacement-photo-bytes'); assert.equal(f.photos.has(before.image_path), false);
  const actions = f.calls.map(call => call.action); assert.ok(actions.indexOf('upload') < actions.indexOf('update')); assert.ok(actions.indexOf('update') < actions.indexOf('remove'));
  const denied = fixture({ kind: 'delivery_recorded' }), originalRow = denied.row(); await assert.rejects(denied.api.saveProduct(input(originalRow), photo, denied.api.toProduct(originalRow))); assert.deepEqual(denied.row(), originalRow); assert.equal(denied.photos.get(originalRow.image_path), 'original-photo-bytes'); assert.equal(denied.photos.size, 1);
  const failedUpload = fixture({ uploadError: true }); await assert.rejects(failedUpload.api.saveProduct(input(failedUpload.row()), photo, failedUpload.api.toProduct(failedUpload.row()))); assert.equal(failedUpload.calls.filter(call => call.action === 'update').length, 0);
  pass('reemplazo de foto utiliza ruta nueva; solo limpia la anterior tras guardar; rechazo o subida fallida conserva el original');
}
{
  const beforeFailure = fixture({ fail: 'network_before' }), before = beforeFailure.row(); await assert.rejects(beforeFailure.api.saveProduct({ ...input(before), title: 'Cambio sin conexión' }, null, beforeFailure.api.toProduct(before))); assert.deepEqual(beforeFailure.row(), before);
  const lost = fixture({ fail: 'lost_response' }), old = lost.row(); await assert.rejects(lost.api.saveProduct(input(old), photo, lost.api.toProduct(old))); assert.equal(lost.photos.get(lost.row().image_path), 'replacement-photo-bytes'); assert.equal(lost.photos.get(old.image_path), 'original-photo-bytes'); assert.ok(!lost.calls.some(call => call.action === 'remove'));
  pass('fallo previo no cambia datos; respuesta perdida no anuncia éxito ni elimina una foto que podría estar referenciada');
}
{
  const f = fixture(); const state = await f.lookup(f.row().id, A); assert.equal(state.status, 'ready'); assert.equal(f.calls.length, 1);
  for (const user of [B, C, D]) assert.equal((await fixture({ user }).lookup(f.row().id, user)).status, 'unavailable');
  const bad = await fixture({ kind: 'auction' }).lookup(f.row().id, A); assert.equal(bad.status, 'blocked');
  const gate = deferred(), abort = new AbortController(); const delayed = { ...f.client, from: () => { const query = { select: () => query, eq: () => query, maybeSingle: () => query, abortSignal: () => query, then: (...args) => gate.promise.then(...args) }; return query; } };
  const late = createEditableProductLookup(delayed)(f.row().id, A, { signal: abort.signal }); abort.abort(); gate.resolve({ data: f.row(), error: null }); assert.equal((await late).reason, 'connection');
  const oldRequest = deferred(); let latest;
  const loader = createProductDetailLoader(key => key === 'old' ? oldRequest.promise : Promise.resolve({ status: 'ready', product: { id: 'new' } }));
  const pending = loader.load('old', state => { latest = state; }); await Promise.resolve(); await loader.load('new', state => { latest = state; }); oldRequest.resolve({ status: 'ready', product: { id: 'old' } }); await pending; assert.equal(latest.product.id, 'new');
  pass('entrada directa sin catálogo y cancelación/respuesta tardía no sustituyen el producto actual');
}
{
  const [base, auction, delivery, claims, meetings, app] = await Promise.all(['supabase/migrations/202610240001_marketplace.sql', 'supabase/migrations/202610240005_auctions.sql', 'supabase/migrations/202610240006_delivery_qr.sql', 'supabase/migrations/202610250007_claims.sql', 'supabase/migrations/202610240002_meetings.sql', 'src/App.jsx'].map(path => readFile(path, 'utf8')));
  assert.ok(base.includes('grant update(title, description, category, condition, sale_type, price, area, image_path)'));
  assert.ok(base.includes('create policy products_owner_update')); assert.ok(base.includes('with check ((select auth.uid()) = owner_id)'));
  assert.ok(auction.includes('create trigger auction_product_immutable')); assert.ok(auction.includes("(to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at')"));
  assert.ok(delivery.includes("status<>'cancelled' or tg_op='DELETE'")); assert.ok(delivery.includes('create trigger delivery_product_preserve'));
  const triggers = claims.match(/create trigger .* on public\.[a-z_]+/g) || []; assert.ok(triggers.filter(trigger => trigger.includes('claim_')).every(trigger => !trigger.includes('public.products')));
  assert.ok(!meetings.includes('on public.products for each row')); assert.ok(app.includes('<EditProductPage')); assert.ok(!app.includes('catalog.products.find'));
  pass('definiciones locales revisadas: RLS/grants, inmutabilidad de subastas/entregas y alcance real de citas/pausas; no comprueba instalación remota');
}
console.log(`PASS: ${checks} grupos locales de permisos/guardado; A/B/C/D simulados, sin escrituras remotas.`);
