// Tests DRAFT statements ONLY in a NEW disposable PGlite cluster.
// Does not run project migrations 001-008, open native Postgres, or read env files.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { PGlite } from '@electric-sql/pglite';
import { parse, parsePlPgSQL } from 'libpg-query';
import { createCatalogReference, normalizeCatalogText, prepareCatalogRequest } from './support/catalog-contract-reference.mjs';
import { catalogFixtures, fixtureId, owners, unicodeCorpus, sqlCases } from './support/catalog-postgres-corpus.mjs';
import { createCatalogRpcPages } from '../src/lib/catalog-rpc.js';

const source = await readFile(new URL('../supabase/drafts/202610280009_catalog.sql', import.meta.url), 'utf8');
const diagnostic = await readFile(new URL('../supabase/diagnostics/audit-catalog.sql', import.meta.url), 'utf8');
const db = new PGlite();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
let checks = 0, requests = 0, helperReads = 0;
function pass(label) { checks++; console.log(`OK borrador catálogo ${checks}: ${label}`); }
async function rollback() { await db.exec('rollback'); }
async function identity(user = null) {
  await db.exec('reset role'); await db.query("select set_config('lab.uid',$1,false)", [user || '']);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
}
async function rpc(request = {}) {
  requests++; return (await db.query('select public.catalog_page_v1($1::jsonb) value', [JSON.stringify(request)])).rows[0].value;
}
const rows = catalogFixtures(100).map((row, i) => ({ ...row, image_path: `${row.owner_id}/${fixtureId(i + 20000)}.webp`,
  seller_name: `Perfil sintético ${owners.indexOf(row.owner_id) + 1}`,
  visible_to: i % 11 === 0 ? [owners[0]] : null,
  ...(row.auction ? { auction: { ...row.auction, visible_to: i % 13 === 0 ? [owners[1]] : null } } : {}) }));
const projected = (user) => rows.filter(row => !row.visible_to || row.visible_to.includes(user)).map(row => {
  const value = { ...row, seller_name: row.owner_id === owners[3] && user !== owners[3] ? 'Perfil no disponible' : row.seller_name };
  if (row.auction?.visible_to && !row.auction.visible_to.includes(user)) delete value.auction;
  return value;
});
async function domainSnapshot() {
  await db.exec('reset role');
  return hash((await db.query(`select
   (select jsonb_agg(to_jsonb(p) order by id) from public.products p) products,
   (select jsonb_agg(to_jsonb(a) order by id) from public.auctions a) auctions,
   (select jsonb_agg(to_jsonb(s) order by id) from public.claims s) claims,
   (select jsonb_agg(to_jsonb(s) order by id) from public.delivery_operations s) deliveries,
   (select jsonb_agg(to_jsonb(s) order by id) from public.orders s) orders`)).rows[0]);
}
try {
  await parse(source);
  const diagnosticTree = await parse(diagnostic);
  assert.equal(diagnosticTree.stmts.length, 1); assert.ok(diagnosticTree.stmts[0].stmt.SelectStmt);
  for (const m of source.matchAll(/create function [\s\S]*?\$\$;/gi)) {
    if (/language plpgsql/.test(m[0])) await parsePlPgSQL(m[0]);
    else await parse(m[0].split('$$')[1]);
  }
  assert.ok(!/create (?:unique )?index|create extension|create or replace function|alter table|create table|update public\.|insert into public\.|delete from/i.test(source));
  assert.ok(!/public\.(?:auction_snapshot|settle_auction_locked|advance_auction_clock|place_auction_bid)\s*\(/.test(source));
  pass('SQL y cuerpos analizados; sin índices/extensiones ni reemplazos o DML de dominio');
  await db.exec(`create role anon;create role authenticated;
   create schema auth;grant usage on schema auth to anon,authenticated;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('lab.uid',true),'')::uuid$$;
   create table public.profiles(id uuid primary key,display_name text not null);
   create table public.products(id uuid primary key,owner_id uuid references public.profiles(id),title text,category text,condition text,sale_type text,
    price numeric(12,0),area text,image_path text,created_at timestamptz,updated_at timestamptz,visible_to uuid[]);
   create table public.auctions(id uuid primary key,product_id uuid unique references public.products(id),seller_id uuid references public.profiles(id),
    initial_price bigint,highest_amount bigint,bid_count integer,status text,revision integer,starts_at timestamptz,ends_at timestamptz,visible_to uuid[],highest_bid_id uuid,cancellation_reason text);
   alter table public.products enable row level security;alter table public.profiles enable row level security;alter table public.auctions enable row level security;
   grant select on public.products,public.profiles,public.auctions to anon,authenticated;
   create policy lab_products on public.products for select using(visible_to is null or auth.uid()=any(visible_to));
   create policy lab_auctions on public.auctions for select using(visible_to is null or auth.uid()=any(visible_to));
   create policy lab_profiles on public.profiles for select using(id<>'${owners[3]}'::uuid or auth.uid()=id);
   -- Synthetic 007/008 sentinels. These are NOT their real schemas or migrations.
   create schema app_private;create table public.orders(id uuid primary key,private_note text);
   create table public.claims(id uuid primary key,private_note text);create table public.delivery_operations(id uuid primary key,private_note text);
   insert into public.orders values('${fixtureId(99991)}','synthetic-private');
   insert into public.claims values('${fixtureId(99992)}','synthetic-private');
   insert into public.delivery_operations values('${fixtureId(99993)}','synthetic-private');
   create function public.auction_snapshot(uuid) returns jsonb language plpgsql as $$begin raise exception 'Mutating function called';end$$;
   create function public.respond_exchange(uuid,text) returns void language plpgsql as $$begin raise exception 'Sentinel 008';end$$;`);
  for (let i = 0; i < owners.length; i++) await db.query('insert into public.profiles values($1,$2)', [owners[i], `Perfil sintético ${i + 1}`]);
  await db.query(`insert into public.products select x.* from jsonb_to_recordset($1::jsonb) x(id uuid,owner_id uuid,title text,category text,condition text,sale_type text,price numeric(12,0),area text,image_path text,created_at timestamptz,updated_at timestamptz,visible_to uuid[])`, [JSON.stringify(rows)]);
  const auctions = rows.filter(row => row.auction).map(row => row.auction);
  await db.query(`insert into public.auctions(id,product_id,seller_id,initial_price,highest_amount,bid_count,status,revision,starts_at,ends_at,visible_to)
   select x.* from jsonb_to_recordset($1::jsonb) x(id uuid,product_id uuid,seller_id uuid,initial_price bigint,highest_amount bigint,bid_count integer,status text,revision integer,starts_at timestamptz,ends_at timestamptz,visible_to uuid[])`, [JSON.stringify(auctions)]);
  const before = await domainSnapshot();
  const absent = (await db.query(diagnostic)).rows[0].jsonb_build_object;
  assert.equal(absent.catalog_schema_present, false); assert.ok(absent.functions.every(fn => !fn.present));
  const oldDefinitions = (await db.query("select oid::regprocedure::text signature,pg_get_functiondef(oid) definition from pg_proc where oid in('public.auction_snapshot(uuid)'::regprocedure,'public.respond_exchange(uuid,text)'::regprocedure) order by 1")).rows;
  const oldACL = (await db.query("select oid::regclass::text name,relacl::text acl from pg_class where oid in('public.products'::regclass,'public.auctions'::regclass,'public.profiles'::regclass) order by 1")).rows;
  await assert.rejects(() => db.exec(source), error => error.code === 'P0001'); await rollback();
  assert.equal((await db.query("select to_regnamespace('catalog_private') n")).rows[0].n, null);
  pass('guard de borrador falla cerrado sin dejar objetos');
  await db.exec("set pjd.catalog_draft_validation='isolated-local-only'");
  await assert.rejects(() => db.exec(source.replace("notify pgrst,'reload schema';", "select 1/0;")), error => error.code === '22012'); await rollback();
  assert.equal((await db.query("select to_regnamespace('catalog_private') n")).rows[0].n, null);
  assert.equal(await domainSnapshot(), before); pass('error intermedio revierte todos los objetos nuevos y conserva fixtures anteriores');
  await db.exec(source);
  const installed = (await db.query(diagnostic)).rows[0].jsonb_build_object;
  assert.equal(installed.catalog_schema_present, true); assert.ok(installed.functions.every(fn => fn.present && !fn.definer && !fn.public_execute));
  const expectedBodies = [...source.matchAll(/create function\s+([\w.]+)[\s\S]*?\$\$;/gi)];
  for (const m of expectedBodies) {
    const found = installed.functions.find(fn => fn.signature.startsWith(m[1] + '('));
    assert.equal(found.body_sha256, createHash('sha256').update(m[0].split('$$')[1], 'utf8').digest('hex'));
    assert.ok(found.roles.filter(role => ['anon', 'authenticated'].includes(role.role)).every(role => role.execute));
    assert.ok(found.roles.every(role => !role.unexpected_effective_execute));
  }
  pass('diagnóstico SELECT funciona antes/después sin llamar la RPC ni consultar datos privados');
  assert.equal((await db.query("select p.prosecdef,p.provolatile,p.proconfig from pg_proc p where oid='public.catalog_page_v1(jsonb)'::regprocedure")).rows[0].prosecdef, false);
  pass('borrador compilado y ejecutado solo en memoria; invoker sin dependencia de 008');
  await assert.rejects(() => db.exec(source), error => error.code === 'P0001'); await rollback();
  pass('repetición rechazada de forma transaccional');
  const flags = (await db.query("select rolname,rolsuper,rolbypassrls from pg_roles where rolname in('anon','authenticated')")).rows;
  assert.ok(flags.every(role => !role.rolsuper && !role.rolbypassrls));
  let pages = 0;
  for (const user of [null, ...owners]) {
    await identity(user);
    const reference = createCatalogReference({ subject: user, readVisibleRows: () => projected(user) });
    for (const entry of sqlCases) {
      let cursor = null; const seen = new Set();
      do {
        const expected = reference.page({ ...entry.request, cursor }), actual = await rpc({ ...entry.request, cursor });
        assert.equal(actual.ok, true, JSON.stringify({ case: entry.name, actual }));
        assert.deepEqual(actual.items, expected.items); assert.deepEqual(actual.page, expected.page);
        assert.equal(actual.payments_enabled, false); assert.equal(actual.cash_enabled, false);
        assert.equal(JSON.stringify(actual).includes('synthetic-private'), false);
        for (const row of actual.items) { assert.ok(!seen.has(row.id)); seen.add(row.id); }
        cursor = actual.page.next_cursor; pages++;
      } while (cursor);
    }
    for (const value of unicodeCorpus) assert.equal((await db.query('select catalog_private.search_key_v1($1) key', [value])).rows[0].key, normalizeCatalogText(value));
    await assert.rejects(() => db.query('select * from public.orders'), error => error.code === '42501');
  }
  pass(`RLS PostgreSQL real sobre fixtures anon/A/B/C/D, Unicode y ${pages} páginas contra referencia JS; no JWT/Auth remoto`);
  await identity(null);
  await assert.rejects(() => db.exec("update public.products set title='unauthorized'"), error => error.code === '42501');
  await assert.rejects(() => db.exec('create table catalog_private.unauthorized(id integer)'), error => error.code === '42501');
  assert.ok(!/app_private|public\.orders|public\.claims|public\.delivery_operations/.test(source));
  pass('ningún nuevo permiso de escritura o CREATE; namespaces y lecturas financieras/privadas fuera del borrador');
  const golden = (await rpc({ search: 'pokemon', page_size: 1 })).page.next_cursor;
  if (golden) assert.equal(golden.fingerprint, prepareCatalogRequest({ search: 'pokemon', page_size: 1 }).fingerprint);
  const standard = (await db.query("select catalog_private.fingerprint_v1(null,'all','pokemon',null,null,'recent',12) fp")).rows[0].fp;
  assert.equal(standard, '03debdd479397762c298eaf10263b599f59d4bd7dd71d39cf5bae61f76df7a7a');
  for (const search of ['a_b', '!%_\\', "' OR 1=1 --", '👩‍💻', '東京', 'NIÑO', 'ΟΣ', 'a\nb']) {
    const prepared = prepareCatalogRequest({ search }); if (!prepared.ok) continue;
    const fp = (await db.query("select catalog_private.fingerprint_v1(null,'all',$1,null,null,'recent',12) fp", [prepared.filters.search])).rows[0].fp;
    assert.equal(fp, prepared.fingerprint);
  }
  pass('fingerprint canónico SQL/JS coincide en vector dorado, Unicode y escapes');
  for (const invalid of [null, [], true, 'x', { p_role: 'admin' }, { page_size: 0 }, { page_size: 13 }, { page_size: '12' }, { page_size: null }, { search: null },
    { sale_type: null }, { sort: null }, { category: 'Private' }, { min_price: '1' }, { min_price: -1 }, { max_price: 1.2 }, { min_price: 100, max_price: 1 },
    { search: 'a'.repeat(91) }, { search: '\u0301\u0308' }]) assert.deepEqual(await rpc(invalid), { ok: false, code: 'invalid_request' });
  assert.deepEqual(await rpc({ search: 'ñ' }), { ok: false, code: 'query_too_short' });
  for (const page_size of [1, 12]) assert.ok((await rpc({ page_size })).items.length <= page_size);
  pass('validaciones del servidor: tipos, claves, límites, vacío/uno/dos caracteres y rangos');
  const first = await rpc(), cursor = first.page.next_cursor;
  const bad = [{}, { ...cursor, v: 2 }, { ...cursor, extra: true }, { ...cursor, fingerprint: 'f'.repeat(64) },
    { ...cursor, position: { id: cursor.position.id, created_at: '2026-02-30T00:00:00.000000Z' } },
    { ...cursor, position: { id: cursor.position.id, created_at: null } }];
  for (const value of bad) assert.deepEqual(await rpc({ cursor: value }), { ok: false, code: 'invalid_cursor' });
  assert.deepEqual(await rpc({ sort: 'price_asc', cursor }), { ok: false, code: 'invalid_cursor' });
  await identity(owners[1]); assert.deepEqual(await rpc({ cursor }), { ok: false, code: 'invalid_cursor' });
  await identity(null);
  const publicSeek = await rpc({ cursor: { ...cursor, position: { id: fixtureId(999999), created_at: '2026-10-28T10:00:00.000002Z' } } });
  assert.equal(publicSeek.ok, true);
  pass('cursor malformado o de otro ámbito se rechaza; una posición pública válida no concede acceso');
  const helperSql = {
    search_key_v1: 'select catalog_private.search_key_v1($1::text) value',
    trim_v1: 'select catalog_private.trim_v1($1::text) value',
    pattern_v1: 'select catalog_private.pattern_v1($1::text) value',
    cursor_time_v1: "select to_char(catalog_private.cursor_time_v1($1::text) at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') value",
    fingerprint_v1: 'select catalog_private.fingerprint_v1($1::text,$2::text,$3::text,$4::integer,$5::integer,$6::text,$7::integer) value',
  };
  async function helper(name, args) {
    helperReads++; return (await db.query(helperSql[name], args)).rows[0].value;
  }
  async function invalidHelper(name, args) {
    // An expected PostgreSQL error aborts its transaction until rollback. Keep
    // each negative case isolated without leaving the READ ONLY transaction.
    await db.exec('savepoint helper_invalid');
    try {
      await assert.rejects(() => helper(name, args), error => error.code === '22023'
        && error.message === 'Entrada no admitida.' && !error.detail && !error.hint);
    } finally { await db.exec('rollback to savepoint helper_invalid; release savepoint helper_invalid'); }
  }
  const fingerprintArgs = [null, 'all', '', null, null, 'recent', 12];
  const largeInput = 'x'.repeat(1024 * 1024), largeChecks = [];
  for (const user of [null, owners[0]]) {
    await identity(user); await db.exec('begin read only');
    try {
      for (const name of ['search_key_v1', 'trim_v1', 'pattern_v1', 'cursor_time_v1']) assert.equal(await helper(name, [null]), null);
      for (const value of ['', 'PS', 'PC', 'VR', 'DS', 'NIÑO', 'Nin\u0303o', 'Pokémon', 'PINGÜINO', '東京', '👩‍💻', 'a'.repeat(90), '🧪'.repeat(90)]) {
        assert.equal(await helper('search_key_v1', [value]), normalizeCatalogText(value));
        assert.equal(await helper('trim_v1', [value]), value);
      }
      assert.equal(await helper('trim_v1', ['\u0085 PS\u3000']), 'PS');
      for (const value of ['a'.repeat(91), '🧪'.repeat(91), ' '.repeat(91) + 'PS']) {
        await invalidHelper('search_key_v1', [value]); await invalidHelper('trim_v1', [value]);
      }
      // NFC decomposes these valid characters into MORE code points. Do not
      // apply the raw 90-character limit again to an already-normalized term.
      for (const value of ['\u0f43'.repeat(90), '\u{1d160}'.repeat(90)]) {
        const normalized = normalizeCatalogText(value);
        assert.ok(Array.from(normalized).length > 90);
        assert.equal(await helper('search_key_v1', [value]), normalized);
        assert.equal(await helper('pattern_v1', [normalized]), `%${normalized}%`);
        const args = [...fingerprintArgs]; args[2] = normalized;
        assert.equal(await helper('fingerprint_v1', args), prepareCatalogRequest({ search: value }, user).fingerprint);
      }
      for (const value of ['%_!', "' OR 1=1 --", 'PS', 'ñ', 'a'.repeat(512), '🧪'.repeat(512)]) {
        assert.equal(await helper('pattern_v1', [value]), `%${value.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_')}%`);
      }
      for (const value of ['a'.repeat(513), '🧪'.repeat(513)]) await invalidHelper('pattern_v1', [value]);
      for (const value of ['0001-01-01T00:00:00.000000Z', '2024-02-29T23:59:59.999999Z', '9999-12-31T23:59:59.999999Z']) {
        assert.equal(await helper('cursor_time_v1', [value]), value);
      }
      for (const value of ['', '2026-02-30T00:00:00.000000Z', '2026-02-28T24:00:00.000000Z', '2026-01-01T00:00:60.000000Z',
        '0000-01-01T00:00:00.000000Z', '2026-01-01T00:00:00.000000+00:00', 'infinity', "'; select 1; --", 'ñ'.repeat(27)]) {
        assert.equal(await helper('cursor_time_v1', [value]), null);
      }
      for (const category of [null, 'Consolas', 'Videojuegos', 'Accesorios', 'Componentes', 'Coleccionables']) {
        const args = [...fingerprintArgs]; args[0] = category;
        assert.equal(await helper('fingerprint_v1', args), prepareCatalogRequest({ category }, user).fingerprint);
      }
      for (const term of ['PS', 'PC', 'VR', 'DS', '', 'niño', 'ñn', 'pokemon', '%_!', 'a\nb', 'a'.repeat(512), '🧪'.repeat(512)]) {
        const args = [...fingerprintArgs]; args[2] = term;
        assert.match(await helper('fingerprint_v1', args), /^[0-9a-f]{64}$/);
      }
      for (const [index, value] of [[0, 'unknown'], [0, 'x'.repeat(65)], [0, 'ñ'.repeat(33)], [1, null], [1, 'cash'], [1, 'x'.repeat(8)],
        [2, null], [2, 'ñ'], [2, 'a'.repeat(513)], [2, '🧪'.repeat(513)], [3, -1], [3, 1000001], [4, -1], [4, 1000001],
        [5, null], [5, 'price;sql'], [5, 'x'.repeat(11)], [6, null], [6, 0], [6, 13]]) {
        const args = [...fingerprintArgs]; args[index] = value; await invalidHelper('fingerprint_v1', args);
      }
      await invalidHelper('fingerprint_v1', [null, 'all', '', 100, 99, 'recent', 12]);
      for (const low of [null, 0, 1000000]) for (const high of [null, 1000000]) for (const size of [1, 12]) {
        const args = [...fingerprintArgs]; args[3] = low; args[4] = high; args[6] = size;
        assert.match(await helper('fingerprint_v1', args), /^[0-9a-f]{64}$/);
      }
      const start = performance.now();
      for (const name of ['search_key_v1', 'trim_v1', 'pattern_v1']) await invalidHelper(name, [largeInput]);
      assert.equal(await helper('cursor_time_v1', [largeInput]), null);
      for (const index of [0, 1, 2, 5]) {
        const args = [...fingerprintArgs]; args[index] = largeInput; await invalidHelper('fingerprint_v1', args);
      }
      largeChecks.push({ role: user ? 'authenticated' : 'anon', calls: 8, inputBytesPerCall: largeInput.length,
        elapsedMs: Math.round((performance.now() - start) * 1000) / 1000 });
      assert.equal(await helper('search_key_v1', ['PS']), 'ps');
      assert.equal((await db.query("select current_setting('transaction_read_only') value")).rows[0].value, 'on');
    } finally { await db.exec('rollback'); }
  }
  pass('llamadas directas anon/authenticated: cinco helpers, limites, nulos, errores neutros y entradas de 1 MiB en READ ONLY');
  pass('Unicode expandido conserva busquedas validas; no se reaplica el limite de texto original al fingerprint/patron');
  console.log(`Medicion local de rechazos grandes (incluye transporte WASM, no garantia de produccion): ${JSON.stringify(largeChecks)}`);
  for (const [name, work] of [['search_key_v1', 'pg_catalog.lower'], ['trim_v1', 'pg_catalog.btrim'],
    ['pattern_v1', 'pg_catalog.replace'], ['cursor_time_v1', '!~'], ['fingerprint_v1', 'pg_catalog.jsonb_build_array']]) {
    const definition = source.match(new RegExp(`create function catalog_private\\.${name}\\([\\s\\S]*?\\$\\$;`))[0];
    assert.ok(definition.indexOf('octet_length(') < definition.indexOf(work));
  }
  pass('barreras de bytes antes de ICU/trim/escape/regex/JSON-hash; sin nueva funcion ni cambio de ACL');
  await identity(null);
  const client = { rpc: (_name, { p_request }) => { assert.equal(_name, 'catalog_page_v1'); return Promise.resolve(rpc(p_request)).then(data => ({ data, error: null })); },
    storage: { from: bucket => { assert.equal(bucket, 'product-images'); return { getPublicUrl: image => ({ data: { publicUrl: `https://images.invalid/${image}` } }) }; } } };
  const adapter = createCatalogRpcPages(client);
  const result = await adapter.page({ query: 'PS', sort: 'price_desc' });
  assert.equal(result.status, 'ready'); assert.ok(result.items.every(item => item.title.includes('PS')));
  pass('adaptador obtiene y convierte el DTO SQL real local sin cargar catálogo ni detalles privados');
  await db.exec('reset role');
  assert.equal(await domainSnapshot(), before);
  assert.deepEqual((await db.query("select oid::regprocedure::text signature,pg_get_functiondef(oid) definition from pg_proc where oid in('public.auction_snapshot(uuid)'::regprocedure,'public.respond_exchange(uuid,text)'::regprocedure) order by 1")).rows, oldDefinitions);
  assert.deepEqual((await db.query("select oid::regclass::text name,relacl::text acl from pg_class where oid in('public.products'::regclass,'public.auctions'::regclass,'public.profiles'::regclass) order by 1")).rows, oldACL);
  pass('datos/sentinelas 007/008, firmas antiguas y permisos de fuentes conservados; no se prueba toda 008');
  console.log(`PASS: ${checks} grupos, ${requests} lecturas RPC y ${helperReads} llamadas directas locales. PostgreSQL PGlite 18.6; NO validación 17.11, Supabase o instalación.`);
} catch (error) {
  console.error(JSON.stringify({ failed: true, code: error.code || 'assertion', message: String(error.message).slice(0, 1500) }));
  process.exitCode = 1;
} finally { await db.close(); }
