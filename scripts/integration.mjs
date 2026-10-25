// Opt-in: real accounts configured ONLY in .env.test.local; never print credentials.
import assert from 'node:assert/strict';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { validateConfig } from '../src/lib/config.js';
import { confirmsDeletion } from '../src/lib/storage-result.js';
if (!existsSync('.env.test.local') || !readFileSync('.gitignore', 'utf8').split(/\r?\n/).includes('.env.test.local')) {
  console.error('NO EJECUTADA: falta el archivo local de pruebas o su exclusión explícita en .gitignore.');
  process.exit(1);
}
const env = loadEnv('test', process.cwd(), '');
if (validateConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY) || !['TEST_USER_A_EMAIL','TEST_USER_A_PASSWORD','TEST_USER_B_EMAIL','TEST_USER_B_PASSWORD'].every((key) => env[key])) {
  console.log('NO EJECUTADA: configura dos cuentas confirmadas en .env.test.local según docs/ETAPA-2.md. No envíes contraseñas por chat.');
  process.exit(1);
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const a = client(), b = client(), anonymous = client();
let productId, imagePath;
let phase = 'inicio';
const passed = [];
function pass(label) { passed.push(label); console.log(`APROBADA: ${label}.`); }
try {
  for (const [connection, label] of [[a,'A'],[b,'B']]) {
    phase = `inicio de sesión ${label}`;
    const { error } = await connection.auth.signInWithPassword({ email: env[`TEST_USER_${label}_EMAIL`], password: env[`TEST_USER_${label}_PASSWORD`] });
    assert.ok(!error, `No se pudo iniciar sesión en la cuenta ${label}.`);
    pass(phase);
  }
  const owner = (await a.auth.getUser()).data.user.id;
  assert.notEqual(owner, (await b.auth.getUser()).data.user.id, 'Se necesitan dos cuentas distintas.');
  const blob = await readFile(new URL('../public/images/playstation-5-640.webp', import.meta.url));
  phase = 'subida de fotografía de A';
  imagePath = `${owner}/${randomUUID()}.webp`;
  assert.ok(!(await a.storage.from('product-images').upload(imagePath, blob, {contentType: 'image/webp'})).error, 'La cuenta A debe poder subir su fotografía.');
  const storedPhoto = await a.storage.from('product-images').download(imagePath);
  assert.ok(!storedPhoto.error && storedPhoto.data, 'La fotografía subida debe poder descargarse.');
  assert.ok(Buffer.from(await storedPhoto.data.arrayBuffer()).equals(blob), 'La fotografía almacenada debe conservar sus bytes.');
  pass(phase);
  phase = 'bloqueo de subida de B en carpeta de A';
  const maliciousPath = `${owner}/${randomUUID()}.webp`;
  assert.ok((await b.storage.from('product-images').upload(maliciousPath, blob, {contentType: 'image/webp'})).error, 'La cuenta B no debe subir archivos a la carpeta de A.');
  pass(phase);
  const draft = {owner_id: owner, title: 'Prueba temporal automatizada', description: 'Publicación temporal creada por la prueba de integración; se elimina al terminar.', category: 'Consolas', condition: 'Buen estado', sale_type: 'fixed', price: 1000, area: 'Centro', image_path: imagePath};
  phase = 'publicación de A';
  const inserted = await a.from('products').insert(draft).select('id').single();
  assert.ok(!inserted.error && inserted.data, 'La cuenta A debe publicar con fotografía propia.');
  productId = inserted.data.id;
  pass(phase);
  phase = 'lectura del producto de A desde B y visitante';
  assert.ok((await b.from('products').select('id').eq('id', productId)).data?.length === 1, 'La cuenta B debe ver la publicación de A.');
  assert.ok((await anonymous.from('products').select('id').eq('id', productId)).data?.length === 1, 'El visitante debe ver la publicación pública.');
  pass(phase);
  phase = 'bloqueo de modificación por B';
  const modified = await b.from('products').update({title: 'Intento no autorizado'}).eq('id', productId).select('id');
  assert.ok(modified.error || modified.data?.length === 0, 'B no debe modificar publicaciones ajenas.');
  const unchanged = await a.from('products').select('title').eq('id', productId).single();
  assert.ok(!unchanged.error && unchanged.data.title === draft.title, 'El artículo debe conservar el título original.');
  pass(phase);
  phase = 'bloqueo de eliminación por B';
  const removed = await b.from('products').delete().eq('id', productId).select('id');
  assert.ok(removed.error || removed.data?.length === 0, 'B no debe eliminar publicaciones ajenas.');
  assert.ok((await a.from('products').select('id').eq('id', productId)).data?.length === 1, 'El artículo debe seguir existiendo.');
  pass(phase);
  phase = 'bloqueo de suplantación de propietario';
  const forged = await b.from('products').insert({...draft, id: randomUUID()});
  assert.ok(forged.error, 'B no debe publicar suplantando al propietario A.');
  pass(phase);
  phase = 'bloqueo de modificación del perfil de A por B';
  const profile = await b.from('profiles').update({display_name: 'Intento no autorizado'}).eq('id', owner).select('id');
  assert.ok(profile.error || profile.data?.length === 0, 'B no debe modificar el perfil de A.');
  pass(phase);
  phase = 'bloqueo de publicación sin sesión';
  assert.ok((await anonymous.from('products').insert({...draft, id: randomUUID()})).error, 'Un visitante no debe publicar.');
  pass(phase);
  phase = 'edición propia por A';
  const edited = await a.from('products').update({title: 'Prueba temporal editada'}).eq('id', productId).select('title').single();
  assert.ok(!edited.error && edited.data?.title === 'Prueba temporal editada', 'A debe editar su publicación.');
  pass(phase);
  // Photo cannot be removed while a published product references it.
  phase = 'bloqueo de eliminación de fotografía ajena';
  const blockedPhoto = await b.storage.from('product-images').remove([imagePath]);
  assert.ok(!confirmsDeletion(blockedPhoto, imagePath), 'B no debe eliminar el archivo de A.');
  const stillThere = await a.storage.from('product-images').download(imagePath);
  assert.ok(!stillThere.error, 'La fotografía de A debe seguir disponible.');
  pass(phase);
  console.log('OK: dos cuentas, publicación compartida, edición propia y rechazo de escrituras ajenas en productos/perfiles/Storage.');
} catch {
  console.error(`FALLÓ: ${phase}. Las comprobaciones posteriores no se ejecutaron. No se muestran respuestas ni credenciales.`);
  process.exitCode = 1;
} finally {
  // Only delete the temporary row/file created by THIS run.
  let canRemoveImage = !productId;
  if (productId) {
    const deleted = await a.from('products').delete().eq('id', productId).select('id');
    canRemoveImage = !deleted.error && deleted.data?.length === 1;
    if (canRemoveImage) pass('eliminación propia por A');
    if (!canRemoveImage) { console.error('Limpieza pendiente: revisa la publicación temporal de la prueba en tu cuenta A.'); process.exitCode = 1; }
  }
  if (imagePath && canRemoveImage) {
    const cleaned = await a.storage.from('product-images').remove([imagePath]);
    if (!confirmsDeletion(cleaned, imagePath)) { console.error('Limpieza no confirmada: revisa las fotografías temporales en Storage.'); process.exitCode = 1; }
    else pass('eliminación de fotografía temporal por A');
  }
  await Promise.allSettled([a.auth.signOut({scope: 'local'}), b.auth.signOut({scope: 'local'})]);
  console.log(`Resultado: ${passed.length} comprobaciones aprobadas; ${process.exitCode ? 'hay fallos o limpieza pendiente' : 'sin fallos detectados'}.`);
}
