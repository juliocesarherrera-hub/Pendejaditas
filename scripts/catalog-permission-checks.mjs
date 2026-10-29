// Permission tests in NEW PGlite memory only. No env, sockets, native DB or backups.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { parse } from 'libpg-query';

const draft = await readFile(new URL('../supabase/drafts/202610280009_catalog.sql', import.meta.url), 'utf8');
const diagnostic = await readFile(new URL('../supabase/diagnostics/audit-catalog.sql', import.meta.url), 'utf8');
const users = [1, 2, 3, 4].map(n => `11000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const calls = [
  "select catalog_private.search_key_v1('NIÑO') value",
  "select catalog_private.trim_v1(' PS ') value",
  "select catalog_private.pattern_v1('%_') value",
  "select catalog_private.cursor_time_v1('2026-10-28T12:00:00.000000Z') value",
  "select catalog_private.fingerprint_v1(null,'all','ps',null,null,'recent',12) value",
  "select public.catalog_page_v1('{}'::jsonb) value",
];
let checks = 0;
function pass(label) { console.log(`OK permisos ${++checks}: ${label}`); }
async function asRole(db, role, callback) {
  // Role names are fixed synthetic fixtures; quote identifiers including embedded quotes.
  await db.exec(`set role "${role.replaceAll('"', '""')}"`);
  try { return await callback(); } finally { await db.exec('reset role'); }
}
async function audit(db) {
  await db.exec('begin read only');
  try { return (await db.query(diagnostic)).rows[0].jsonb_build_object; }
  finally { await db.exec('rollback'); }
}
async function snapshot(db) {
  const result = await db.query(`select jsonb_build_object(
    'data',(select jsonb_agg(to_jsonb(p) order by id) from public.products p),
    'tables',(select jsonb_agg(jsonb_build_array(relname,relowner,relacl::text,relrowsecurity) order by relname)
      from pg_class where oid in('public.products'::regclass,'public.profiles'::regclass,'public.auctions'::regclass)),
    'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p),
    'public_schema',(select jsonb_build_array(nspowner,nspacl::text) from pg_namespace where nspname='public'),
    'legacy',(select jsonb_build_array(proowner,proacl::text,pg_get_functiondef(oid)) from pg_proc where oid='public.legacy_rpc()'::regprocedure),
    'defaults',(select jsonb_agg(to_jsonb(d) order by oid) from pg_default_acl d),
    'memberships',(select jsonb_agg(to_jsonb(m) order by member,roleid) from pg_auth_members m)) value`);
  return createHash('sha256').update(JSON.stringify(result.rows[0].value)).digest('hex');
}
async function fixture(db, mode) {
  await db.exec(`create role anon; create role authenticated;
    create role review_denied; create role review_group; create role review_member;
    create role "review role""quoted"; create role service_role bypassrls;
    create role review_inherited; create role review_proxy noinherit;
    grant review_group to review_member with inherit true,set false;
    grant authenticated to review_proxy with inherit false,set true;
    alter default privileges grant execute on functions to review_group with grant option;
    alter default privileges grant execute on functions to anon with grant option;
    alter default privileges grant execute on functions to "review role""quoted";
    alter default privileges grant execute on functions to service_role;
    create function public.legacy_rpc() returns integer language sql stable as $$select 7$$;
    create schema auth; grant usage on schema auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('lab.uid',true),'')::uuid$$;
    create table public.profiles(id uuid primary key,display_name text);
    create table public.products(id uuid primary key,owner_id uuid references public.profiles(id),title text,category text,condition text,sale_type text,
      price numeric(12,0),area text,image_path text,created_at timestamptz,updated_at timestamptz,visible boolean);
    create table public.auctions(id uuid primary key,product_id uuid unique references public.products(id),seller_id uuid references public.profiles(id),
      initial_price bigint,highest_amount bigint,bid_count integer,status text,revision integer,starts_at timestamptz,ends_at timestamptz);
    alter table public.products enable row level security;
    alter table public.profiles enable row level security;
    alter table public.auctions enable row level security;
    grant select on public.products,public.profiles,public.auctions to anon,authenticated;
    create policy review_product_visibility on public.products for select using(visible or owner_id=auth.uid());
    create policy review_profiles on public.profiles for select using(true);
    create policy review_auctions on public.auctions for select using(false);
    insert into public.profiles values('${users[0]}','Synthetic A'),('${users[1]}','Synthetic B');
    insert into public.products values
      ('22000000-0000-4000-8000-000000000001','${users[0]}','PS public listing','Consolas','Nuevo','fixed',500,'Centro',
       '${users[0]}/22000000-0000-4000-8000-000000000001.webp',now(),now(),true),
      ('22000000-0000-4000-8000-000000000002','${users[1]}','PS protected listing','Consolas','Nuevo','fixed',800,'Centro',
       '${users[1]}/22000000-0000-4000-8000-000000000002.webp',now(),now(),false);`);
  if (mode === 'inherited-before') await db.exec('grant authenticated to review_inherited with inherit true,set false');
  if (mode === 'schema-default-before') await db.exec('alter default privileges grant usage on schemas to review_group');
  await db.exec("set pjd.catalog_draft_validation='isolated-local-only'");
}

const tree = await parse(diagnostic);
assert.equal(tree.stmts.length, 1); assert.ok(tree.stmts[0].stmt.SelectStmt);
assert.ok(!/alter default privileges|(?:grant|revoke)\s+\w+\s+to\s+/i.test(draft.replace(/--[^\n]*/g, '')));
pass('diagnostico SELECT unico; borrador no altera defaults ni membresias');
for (const mode of ['normal', 'delegated-before-cleanup', 'inherited-before', 'schema-default-before']) {
  const db = new PGlite();
  try {
    await fixture(db, mode);
    const before = await snapshot(db), initial = await audit(db);
    assert.equal(initial.catalog_schema_present, false);
    assert.ok(initial.database_roles.some(role => role.role === 'review_proxy' && role.can_set_authenticated && !role.inherits_authenticated));
    assert.ok(initial.default_privileges.some(entry => entry.acl.some(acl => acl.grantee === 'review_group' && acl.grant_option)));
    if (['inherited-before', 'schema-default-before'].includes(mode)) {
      await assert.rejects(() => db.exec(draft), error => error.code === 'P0001' &&
        (mode === 'inherited-before' ? error.message.includes('heredado') : error.message.includes('esquema nuevo')));
      await db.exec('rollback');
      assert.equal(await snapshot(db), before);
      const after = await audit(db);
      assert.equal(after.catalog_schema_present, false); assert.ok(after.functions.every(fn => !fn.present));
      pass(`${mode}: falla cerrada atomica sin modificar permisos/roles/objetos anteriores`);
      continue;
    }
    if (mode === 'delegated-before-cleanup') {
      const split = draft.indexOf('-- Reset ACLs of these SIX NEW functions');
      assert.ok(split > 0);
      await db.exec(draft.slice(0, split));
      await asRole(db, 'review_group', async () => db.exec('grant execute on function public.catalog_page_v1(jsonb) to review_denied with grant option'));
      await asRole(db, 'review_denied', async () => db.exec('grant execute on function public.catalog_page_v1(jsonb) to review_member'));
      await db.exec(draft.slice(split));
      assert.equal(await snapshot(db), before);
      const cleaned = (await audit(db)).functions.find(fn => fn.signature === 'public.catalog_page_v1(jsonb)');
      assert.ok(cleaned.roles.filter(role => ['review_group', 'review_denied', 'review_member'].includes(role.role)).every(role => !role.execute));
      pass('CASCADE elimina delegaciones encadenadas sobre la funcion nueva, sin alterar ACL anteriores');
      continue;
    }
    await db.exec(draft);
    assert.equal(await snapshot(db), before);
    const installed = await audit(db);
    assert.equal(installed.functions.length, 6);
    const privateSchema = installed.schemas.find(value => value.schema === 'catalog_private');
    assert.ok(privateSchema.roles.filter(role => ['anon', 'authenticated'].includes(role.role)).every(role => role.usage && !role.create));
    for (const fn of installed.functions) {
      assert.equal(fn.definer, false); assert.equal(fn.public_execute, false);
      assert.ok(fn.acl.every(acl => acl.grantee === fn.owner || ['anon', 'authenticated'].includes(acl.grantee) && !acl.grant_option));
      for (const role of ['anon', 'authenticated']) {
        const permission = fn.roles.find(value => value.role === role);
        assert.equal(permission.execute, true); assert.equal(permission.direct_execute, true); assert.equal(permission.grant_option, false);
      }
    }
    pass('seis funciones invoker: ACL exactas owner/anon/authenticated, sin PUBLIC ni grant option de cliente');
    pass('concesiones por defecto extra, heredadas de grupo y service_role removidas solo en funciones nuevas; defaults/legacy intactos');
    for (const role of ['review_denied', 'review_group', 'review_member', 'review role"quoted', 'service_role', 'review_proxy']) {
      assert.ok(installed.functions.every(fn => fn.roles.some(value => value.role === role && !value.execute)));
      await asRole(db, role, async () => {
        for (const sql of calls) await assert.rejects(() => db.query(sql), error => error.code === '42501');
      });
    }
    pass('36 ejecuciones no autorizadas rechazadas; incluidos herencia, nombre citado, bypassrls sin EXECUTE y proxy NOINHERIT');
    for (const role of ['anon', 'authenticated']) await asRole(db, role, async () => {
      for (const sql of calls) assert.ok((await db.query(sql)).rows.length === 1);
      // PostgreSQL may warn instead of throwing when no grant option is held.
      try { await db.exec('grant execute on function public.catalog_page_v1(jsonb) to review_denied'); }
      catch (error) { assert.equal(error.code, '42501'); }
      assert.equal((await db.query("select has_function_privilege('review_denied','public.catalog_page_v1(jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    });
    pass('las seis funciones ejecutables por anon/authenticated; ambos no pueden delegar EXECUTE');
    for (const user of [null, ...users]) {
      await db.query("select set_config('lab.uid',$1,false)", [user || '']);
      await asRole(db, user ? 'authenticated' : 'anon', async () => {
        const result = (await db.query(calls.at(-1))).rows[0].value;
        assert.equal(result.ok, true); assert.equal(result.items.length, user === users[1] ? 2 : 1);
        await assert.rejects(() => db.exec("update public.products set price=1"), error => error.code === '42501');
      });
    }
    pass('RLS real de fixtures: anon/A/C/D no leen producto privado de B; B conserva acceso; sin escrituras nuevas');
    await db.query("select set_config('lab.uid','',false)");
    await asRole(db, 'review_proxy', async () => {
      await db.exec('set role authenticated');
      assert.equal((await db.query(calls.at(-1))).rows[0].value.items.length, 1);
    });
    pass('SET ROLE explicito del proxy usa RLS de authenticated; no se confunde con herencia automatica');
    await db.exec('grant authenticated to review_inherited with inherit true,set false');
    const changed = await audit(db);
    assert.ok(changed.functions.every(fn => fn.roles.some(role => role.role === 'review_inherited' && role.execute && !role.direct_execute && role.unexpected_effective_execute)));
    await asRole(db, 'review_inherited', async () => assert.equal((await db.query(calls.at(-1))).rows[0].value.items.length, 1));
    pass('cambio administrativo posterior de membresia detectado como EXECUTE heredado inesperado; RLS sigue vigente');
    await db.exec('grant execute on function public.catalog_page_v1(jsonb) to public');
    const exposed = await audit(db);
    const exposedRpc = exposed.functions.find(fn => fn.signature === 'public.catalog_page_v1(jsonb)');
    assert.equal(exposedRpc.public_execute, true);
    assert.ok(exposedRpc.roles.some(role => role.role === 'review_denied' && role.execute && !role.direct_execute));
    pass('diagnostico identifica PUBLIC y permisos efectivos sin concesion directa; no es un rol ejecutable con SET ROLE');
    await db.exec('create function catalog_private.unexpected_overload(integer) returns integer language sql as $$select $1$$');
    const extra = (await audit(db)).functions.find(fn => !fn.expected_signature);
    assert.ok(extra && extra.present && extra.acl.length && extra.roles.length);
    pass('inventario incluye funciones inesperadas con ACL y roles efectivos, no solo las seis firmas previstas');
  } finally { await db.close(); }
}
console.log(`PASS: ${checks} grupos de permisos. Solo PostgreSQL PGlite 18.6; validacion 17.11/roles reales pendiente.`);
