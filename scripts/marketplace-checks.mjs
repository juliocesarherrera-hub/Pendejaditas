// SDK test doubles stay in the test process. They never replace the app's client.
import assert from 'node:assert/strict';
import { createMarketplace } from '../src/lib/marketplace-core.js';
const input = { title: 'Artículo de prueba unitaria', description: 'Descripción que solo existe durante una prueba local.', category: 'Consolas', condition: 'Buen estado', type: 'fixed', price: 500, area: 'Centro' };
const file = { type: 'image/jpeg', size: 1000 };
function fixture({ userId = 'account-a', uploadError = false, insertError = false, referenced = false, unconfirmedDelete = false } = {}) {
  const calls = [];
  let uploadedPath;
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
    storage: { from: () => ({
      upload: async (path) => { calls.push('upload'); uploadedPath = path; return { error: uploadError ? { code: 'denied' } : null }; },
      remove: async (paths) => { calls.push('remove'); return { data: unconfirmedDelete ? [] : paths.map((name) => ({ name })), error: null }; },
      getPublicUrl: () => ({ data: { publicUrl: 'https://images.example.invalid/unit-test.jpg' } }),
    }) },
    from: () => {
      let payload;
      const query = {
        insert: (value) => { calls.push('insert'); payload = value; return query; },
        select: () => query,
        eq: () => query,
        limit: async () => ({ data: referenced ? [{ id: 'existing-reference' }] : [], error: null }),
        single: async () => insertError ? { data: null, error: { code: '42501' } } : { data: { ...payload, id: 'created', image_path: uploadedPath, profiles: { display_name: 'Nombre de prueba' } }, error: null },
      };
      return query;
    },
  };
  return { api: createMarketplace(client), calls };
}
{
  const { api, calls } = fixture({ userId: null });
  await assert.rejects(api.saveProduct(input, file), /Inicia sesión/);
  assert.deepEqual(calls, []);
}
{
  const { api, calls } = fixture({ userId: 'account-b' });
  await assert.rejects(api.saveProduct(input, file, { ownerId: 'account-a' }), /propias publicaciones/);
  await assert.rejects(api.deleteProduct({ ownerId: 'account-a' }), /propias publicaciones/);
  assert.deepEqual(calls, []);
}
{
  const { api, calls } = fixture({ uploadError: true });
  await assert.rejects(api.saveProduct(input, file), /subir la fotografía/);
  assert.deepEqual(calls, ['upload']);
}
{
  const { api, calls } = fixture();
  const saved = await api.saveProduct({ ...input, owner_id: 'forged-account' }, file);
  assert.equal(saved.product.ownerId, 'account-a');
  assert.equal(saved.product.id, 'created');
  assert.deepEqual(calls, ['upload', 'insert']);
}
{
  const { api, calls } = fixture({ insertError: true });
  await assert.rejects(api.saveProduct(input, file), /No tienes permiso/);
  assert.deepEqual(calls, ['upload', 'insert', 'remove']);
}
{
  const { api, calls } = fixture({ insertError: true, referenced: true });
  await assert.rejects(api.saveProduct(input, file), /No se pudo confirmar la limpieza/);
  assert.deepEqual(calls, ['upload', 'insert']);
}
{
  const { api } = fixture({ insertError: true, unconfirmedDelete: true });
  await assert.rejects(api.saveProduct(input, file), /No se pudo confirmar la limpieza/);
}
console.log('OK: servicio local rechaza operaciones sin sesión/propiedad, errores de subida/guardado y limpieza no confirmada. No sustituye RLS remoto.');
