// Local block 3 only. No connection string, env loader, socket, migration or index.
// PGlite() owns a NEW in-memory cluster. Closing it never touches native Postgres.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { PGlite } from '@electric-sql/pglite';
import { parse } from 'libpg-query';
import { normalizeCatalogText, prepareCatalogRequest, createCatalogReference } from './support/catalog-contract-reference.mjs';
import { unicodeCorpus, catalogFixtures, fixtureId, owners, sqlCases, performanceCases } from './support/catalog-postgres-corpus.mjs';

const args = process.argv.slice(2);
assert.ok(args.every(arg => ['--performance', '--matrix'].includes(arg)) && new Set(args).size === args.length, 'Only fixed local test modes are accepted');
const report = { generated_at: new Date().toISOString(), engine_scope: 'ephemeral-pglite-only',
  production_connected: false, native_postgres_connected: false, migrations_executed: false,
  candidate_indexes_installed: false, rls_verified: false, supabase_verified: false,
  functional: {}, performance: [], failures: [] };
const fixtureTemplate = await readFile(new URL('./catalog-lab/fixture.sql', import.meta.url), 'utf8');
const queryTemplate = await readFile(new URL('./catalog-lab/query.sql', import.meta.url), 'utf8');
const orders = { recent: ['created_at DESC,id DESC', '(created_at,id)<($6::timestamptz,$8::uuid)'],
  price_asc: ['effective_price ASC,id ASC', '(effective_price,id)>($7::bigint,$8::uuid)'],
  price_desc: ['effective_price DESC,id DESC', '(effective_price,id)<($7::bigint,$8::uuid)'] };
const sqlFor = sort => queryTemplate.replace('/*__ORDER__*/', orders[sort][0]).replace('/*__CURSOR__*/', orders[sort][1]);
const round = n => Math.round(n * 1000) / 1000;
const mib = n => round(n / 1048576);
let pageReads = 0, fixtureRows = [];
const db = new PGlite(); // No dataDir, extensions, username or production options.

function statement(request = {}) {
  const prepared = prepareCatalogRequest(request);
  if (!prepared.ok) return prepared; // Reference validation ONLY; no RPC exists yet.
  const { filters: f, position: p } = prepared;
  return { ...prepared, sql: sqlFor(f.sort), params: [f.category, f.sale_type, f.search, f.min_price, f.max_price,
    p?.created_at ?? null, p?.price ?? null, p?.id ?? null, f.page_size] };
}
async function page(request = {}) {
  const prepared = statement(request);
  if (!prepared.ok) return prepared;
  pageReads++;
  const result = await db.query(prepared.sql, prepared.params);
  // PGlite returns numeric as text; the real JSON DTO would carry a JSON number.
  // The SQL eligibility bound (1..1,000,000) keeps this conversion exact.
  const rows = result.rows.map(row => ({ ...row, effective_price: Number(row.effective_price) })), f = prepared.filters;
  assert.ok(rows.length <= 13);
  const items = rows.slice(0, f.page_size), last = items.at(-1), hasMore = rows.length > f.page_size;
  return { ok: true, items, page: { has_more: hasMore, next_cursor: hasMore ? {
    v: 1, fingerprint: prepared.fingerprint, position: f.sort === 'recent'
      ? { created_at: last.created_at, id: last.id } : { price: Number(last.effective_price), id: last.id },
  } : null } };
}
async function loadRows(rows) {
  // These two temporary tables were created by this process, never project data.
  await db.exec('truncate pg_temp.catalog_products,pg_temp.catalog_auctions');
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await db.query(`insert into pg_temp.catalog_products
      select x.id,x.owner_id,x.title,x.category,x.sale_type,x.price,x.created_at
      from jsonb_to_recordset($1::jsonb) as x(id uuid,owner_id uuid,title text,category text,sale_type text,price numeric(12,0),created_at timestamptz)`, [JSON.stringify(chunk)]);
    const auctions = chunk.filter(row => row.auction).map(row => row.auction);
    if (auctions.length) await db.query(`insert into pg_temp.catalog_auctions
      select x.id,x.product_id,x.seller_id,x.initial_price,x.highest_amount,x.bid_count,x.status,x.revision
      from jsonb_to_recordset($1::jsonb) as x(id uuid,product_id uuid,seller_id uuid,initial_price bigint,highest_amount bigint,bid_count integer,status text,revision integer)`, [JSON.stringify(auctions)]);
  }
  fixtureRows = rows;
  await db.exec('analyze pg_temp.catalog_products; analyze pg_temp.catalog_auctions');
  const indexes = (await db.query("select count(*)::int n from pg_index where indrelid in('pg_temp.catalog_products'::regclass,'pg_temp.catalog_auctions'::regclass)")).rows[0].n;
  assert.equal(indexes, 0, 'Even candidate/primary-key indexes are absent in this baseline');
}
async function totals() {
  return (await db.query(`select (select count(*) from pg_temp.catalog_products) products,
    (select coalesce(sum(price),0)::text from pg_temp.catalog_products) prices,
    (select count(*) from pg_temp.catalog_auctions) auctions,
    (select coalesce(sum(revision),0)::text from pg_temp.catalog_auctions) revisions,
    (select coalesce(sum(highest_amount),0)::text from pg_temp.catalog_auctions) highest`)).rows[0];
}
async function comparePages(rows, request) {
  const reference = createCatalogReference({ readVisibleRows: () => rows });
  let cursor = null, calls = 0; const seen = new Set();
  do {
    const expected = reference.page({ ...request, cursor }), actual = await page({ ...request, cursor });
    assert.equal(expected.ok, true); assert.equal(actual.ok, true);
    assert.deepEqual(actual.items, expected.items.map(row => ({ id: row.id, title: row.title,
      category: row.category, sale_type: row.sale_type, effective_price: row.effective_price, created_at: row.created_at })));
    assert.deepEqual(actual.page, { has_more: expected.page.has_more, next_cursor: expected.page.next_cursor });
    for (const item of actual.items) { assert.ok(!seen.has(item.id)); seen.add(item.id); }
    cursor = actual.page.next_cursor; assert.ok(++calls <= 1000);
  } while (cursor);
  return calls;
}
function metrics(plan) {
  const scans = [], indexes = [], nodes = [], sorts = [];
  function visit(node) {
    nodes.push(node['Node Type']);
    if (node['Index Name']) indexes.push(node['Index Name']);
    if (['Seq Scan', 'Index Scan', 'Index Only Scan', 'Bitmap Heap Scan'].includes(node['Node Type'])) {
      const loops = node['Actual Loops'] || 0;
      scans.push({ relation: node['Relation Name'], node: node['Node Type'], loops,
        outputRows: node['Actual Rows'], filteredRows: node['Rows Removed by Filter'] || 0,
        approximateTupleVisits: ((node['Actual Rows'] || 0) + (node['Rows Removed by Filter'] || 0)) * loops });
    }
    if (node['Sort Method']) sorts.push({ method: node['Sort Method'], spaceKB: node['Sort Space Used'], spaceType: node['Sort Space Type'] });
    for (const child of node.Plans || []) visit(child);
  }
  visit(plan.Plan);
  const root = plan.Plan;
  return { planningMs: plan['Planning Time'], executionMs: plan['Execution Time'], returnedWithLookahead: root['Actual Rows'],
    approximateScanTupleVisits: scans.reduce((sum, item) => sum + item.approximateTupleVisits, 0), scans,
    indexes: [...new Set(indexes)], nodeTypes: [...new Set(nodes)], sorts,
    rootBuffers: Object.fromEntries(['Shared Hit Blocks', 'Shared Read Blocks', 'Local Hit Blocks', 'Local Read Blocks', 'Temp Read Blocks', 'Temp Written Blocks'].map(key => [key, root[key] ?? null])) };
}
async function benchmark(size, auctionPercent, skewed) {
  await loadRows(catalogFixtures(size, auctionPercent, skewed));
  const before = await totals(), cpuStart = process.cpuUsage();
  const references = createCatalogReference({ readVisibleRows: () => fixtureRows });
  const cases = [...performanceCases];
  // A valid public seek near the end, with the same fingerprint as its query.
  for (const sort of ['recent', 'price_asc']) {
    const price = row => row.auction?.highest_amount ?? row.auction?.initial_price ?? row.price;
    const ordered = [...fixtureRows].sort((a, b) => sort === 'recent'
      ? b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
      : price(a) - price(b) || a.id.localeCompare(b.id));
    const last = ordered[Math.max(0, ordered.length - 14)], prepared = prepareCatalogRequest({ sort });
    cases.push({ name: `deep-${sort}`, request: { sort, cursor: { v: 1, fingerprint: prepared.fingerprint,
      position: sort === 'recent' ? { created_at: last.created_at, id: last.id } : { price: price(last), id: last.id } } } });
  }
  const results = [];
  for (const entry of cases) {
    const q = statement(entry.request), expected = references.page(entry.request);
    let warm;
    await db.exec("begin read only;set local statement_timeout='2s'");
    try { warm = await page(entry.request); } finally { await db.exec('rollback'); }
    assert.deepEqual(warm.items.map(row => row.id), expected.items.map(row => row.id));
    const samples = [];
    for (let repeat = 0; repeat < 3; repeat++) {
      const start = performance.now();
      await db.exec("begin read only;set local statement_timeout='2s'");
      try {
        const plan = (await db.query(`explain (analyze,buffers,settings,format json) ${q.sql}`, q.params)).rows[0]['QUERY PLAN'][0];
        samples.push({ status: 'ok', wallMs: round(performance.now() - start), ...metrics(plan) });
      } catch (error) {
        samples.push({ status: error.code === '57014' ? 'query_timeout' : 'error', code: error.code || 'local_error', wallMs: round(performance.now() - start) });
      } finally { await db.exec('rollback'); }
    }
    results.push({ name: entry.name, queryLength: Array.from(q.filters.search).length, samples });
  }
  assert.deepEqual(await totals(), before);
  const sizes = (await db.query("select pg_total_relation_size('pg_temp.catalog_products')::bigint products_bytes,pg_total_relation_size('pg_temp.catalog_auctions')::bigint auctions_bytes")).rows[0];
  const cpu = process.cpuUsage(cpuStart), memory = process.memoryUsage();
  const result = { size, auctionPercent, distribution: skewed ? 'skewed' : 'uniform', concurrency: 1, cache: 'warmed-memory',
    candidateIndexes: 0, relationSizes: sizes, nodeRSSMiB: mib(memory.rss), nodeHeapMiB: mib(memory.heapUsed),
    wholePhaseCPUMs: round((cpu.user + cpu.system) / 1000), cases: results };
  report.performance.push(result);
  const good = results.flatMap(row => row.samples).filter(sample => sample.status === 'ok');
  const failed = results.flatMap(row => row.samples).filter(sample => sample.status !== 'ok');
  if (failed.length) {
    report.failures.push({ code: 'local_benchmark_failures', size, auctionPercent, skewed, count: failed.length });
    process.exitCode = 1;
  }
  console.log(JSON.stringify({ performance: size, auctionPercent, skewed, samples: good.length, failures: failed.length,
    maxSQLExecutionMs: good.length ? round(Math.max(...good.map(sample => sample.executionMs))) : null, nodeRSSMiB: result.nodeRSSMiB }));
}

try {
  report.metadata = (await db.query(`select version() version,current_setting('server_version_num') version_num,
    current_setting('server_encoding') encoding,to_jsonb(d)->>'datcollate' lc_collate,
    to_jsonb(d)->>'datctype' lc_ctype,to_jsonb(d)->>'datlocprovider' provider
    from pg_database d where datname=current_database()`)).rows[0];
  assert.ok(report.metadata.version.includes('PGlite')); assert.equal(report.metadata.encoding, 'UTF8');
  report.collations = (await db.query("select collname,collprovider,collisdeterministic,collversion,pg_collation_actual_version(oid) actual_version from pg_collation where collname in('C','C.utf8','und-x-icu','unicode')")).rows;
  assert.ok(report.collations.some(row => row.collname === 'und-x-icu' && row.collisdeterministic), 'Existing deterministic ICU is required; no collation is installed automatically');
  report.node = { version: process.version, unicode: process.versions.unicode, icu: process.versions.icu };
  await db.exec("set pjd.catalog_lab='ephemeral-pglite';set timezone='UTC'");
  const fixture = fixtureTemplate.replace('/*__CASE_COLLATION__*/', 'COLLATE "und-x-icu"');
  await parse(fixture); for (const sort of Object.keys(orders)) await parse(sqlFor(sort));
  await db.exec(fixture);
  const helper = fixtureTemplate.match(/create function pg_temp\.catalog_key_v1[\s\S]*?end \$\$;/)[0];
  for (const [name, collation] of [['c', 'COLLATE "C"'], ['default', '']]) {
    await db.exec(helper.replace('catalog_key_v1', `catalog_key_${name}`).replace('/*__CASE_COLLATION__*/', collation));
  }
  const corpus = [...new Set(unicodeCorpus.flatMap(value => [value, value.normalize('NFD')]))];
  const comparisons = [];
  for (const input of corpus) {
    const value = (await db.query('select pg_temp.catalog_key_v1($1) icu,pg_temp.catalog_key_c($1) c,pg_temp.catalog_key_default($1) db_default', [input])).rows[0];
    comparisons.push({ input, js: normalizeCatalogText(input), ...value });
  }
  report.normalization = { corpusSize: corpus.length, icuMismatches: comparisons.filter(row => row.js !== row.icu),
    cMismatches: comparisons.filter(row => row.js !== row.c), defaultMismatches: comparisons.filter(row => row.js !== row.db_default) };
  assert.deepEqual(report.normalization.icuMismatches, []);
  console.log(`OK Unicode: ${corpus.length} entradas; ICU coincide con JS. Diferencias C=${report.normalization.cMismatches.length}, default=${report.normalization.defaultMismatches.length}.`);
  let literalPairs = 0;
  for (const term of ['PS', 'PC', 'VR', 'DS', '50%', 'a_b', '%_', '!!', '!%_\\', "' OR 1=1 --", 'niño', '東京']) {
    const normalized = normalizeCatalogText(term);
    for (const text of [term, `antes ${term} después`, 'Cualquier otro texto aXb 500', '']) {
      const matched = (await db.query("select (pg_temp.catalog_key_v1($1) collate \"C\" like pg_temp.catalog_like_literal($2) escape '!') matched", [text, normalized])).rows[0].matched;
      assert.equal(matched, normalizeCatalogText(text).includes(normalized)); literalPairs++;
    }
  }
  let comparisonsCount = 0;
  for (const size of [0, 1, 12, 13, 100]) {
    const rows = catalogFixtures(size); await loadRows(rows); const before = await totals();
    await db.exec("begin read only;set local statement_timeout='2s'");
    try { for (const entry of sqlCases) comparisonsCount += await comparePages(rows, entry.request); }
    finally { await db.exec('rollback'); }
    assert.deepEqual(await totals(), before);
  }
  const anomalies = catalogFixtures(100);
  const missing = structuredClone(anomalies.find(row => row.sale_type === 'auction')); missing.id = fixtureId(900001); delete missing.auction;
  const mismatch = structuredClone(anomalies.find(row => row.sale_type === 'auction')); mismatch.id = fixtureId(900002);
  mismatch.auction = { ...mismatch.auction, id: fixtureId(950002), product_id: mismatch.id, seller_id: owners[1] };
  await loadRows([...anomalies, missing, mismatch]);
  comparisonsCount += await comparePages(fixtureRows, { sort: 'price_asc' });
  const beforeInvalid = pageReads;
  for (const request of [{ search: 'P' }, { page_size: 13 }, { search: 'a'.repeat(91) }, { search: '\ud800' }, { p_role: 'admin' },
    { cursor: { v: 2 } }, { cursor: { v: 1, fingerprint: 'f'.repeat(64), position: { id: fixtureId(1), price: 0 } } }]) assert.equal((await page(request)).ok, false);
  assert.equal(pageReads, beforeInvalid);
  report.functional = { status: 'passed', unicodeInputs: corpus.length, sqlLiteralPairs: literalPairs,
    completePageComparisons: comparisonsCount, datasetSizes: [0, 1, 12, 13, 100], invalidRequestsRejectedBeforeSQL: 7,
    anomalousAuctionRowsExcluded: 2, indexesInstalled: 0, serverValidationImplemented: false };
  console.log(`OK SQL: ${literalPairs} pares literales y ${comparisonsCount} páginas comparadas con JS; entradas inválidas detenidas antes del SQL.`);
  if (args.includes('--performance') || args.includes('--matrix')) {
    const distributions = args.includes('--matrix') ? [false, true] : [false];
    const percentages = args.includes('--matrix') ? [0, 30, 80] : [30];
    for (const size of [100, 1000, 10000]) for (const percentage of percentages) for (const skewed of distributions) await benchmark(size, percentage, skewed);
  }
} catch (error) {
  // This runner only owns synthetic SQL/data; no production error is captured.
  report.failures.push({ code: error.code || 'local_test_failure', message: String(error.message || 'Local check failed').slice(0, 1000) });
  process.exitCode = 1;
  console.log(JSON.stringify({ failed: true, code: report.failures.at(-1).code }));
} finally {
  await db.close();
  report.closed = true;
  await mkdir(new URL('../.cache/', import.meta.url), { recursive: true });
  const path = new URL(`../.cache/catalog-block3-local-${Date.now()}.json`, import.meta.url);
  await writeFile(path, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(`Informe sintético: ${path.pathname.split('/').at(-1)}; motor efímero cerrado.`);
}
