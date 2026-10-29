// Block 1 only: synthetic data, no SQL, network, credentials or application imports.
import assert from 'node:assert/strict';
import {
  CATALOG_REFERENCE_VERSION, SEARCH_KEY_VERSION, MAX_PAGE_SIZE,
  normalizeCatalogText, prepareSearch, escapeCatalogLikePattern,
  validCursorTimestamp, prepareCatalogRequest, createCatalogReference,
} from './support/catalog-contract-reference.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B, C, D] = [1, 2, 3, 4].map(id);
const time = '2026-10-28T10:00:00.123456Z';
const product = (n, extra = {}) => ({
  id: id(n), owner_id: A, title: `Artículo ${n}`, price: 100 + n % 5,
  category: 'Consolas', sale_type: 'fixed', condition: 'Buen estado',
  area: 'Centro', image_path: `${A}/synthetic.webp`, seller_name: 'Perfil sintético',
  created_at: time, updated_at: time, ...extra,
});
const withAuction = (n, highest = null) => {
  const row = product(n, { sale_type: 'auction' });
  row.auction = { id: id(900000 + n), product_id: row.id, seller_id: A,
    initial_price: row.price, highest_amount: highest, bid_count: highest === null ? 0 : 2,
    status: 'active', starts_at: time, ends_at: '2026-11-01T12:00:00.000000Z', revision: 2 };
  return row;
};
function fixture(rows = [], subject = null) {
  let reads = 0;
  const reference = createCatalogReference({ subject, serverTime: () => time,
    readVisibleRows: () => { reads++; return rows; } });
  return { page: reference.page, reads: () => reads };
}
let checks = 0;
function test(label, run) { run(); checks++; console.log(`OK contrato catálogo ${checks}: ${label}`); }
function collect(reference, request = {}) {
  const items = []; let cursor = null, calls = 0;
  do {
    const result = reference.page({ ...request, cursor });
    assert.equal(result.ok, true); assert.ok(result.items.length <= MAX_PAGE_SIZE);
    assert.equal(result.page.returned, result.items.length);
    assert.equal(result.page.has_more, result.page.next_cursor !== null);
    items.push(...result.items); cursor = result.page.next_cursor;
    assert.ok(++calls < 1000, 'Pagination must terminate');
  } while (cursor);
  assert.equal(new Set(items.map(row => row.id)).size, items.length);
  return items;
}
// Independent interpreter for the proposed LIKE ... ESCAPE '!' pattern.
// This does NOT execute PostgreSQL or claim parity with a database collation.
function likeMatches(value, pattern) {
  const chars = Array.from(pattern), tokens = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '!') { assert.ok(i + 1 < chars.length); tokens.push({ literal: chars[++i] }); }
    else tokens.push(chars[i] === '%' ? { many: true } : chars[i] === '_' ? { one: true } : { literal: chars[i] });
  }
  const input = Array.from(value), memo = new Map();
  function match(i, j) {
    const key = `${i}:${j}`; if (memo.has(key)) return memo.get(key);
    const t = tokens[j];
    const result = !t ? i === input.length : t.many ? match(i, j + 1) || (i < input.length && match(i + 1, j)) : i < input.length && (t.one || t.literal === input[i]) && match(i + 1, j + 1);
    memo.set(key, result); return result;
  }
  return match(0, 0);
}

test('mayúsculas, vocales acentuadas y diéresis', () => {
  for (const value of ['Pokémon', 'POKÉMON', 'Poke\u0301mon']) assert.equal(normalizeCatalogText(value), 'pokemon');
  assert.equal(normalizeCatalogText('ÁÉÍÓÚ àèìòù ÄËÏÖÜ ü'), 'aeiou aeiou aeiou u');
  assert.equal(normalizeCatalogText('PINGÜINO'), 'pinguino');
});
test('ñ y n diferentes, incluidas Ñ y secuencias combinadas', () => {
  for (const value of ['Niño', 'NIÑO', 'Nin\u0303o', 'NIN\u0303O']) assert.equal(normalizeCatalogText(value), 'niño');
  assert.notEqual(normalizeCatalogText('niño'), normalizeCatalogText('nino'));
  assert.equal(normalizeCatalogText('ñ\u0301'), 'ñ');
  assert.equal(normalizeCatalogText('n\u0303\u0301'), 'ñ');
});
test('normalización canónica, Unicode y límites de la equivalencia', () => {
  const corpus = ['Pokémon', 'Niño', 'Pingüino', 'Café', '東京', '👩‍💻', '✈️', 'Straße', '\ue000'];
  for (const value of corpus) {
    assert.equal(normalizeCatalogText(value), normalizeCatalogText(value.normalize('NFD')));
    assert.equal(normalizeCatalogText(normalizeCatalogText(value)), normalizeCatalogText(value));
  }
  assert.equal(normalizeCatalogText('東京 👩‍💻 ✈️'), '東京 👩‍💻 ✈️');
  assert.equal(normalizeCatalogText('ＡＢ'), 'ａｂ'); // NFC, not compatibility transliteration.
  assert.notEqual(normalizeCatalogText('Straße'), normalizeCatalogText('STRASSE'));
});
test('vacío, espacios versionados, un carácter y marcas aisladas', () => {
  for (const value of ['', ' \t\n', '\u0085\u00a0\u3000\ufeff']) assert.equal(prepareSearch(value).mode, 'browse');
  for (const code of [9, 10, 11, 12, 13, 32, 133, 160, 5760, ...Array.from({ length: 11 }, (_, i) => 8192 + i), 8232, 8233, 8239, 8287, 12288, 65279]) {
    const space = String.fromCharCode(code);
    assert.equal(prepareSearch(`${space}PS${space}`).normalized, 'ps');
  }
  for (const value of ['P', 'é', 'n\u0303', '🕹']) assert.deepEqual(prepareSearch(value), { ok: false, code: 'query_too_short' });
  assert.deepEqual(prepareSearch('\u0301\u0308'), { ok: false, code: 'invalid_request' });
  assert.equal(prepareSearch(' n\u0303a ').length, 2);
  assert.equal(prepareSearch('x y').normalized, 'x y'); // Internal spaces remain literal.
});
test('PS, PC, VR, DS y otros pares: fragmentos, sin expansión de siglas', () => {
  const rows = ['PS5 Digital', 'PC gaming', 'VR visor', 'DS Lite', 'PlayStation', 'PS Vita', '東京', 'ABBA'].map((title, i) => product(i + 10, { title }));
  const f = fixture(rows);
  for (const term of ['PS', 'PC', 'VR', 'DS']) {
    assert.equal(prepareSearch(term).mode, 'two_characters');
    assert.deepEqual(collect(f, { search: term }).map(row => row.title).sort(), rows.filter(row => row.title.toLowerCase().includes(term.toLowerCase())).map(row => row.title).sort());
  }
  assert.equal(f.page({ search: 'PS' }).items.some(row => row.title === 'PlayStation'), false);
  assert.equal(f.page({ search: '東京' }).items.length, 1);
  assert.equal(f.page({ search: 'BB' }).items.length, 1);
});
test('escape literal de %, _, !, barra inversa y comillas', () => {
  const terms = ['50%', 'a_b', '!!', '\\_', "' OR 1=1 --", '%_', 'PS', '東京', 'ñ_', '👩‍💻'];
  const values = [...terms, ...terms.map(term => `antes ${term} después`), '50 euros', 'aXb', 'anything', ''];
  for (const term of terms) for (const value of values) assert.equal(likeMatches(value, escapeCatalogLikePattern(term)), value.includes(term), `${JSON.stringify(term)} must stay literal`);
  assert.equal(escapeCatalogLikePattern('!%_\\'), '%!!!%!_\\%');
  assert.throws(() => escapeCatalogLikePattern('\0'), /invalid_text/);
});
test('búsqueda literal antes de paginar, sin coincidencias por comodines', () => {
  const rows = ['Mando 50%', 'Mando 500', 'Cable a_b', 'Cable aXb', 'Pack %_', 'Pack XY', "Juego ' OR 1=1 --"].map((title, i) => product(i + 10, { title }));
  const f = fixture(rows);
  assert.deepEqual(f.page({ search: '50%' }).items.map(row => row.title), ['Mando 50%']);
  assert.deepEqual(f.page({ search: 'a_b' }).items.map(row => row.title), ['Cable a_b']);
  assert.deepEqual(f.page({ search: '%_' }).items.map(row => row.title), ['Pack %_']);
  assert.equal(f.page({ search: "' OR 1=1 --" }).items.length, 1);
  assert.equal(f.page({ search: 'inexistente' }).items.length, 0);
});
test('longitud medida en puntos de código, sin truncar ni admitir UTF-16 roto', () => {
  assert.equal(prepareSearch('a'.repeat(90)).ok, true);
  assert.equal(prepareSearch('😀'.repeat(90)).ok, true); // 180 UTF-16 units, 90 code points.
  for (const value of ['a'.repeat(91), '😀'.repeat(91), '\ud800', '\udc00', 'a\ud800b', 'a\0b', 12, null, {}]) assert.equal(prepareSearch(value).code, 'invalid_request');
  assert.throws(() => normalizeCatalogText('a'.repeat(91)), /invalid_text/);
  // Input bound is checked BEFORE normalization, including decomposed marks.
  assert.equal(prepareSearch('e\u0301'.repeat(46)).code, 'invalid_request');
});
test('parámetros y límites inválidos no leen filas', () => {
  const f = fixture([product(10)]);
  const invalid = [null, [], 'text', new Date(), { p_user_id: A }, { p_role: 'supervisor' },
    { page_size: 0 }, { page_size: 13 }, { page_size: 1.5 }, { page_size: '12' }, { page_size: null },
    { category: 'desconocida' }, { sale_type: 'cash' }, { sort: 'title;DROP TABLE' },
    { min_price: -1 }, { max_price: 1000001 }, { min_price: '50' }, { min_price: 1.1 },
    { min_price: NaN }, { max_price: Infinity }, { max_price: 12n }, { min_price: 20, max_price: 10 },
    { search: undefined }, { search: null }, { search: 'a'.repeat(5000) }, { search: 'x' },
    { extra: 'a'.repeat(5000) }, { search: 'aa', cursor: { huge: 'a'.repeat(5000) } }];
  for (const request of invalid) {
    const result = f.page(request); assert.equal(result.ok, false);
    assert.ok(['invalid_request', 'invalid_cursor', 'query_too_short'].includes(result.code));
    assert.deepEqual(Object.keys(result).sort(), ['code', 'ok']);
  }
  assert.equal(f.reads(), 0);
});
test('valores por defecto y tamaños 1–12', () => {
  const f = fixture(Array.from({ length: 30 }, (_, i) => product(i + 10)));
  assert.equal(f.page().items.length, 12);
  for (let page_size = 1; page_size <= 12; page_size++) {
    const result = f.page({ page_size }); assert.equal(result.items.length, page_size);
    assert.equal(result.page.size, page_size); assert.equal(result.page.has_more, true);
  }
  assert.equal(prepareCatalogRequest({ min_price: 0, max_price: 1000000 }).ok, true);
});
test('fechas UTC con seis decimales y calendario válido', () => {
  for (const value of [time, '2000-02-29T00:00:00.000001Z', '2024-02-29T23:59:59.999999Z', '0001-01-01T00:00:00.000000Z']) assert.equal(validCursorTimestamp(value), true);
  for (const value of ['1900-02-29T00:00:00.000000Z', '2026-02-29T00:00:00.000000Z', '2026-04-31T00:00:00.000000Z', '2026-00-01T00:00:00.000000Z', '2026-01-00T00:00:00.000000Z', '2026-01-01T24:00:00.000000Z', '2026-01-01T00:60:00.000000Z', '2026-01-01T00:00:60.000000Z', '0000-01-01T00:00:00.000000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000000+00:00', `${time} OR TRUE`]) assert.equal(validCursorTimestamp(value), false);
});
test('0, 1, 12, 13, 100, 1001 publicaciones y los tres órdenes', () => {
  for (const count of [0, 1, 12, 13, 100, 1001]) {
    const rows = Array.from({ length: count }, (_, i) => product(i + 10));
    for (const sort of ['recent', 'price_asc', 'price_desc']) {
      const actual = collect(fixture(rows), { sort }).map(row => row.id);
      const expected = [...rows].sort((a, b) => {
        if (sort === 'recent') return b.id.localeCompare(a.id);
        const ascending = a.price - b.price || a.id.localeCompare(b.id);
        return sort === 'price_asc' ? ascending : -ascending;
      }).map(row => row.id);
      assert.deepEqual(actual, expected); assert.equal(actual.length, count);
    }
  }
});
test('orden estable con empates, orden de entrada distinto y precisión de microsegundos', () => {
  const rows = Array.from({ length: 26 }, (_, i) => product(i + 10, { price: 500,
    created_at: `2026-10-28T10:00:00.${i % 2 ? '123456' : '123457'}Z` }));
  const expected = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  assert.deepEqual(collect(fixture(rows)).map(row => row.id), expected.map(row => row.id));
  assert.deepEqual(collect(fixture([...rows].reverse())).map(row => row.id), expected.map(row => row.id));
  assert.equal(new Date(rows[0].created_at).getTime(), new Date(rows[1].created_at).getTime());
  assert.equal(fixture(rows).page().page.next_cursor.position.created_at, '2026-10-28T10:00:00.123457Z');
});
test('cursor de la última tarjeta devuelta, nunca de la fila adicional', () => {
  const rows = Array.from({ length: 13 }, (_, i) => product(i + 10));
  const f = fixture(rows), first = f.page();
  assert.equal(first.page.next_cursor.position.id, first.items.at(-1).id);
  const last = f.page({ cursor: first.page.next_cursor });
  assert.equal(last.items.length, 1); assert.equal(last.items[0].id, id(10));
  assert.equal(last.page.next_cursor, null);
});
test('filtros y búsqueda aplicados sobre todo el conjunto antes del límite', () => {
  const rows = Array.from({ length: 100 }, (_, i) => product(i + 10, {
    title: i < 25 ? `Pokémon ${i}` : `Otro ${i}`, category: i % 2 ? 'Videojuegos' : 'Consolas',
    sale_type: i % 3 ? 'fixed' : 'offers', price: 100 + i,
  }));
  const request = { search: 'POKEMON', category: 'Videojuegos', sale_type: 'fixed', min_price: 100, max_price: 124 };
  const actual = collect(fixture(rows), request);
  const expected = rows.filter((row, i) => i < 25 && i % 2 === 1 && i % 3 !== 0).reverse();
  assert.deepEqual(actual.map(row => row.id), expected.map(row => row.id));
  assert.equal(fixture([product(10, { title: 'Niño' }), product(11, { title: 'Nino' })]).page({ search: 'nino' }).items[0].id, id(11));
});
test('precio global mezcla fijo, negociable, subasta inicial y puja válida', () => {
  const a = withAuction(10, 900), b = withAuction(11), c = product(12, { price: 500 }), d = product(13, { price: 300, sale_type: 'offers' });
  const f = fixture([a, b, c, d]);
  assert.deepEqual(f.page({ sort: 'price_asc' }).items.map(row => row.effective_price), [101, 300, 500, 900]);
  assert.deepEqual(f.page({ sort: 'price_desc' }).items.map(row => row.effective_price), [900, 500, 300, 101]);
  const result = f.page({ min_price: 800, max_price: 1000 });
  assert.equal(result.items.length, 1); assert.equal(result.items[0].price_kind, 'auction_highest_valid');
});
test('subastas incompletas o incoherentes se excluyen antes de paginar', () => {
  const bad = [withAuction(100), withAuction(101), withAuction(102), withAuction(103), withAuction(104)];
  delete bad[0].auction; bad[1].auction.seller_id = B; bad[2].auction.product_id = id(1);
  bad[3].auction.bid_count = 1; bad[4].auction.highest_amount = 500;
  const rows = Array.from({ length: 13 }, (_, i) => product(i + 10));
  const f = fixture([...bad, ...rows]);
  assert.equal(f.page().items.length, 12); assert.equal(f.page().page.has_more, true);
  assert.equal(collect(f).length, 13);
});
test('tarjetas y errores sin contenido privado ni campos administrativos', () => {
  const row = withAuction(10, 600);
  Object.assign(row, { email: 'synthetic-private', messages: 'synthetic-private', qr_token: 'synthetic-private', claims: [], payment_status: 'confirmed' });
  row.auction.highest_bid_id = 'synthetic-private'; row.auction.buyer_id = B;
  const result = fixture([row]).page();
  const card = result.items[0];
  assert.deepEqual(Object.keys(card).sort(), ['id', 'owner_id', 'seller_name', 'title', 'category', 'condition', 'sale_type', 'area', 'image_path', 'created_at', 'updated_at', 'effective_price', 'currency', 'price_kind', 'auction'].sort());
  assert.equal(JSON.stringify(result).includes('synthetic-private'), false);
  assert.equal(result.payments_enabled, false); assert.equal(result.cash_enabled, false);
  assert.equal(result.reference_only, true); assert.equal(result.consistency, 'synthetic_rows_only');
  const error = createCatalogReference({ readVisibleRows: () => { throw new Error('synthetic-private'); } }).page();
  assert.deepEqual(error, { ok: false, code: 'unavailable' });
});
test('fingerprint estable para búsquedas equivalentes y distinto para filtros/ámbito', () => {
  const first = prepareCatalogRequest({ search: ' POKÉMON ', page_size: 12 }, A);
  assert.equal(first.fingerprint, prepareCatalogRequest({ page_size: 12, search: 'Poke\u0301mon' }, A).fingerprint);
  const other = [{ search: 'pokemon', sort: 'price_asc' }, { search: 'pokemon', page_size: 11 }, { search: 'pokemon', category: 'Consolas' }, { search: 'pokemon', sale_type: 'auction' }, { search: 'pokemon', min_price: 10 }, { search: 'pokemon', max_price: 500 }];
  for (const request of other) assert.notEqual(first.fingerprint, prepareCatalogRequest(request, A).fingerprint);
  for (const subject of [null, B, C, D]) assert.notEqual(first.fingerprint, prepareCatalogRequest({ search: 'pokemon' }, subject).fingerprint);
  assert.notEqual(prepareCatalogRequest({ search: 'niño' }).fingerprint, prepareCatalogRequest({ search: 'nino' }).fingerprint);
  assert.equal(first.fingerprint.length, 64);
});
test('vector canónico reproducible para comparar después con PostgreSQL', () => {
  // UTF-8 of [version,normalization,policy,subject,category,type,search,min,max,sort,size]
  // with no added whitespace; see the companion report for the exact bytes.
  assert.equal(prepareCatalogRequest({ search: 'pokemon' }).fingerprint,
    '03debdd479397762c298eaf10263b599f59d4bd7dd71d39cf5bae61f76df7a7a');
});
test('cursores malformados, sobredimensionados o alterados se rechazan sin leer', () => {
  const f = fixture(Array.from({ length: 15 }, (_, i) => product(i + 10)), A);
  const cursor = f.page().page.next_cursor, reads = f.reads();
  const altered = [[], 'opaque', {}, { ...cursor, v: 2 }, { ...cursor, v: '1' },
    { ...cursor, fingerprint: 'f'.repeat(64) }, { ...cursor, fingerprint: cursor.fingerprint.toUpperCase() },
    { ...cursor, owner_id: A }, { ...cursor, position: { ...cursor.position, id: 'invalid' } },
    { ...cursor, position: { ...cursor.position, id: cursor.position.id.toUpperCase().replace('4000', 'ABCD') } },
    { ...cursor, position: { ...cursor.position, created_at: '1900-02-29T00:00:00.000000Z' } },
    { ...cursor, position: { ...cursor.position, created_at: 'x'.repeat(1600) } },
    { ...cursor, position: { price: 100, id: cursor.position.id } },
    { ...cursor, position: { ...cursor.position, price: 100 } }, { ...cursor, position: null }];
  for (const value of altered) assert.equal(f.page({ cursor: value }).code, 'invalid_cursor');
  assert.equal(f.reads(), reads);
  for (const change of [{ sort: 'price_asc' }, { page_size: 11 }, { search: 'PS' }, { min_price: 1 }, { category: 'Consolas' }]) assert.equal(f.page({ ...change, cursor }).code, 'invalid_cursor');
  assert.equal(f.reads(), reads);
});
test('cursores de precio rechazan tipos, extremos y posición de otro orden', () => {
  const f = fixture(Array.from({ length: 15 }, (_, i) => product(i + 10)));
  for (const sort of ['price_asc', 'price_desc']) {
    const cursor = f.page({ sort }).page.next_cursor, reads = f.reads();
    for (const price of [null, '100', 0, -1, 1000001, 1.5, Infinity]) assert.equal(f.page({ sort, cursor: { ...cursor, position: { ...cursor.position, price } } }).code, 'invalid_cursor');
    assert.equal(f.page({ sort, cursor: { ...cursor, position: { created_at: time, id: cursor.position.id } } }).code, 'invalid_cursor');
    assert.equal(f.reads(), reads);
  }
});
test('A/B/C/D: visibilidad sintética provista fuera del cursor y cambio de sesión', () => {
  const all = Array.from({ length: 28 }, (_, i) => product(i + 10));
  const privateRows = [product(300, { owner_id: B, title: 'Contenido sintético restringido' })];
  const a = fixture([...all, ...privateRows], A), first = a.page();
  for (const subject of [B, C, D]) {
    const other = fixture(all, subject);
    assert.equal(other.page({ cursor: first.page.next_cursor }).code, 'invalid_cursor');
    assert.equal(other.reads(), 0);
    assert.equal(collect(other).some(row => row.id === id(300)), false);
  }
  assert.equal(fixture(all, 'invalid-subject').page().code, 'unavailable');
  assert.equal(prepareCatalogRequest({ subject: A }).code, 'invalid_request');
});
test('cursor sin firma: una posición válida no concede acceso ni consulta su ID', () => {
  const rows = Array.from({ length: 20 }, (_, i) => product(i + 10));
  const f = fixture(rows), cursor = f.page().page.next_cursor;
  // Unknown IDs are position values, not lookups or proof of existence.
  const modified = { ...cursor, position: { created_at: time, id: id(1000) } };
  const result = f.page({ cursor: modified });
  assert.equal(result.ok, true); assert.equal(result.items.length, 12);
  assert.ok(result.items.every(row => rows.some(source => source.id === row.id)));
  assert.equal(Object.hasOwn(result, 'cursor_id_exists'), false);
  const zero = f.page({ cursor: { ...cursor, position: { created_at: time, id: id(0) } } });
  assert.equal(zero.ok, true); assert.equal(zero.items.length, 0);
});
test('continuación aunque desaparezca la publicación del cursor', () => {
  const rows = Array.from({ length: 25 }, (_, i) => product(i + 10));
  const f = fixture(rows), first = f.page(), cursor = first.page.next_cursor;
  rows.splice(rows.findIndex(row => row.id === cursor.position.id), 1); // Synthetic only.
  const rest = collect(f, { cursor: null });
  assert.equal(rest.length, 24);
  const second = f.page({ cursor });
  assert.equal(second.ok, true);
  assert.ok(second.items.every(row => row.id < cursor.position.id));
  assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, first.items.length + second.items.length);
});
test('datos cambiantes: demuestra la ausencia de snapshot entre páginas', () => {
  const rows = Array.from({ length: 20 }, (_, i) => product(i + 10, { price: 100 + i }));
  const f = fixture(rows), first = f.page({ sort: 'price_asc' });
  rows[0].price = 999; // A previously seen auction/price could move after the cursor.
  rows[19].price = 1; // An unseen result could move before the cursor.
  const second = f.page({ sort: 'price_asc', cursor: first.page.next_cursor });
  assert.ok(second.items.some(row => row.id === rows[0].id));
  assert.ok(!second.items.some(row => row.id === rows[19].id));
  // This is a documented limitation, not a stable-snapshot guarantee or UI behavior.
  assert.equal(first.consistency, 'synthetic_rows_only');
});
test('lectura pura, sin mutar publicaciones originales ni metadatos', () => {
  const rows = [product(10, { title: 'Pokémon' }), withAuction(11, 900)];
  const before = JSON.stringify(rows);
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(rows);
  const f = fixture(rows);
  for (const sort of ['recent', 'price_asc', 'price_desc']) assert.equal(f.page({ sort, search: '' }).ok, true);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(CATALOG_REFERENCE_VERSION, 'catalog-v1'); assert.equal(SEARCH_KEY_VERSION, 'es-nfc-preserve-enye-v1');
});
test('fallos de dependencia no se presentan como lista vacía', () => {
  for (const source of [null, {}, [product(10), product(10)], [product(10, { created_at: 'invalid' })]]) assert.deepEqual(fixture(source).page(), { ok: false, code: 'unavailable' });
  assert.deepEqual(createCatalogReference({ readVisibleRows: () => [], serverTime: () => 'invalid' }).page(), { ok: false, code: 'unavailable' });
  const empty = fixture([]).page(); assert.equal(empty.ok, true); assert.deepEqual(empty.items, []);
});

console.log(`Contrato catálogo: ${checks} grupos de pruebas locales correctos. Sin SQL ni conexiones remotas.`);
