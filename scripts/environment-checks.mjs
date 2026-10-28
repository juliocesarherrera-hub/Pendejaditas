// Synthetic fixtures only. No backend requests, credentials or SQL execution.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { validateConfig, validatePublicEnv, hasPrivateCredential, clientAuthOptions } from '../src/lib/config.js';
import { REMOTE_SUPABASE_ORIGINS } from '../src/lib/environment-policy.js';
import { selectClientEnvironment, loadClientEnvironment, assertLabServer } from './client-environment.mjs';

const remote = REMOTE_SUPABASE_ORIGINS[0];
const publicKey = 'sb_publishable_synthetic_remote';
const labKey = 'sb_publishable_synthetic_lab';
const remoteEnv = { VITE_SUPABASE_URL: remote, VITE_SUPABASE_PUBLISHABLE_KEY: publicKey };
const labEnv = { PJD_LAB_ENABLED: 'true', PJD_LAB_SUPABASE_URL: 'http://127.0.0.1:54321', PJD_LAB_SUPABASE_PUBLISHABLE_KEY: labKey };
const jwt = claims => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`;
let checks = 0;
const pass = () => { checks++; };

for (const mode of ['development', 'production']) {
  assert.equal(validateConfig(remote, publicKey, { environment: mode }), '');
  const selected = selectClientEnvironment({ mode, env: remoteEnv });
  assert.equal(selected.lab, false);
  assert.equal(JSON.parse(selected.define['import.meta.env.VITE_SUPABASE_URL']), remote);
  assert.equal(JSON.parse(selected.define['import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY']), publicKey);
  pass();
}
for (const url of [remote.replace('https:', 'http:'), 'https://unauthorized.supabase.co', `${remote}.attacker.invalid`, `${remote}:444`, `${remote}/rest/v1`, `${remote}?key=value`, `${remote}#x`, remote.replace('https://', 'https://user:password@'), 'http://127.0.0.1:54321', 'not a url']) {
  assert.ok(validateConfig(url, publicKey)); pass();
}
for (const key of ['sb_secret_synthetic', 'service_role', jwt({ role: 'service_role', iss: 'supabase-demo' }), jwt({ role: 'authenticated' }), 'sb_publishable_sb_secret_hidden', 'sb_publishable_has whitespace', '', null, 123]) {
  assert.ok(validateConfig(remote, key)); pass();
}
for (const value of ['sb_secret_synthetic', jwt({ role: 'service_role' }), '-----BEGIN PRIVATE KEY-----', 'postgres://user:password@host/db']) {
  assert.equal(hasPrivateCredential(value), true);
  assert.ok(validatePublicEnv({ ...remoteEnv, VITE_MAP_TILE_URL: value })); pass();
}
assert.ok(validatePublicEnv({ ...remoteEnv, VITE_UNREVIEWED_TOKEN: publicKey })); pass();
assert.ok(validatePublicEnv({ ...remoteEnv, VITE_MAP_TILE_URL: 'http://attacker.invalid/tiles' })); pass();
assert.ok(validatePublicEnv({ ...remoteEnv, VITE_PJD_ENVIRONMENT: 'lab' })); pass();
assert.ok(validatePublicEnv({ VITE_SUPABASE_URL: remote })); pass();
assert.equal(validatePublicEnv({}), ''); pass();

const labOptions = { environment: 'lab', labEnabled: true };
for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321']) {
  assert.equal(validateConfig(url, labKey, labOptions), ''); pass();
}
for (const url of [remote, 'https://other.supabase.co', 'http://192.168.1.2:54321', 'http://127.0.0.2:54321', 'http://127.1:54321', 'http://2130706433:54321', 'http://localhost.attacker.invalid:54321', 'http://localhost:8000', 'http://127.0.0.1:54321/auth', 'http://[::1]:54321']) {
  assert.ok(validateConfig(url, labKey, labOptions)); pass();
}
for (const labEnabled of [false, 'true', undefined]) {
  assert.ok(validateConfig(labEnv.PJD_LAB_SUPABASE_URL, labKey, { environment: 'lab', labEnabled })); pass();
}
assert.ok(validateConfig(remote, publicKey, { environment: 'production', labEnabled: true })); pass();
assert.ok(validateConfig(remote, publicKey, { environment: 'staging' })); pass();
assert.equal(validateConfig(labEnv.PJD_LAB_SUPABASE_URL, jwt({ role: 'anon', iss: 'supabase-demo' }), labOptions), ''); pass();
for (const claims of [{ role: 'service_role', iss: 'supabase-demo' }, { role: 'anon', iss: 'supabase', ref: 'remote' }, { role: 'anon', iss: 'supabase-demo', ref: 'remote' }]) {
  assert.ok(validateConfig(labEnv.PJD_LAB_SUPABASE_URL, jwt(claims), labOptions)); pass();
}
for (const override of [{ PJD_LAB_ENABLED: 'false' }, { PJD_LAB_ENABLED: '1' }, { PJD_LAB_SUPABASE_URL: remote }, { VITE_SUPABASE_PUBLISHABLE_KEY: publicKey }, { PJD_LAB_ADMIN_KEY: 'sb_secret_synthetic' }, { PJD_LAB_SUPABASE_PUBLISHABLE_KEY: publicKey }]) {
  assert.throws(() => selectClientEnvironment({ mode: 'lab', env: { ...labEnv, ...override }, remoteKeys: [publicKey] })); pass();
}
assert.throws(() => selectClientEnvironment({ mode: 'lab', env: remoteEnv })); pass();
assert.throws(() => selectClientEnvironment({ mode: 'staging', env: remoteEnv })); pass();
for (const mode of ['lab', 'development']) {
  assert.throws(() => selectClientEnvironment({ mode, command: 'build', env: mode === 'lab' ? labEnv : remoteEnv }));
  assert.throws(() => selectClientEnvironment({ mode, isPreview: true, env: mode === 'lab' ? labEnv : remoteEnv })); pass();
}
const labSelected = selectClientEnvironment({ mode: 'lab', env: labEnv, remoteKeys: [publicKey] });
assert.equal(JSON.parse(labSelected.define['import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY']), labKey);
assert.equal(JSON.stringify(labSelected).includes(publicKey), false); pass();
assert.deepEqual(clientAuthOptions('production', false), { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }); pass();
assert.deepEqual(clientAuthOptions('development', false), clientAuthOptions('production', false)); pass();
assert.equal(clientAuthOptions('lab', true).storageKey, 'pendejaditas-lab-auth-v1'); pass();
assert.equal(clientAuthOptions('production', true).storageKey, undefined); pass();
assert.equal(clientAuthOptions('lab', false).storageKey, undefined); pass();
assert.doesNotThrow(() => assertLabServer({ server: { host: '127.0.0.1', port: 5175, strictPort: true } })); pass();
for (const server of [{ host: '0.0.0.0', port: 5175, strictPort: true }, { host: true, port: 5175, strictPort: true }, { host: '127.0.0.1', port: 5173, strictPort: true }, { host: '127.0.0.1', port: 5175, strictPort: false }]) {
  assert.throws(() => assertLabServer({ server })); pass();
}

// Exercise Vite's real env loader: root credentials never fill a missing lab file.
const cache = resolve('.cache');
mkdirSync(cache, { recursive: true });
const fixture = mkdtempSync(resolve(cache, 'environment-fixture-'));
if (!fixture.startsWith(`${cache}${sep}environment-fixture-`)) throw new Error('Ruta temporal fuera del espacio de prueba.');
const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(VITE_|PJD_LAB_)/.test(name)));
try {
  for (const name of Object.keys(inherited)) delete process.env[name];
  writeFileSync(resolve(fixture, '.env.local'), `VITE_SUPABASE_URL=${remote}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publicKey}\n`);
  assert.throws(() => loadClientEnvironment({ mode: 'lab', root: fixture })); pass();
  mkdirSync(resolve(fixture, '.lab'));
  const labFile = resolve(fixture, '.lab/.env.lab.local');
  writeFileSync(labFile, Object.entries(labEnv).map(([name, value]) => `${name}=${value}`).join('\n'));
  const selected = loadClientEnvironment({ mode: 'lab', root: fixture });
  assert.deepEqual(selected, labSelected); pass();
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = publicKey;
  assert.throws(() => loadClientEnvironment({ mode: 'lab', root: fixture })); pass();
  delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  writeFileSync(labFile, Object.entries({ ...labEnv, PJD_LAB_SUPABASE_PUBLISHABLE_KEY: publicKey }).map(([name, value]) => `${name}=${value}`).join('\n'));
  assert.throws(() => loadClientEnvironment({ mode: 'lab', root: fixture })); pass();
  assert.equal(JSON.parse(loadClientEnvironment({ mode: 'production', command: 'build', root: fixture }).define['import.meta.env.VITE_SUPABASE_URL']), remote); pass();
} finally {
  for (const name of Object.keys(process.env).filter(name => /^(VITE_|PJD_LAB_)/.test(name))) delete process.env[name];
  Object.assign(process.env, inherited);
  rmSync(fixture, { recursive: true });
}
console.log(`OK: ${checks} comprobaciones de destinos, claves, modos, aislamiento y rechazos de configuración; sin red.`);
