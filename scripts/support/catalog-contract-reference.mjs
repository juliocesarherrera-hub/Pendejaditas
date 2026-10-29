// Block 1 reference, for local synthetic tests ONLY. Not imported by React/RPC.
// JavaScript Unicode behavior must later be compared with PostgreSQL/ICU.
import { createHash } from 'node:crypto';

export const CATALOG_REFERENCE_VERSION = 'catalog-v1';
export const SEARCH_KEY_VERSION = 'es-nfc-preserve-enye-v1';
export const PUBLIC_POLICY_VERSION = 'public-catalog-v1';
export const MAX_PAGE_SIZE = 12;
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const categories = ['Consolas', 'Videojuegos', 'Accesorios', 'Componentes', 'Coleccionables'];
const types = ['all', 'fixed', 'offers', 'auction'];
const sorts = ['recent', 'price_asc', 'price_desc'];
const auctionStates = ['scheduled', 'active', 'ended_no_bids', 'ended_winner', 'cancelled'];
// Explicit trim set for this version; do not depend on a changing locale.
const outerWhitespace = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680,
  ...Array.from({ length: 11 }, (_, i) => 0x2000 + i), 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff]);
function trimSearch(value) {
  let start = 0, end = value.length;
  while (start < end && outerWhitespace.has(value.charCodeAt(start))) start++;
  while (end > start && outerWhitespace.has(value.charCodeAt(end - 1))) end--;
  return value.slice(start, end);
}
const failure = code => ({ ok: false, code });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keysAre = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
const exactKeys = (value, keys) => keysAre(value, keys) && Object.keys(value).length === keys.length;
const money = value => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1000000;
const validPrice = value => money(value) && value >= 1;

function wellFormed(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
function validText(value) {
  return typeof value === 'string' && wellFormed(value) && !value.includes('\0') && Array.from(value).length <= 90 && encoder.encode(value).length <= 512;
}
function sizeAtMost(value, maximum) {
  try { return encoder.encode(JSON.stringify(value)).length <= maximum; }
  catch { return false; }
}
export function normalizeCatalogText(value) {
  if (!validText(value)) throw new TypeError('invalid_text');
  return value.normalize('NFC').toLowerCase().split('ñ')
    .map(segment => segment.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')).join('ñ');
}
export function prepareSearch(value) {
  if (!validText(value)) return failure('invalid_request');
  const trimmed = trimSearch(value);
  const normalized = normalizeCatalogText(trimmed);
  const length = Array.from(normalized).length;
  if (trimmed && !length) return failure('invalid_request');
  if (length === 1) return failure('query_too_short');
  return { ok: true, normalized, length, mode: length === 0 ? 'browse' : length === 2 ? 'two_characters' : 'normal' };
}
export function escapeCatalogLikePattern(normalized) {
  if (typeof normalized !== 'string' || !wellFormed(normalized) || normalized.includes('\0') || encoder.encode(normalized).length > 2048) throw new TypeError('invalid_text');
  return `%${normalized.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_')}%`;
}
export function validCursorTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
// The injected subject models server auth.uid(), NEVER a request parameter.
export function prepareCatalogRequest(request = {}, subject = null) {
  if (subject !== null && (typeof subject !== 'string' || !uuid.test(subject))) return failure('unavailable');
  if (!keysAre(request, ['category', 'sale_type', 'search', 'min_price', 'max_price', 'sort', 'page_size', 'cursor']) || !sizeAtMost(request, 4096)) return failure('invalid_request');
  const { category = null, sale_type = 'all', search = '', min_price = null, max_price = null, sort = 'recent', page_size = 12, cursor = null } = request;
  // Explicit undefined is not valid JSON and must not acquire defaults silently.
  if (Object.values(request).some(value => value === undefined)) return failure('invalid_request');
  if ((category !== null && !categories.includes(category)) || !types.includes(sale_type) || !sorts.includes(sort) || !Number.isInteger(page_size) || page_size < 1 || page_size > MAX_PAGE_SIZE || (min_price !== null && !money(min_price)) || (max_price !== null && !money(max_price)) || (min_price !== null && max_price !== null && min_price > max_price)) return failure('invalid_request');
  const term = prepareSearch(search);
  if (!term.ok) return term;
  const filters = { category, sale_type, search: term.normalized, min_price, max_price, sort, page_size };
  // Explicit, ordered canonical array for reference vectors. PostgreSQL must
  // later reproduce these bytes (jsonb::text spacing is not assumed identical).
  const canonical = JSON.stringify([CATALOG_REFERENCE_VERSION, SEARCH_KEY_VERSION, PUBLIC_POLICY_VERSION, subject, category, sale_type, term.normalized, min_price, max_price, sort, page_size]);
  const fingerprint = createHash('sha256').update(canonical, 'utf8').digest('hex');
  const checked = validateCatalogCursor(cursor, sort, fingerprint);
  if (!checked.ok) return checked;
  return { ok: true, filters, fingerprint, position: checked.position, termMode: term.mode, likePattern: term.length ? escapeCatalogLikePattern(term.normalized) : null };
}
export function validateCatalogCursor(cursor, sort, fingerprint) {
  if (cursor === null) return { ok: true, position: null };
  if (!exactKeys(cursor, ['v', 'fingerprint', 'position']) || !sizeAtMost(cursor, 1536) || cursor.v !== 1 || typeof cursor.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(cursor.fingerprint) || cursor.fingerprint !== fingerprint) return failure('invalid_cursor');
  const position = cursor.position;
  if (!exactKeys(position, sort === 'recent' ? ['created_at', 'id'] : ['price', 'id']) || typeof position.id !== 'string' || !uuid.test(position.id)) return failure('invalid_cursor');
  if (sort === 'recent' ? !validCursorTimestamp(position.created_at) : !validPrice(position.price)) return failure('invalid_cursor');
  return { ok: true, position: { ...position } };
}
function visibleCard(row) {
  if (!record(row) || typeof row.id !== 'string' || !uuid.test(row.id) || typeof row.owner_id !== 'string' || !uuid.test(row.owner_id) || !validText(row.title) || !validCursorTimestamp(row.created_at) || !validCursorTimestamp(row.updated_at) || !categories.includes(row.category) || !types.slice(1).includes(row.sale_type)) throw new TypeError('invalid_fixture');
  let price = row.price, kind = row.sale_type === 'fixed' ? 'fixed_reference' : 'negotiable_reference', auction = null;
  if (row.sale_type === 'auction') {
    const a = row.auction;
    if (!record(a) || a.product_id !== row.id || a.seller_id !== row.owner_id || !uuid.test(a.id) || !validPrice(a.initial_price) || !Number.isInteger(a.bid_count) || a.bid_count < 0 || !Number.isInteger(a.revision) || a.revision < 1 || !auctionStates.includes(a.status) || !validCursorTimestamp(a.starts_at) || !validCursorTimestamp(a.ends_at)) return null;
    if (a.bid_count === 0 && a.highest_amount === null) { price = a.initial_price; kind = 'auction_initial'; }
    else if (a.bid_count > 0 && validPrice(a.highest_amount)) { price = a.highest_amount; kind = 'auction_highest_valid'; }
    else return null;
    auction = Object.fromEntries(['id', 'status', 'initial_price', 'highest_amount', 'bid_count', 'starts_at', 'ends_at', 'revision'].map(key => [key, a[key]]));
  }
  if (!validPrice(price)) return null;
  return { id: row.id, owner_id: row.owner_id, seller_name: typeof row.seller_name === 'string' ? row.seller_name : 'Perfil no disponible', title: row.title, category: row.category, condition: row.condition, sale_type: row.sale_type, area: row.area, image_path: row.image_path, created_at: row.created_at, updated_at: row.updated_at, effective_price: price, currency: 'MXN', price_kind: kind, auction };
}
const cmp = (a, b) => a === b ? 0 : a < b ? -1 : 1;
function compare(a, b, sort) {
  const first = sort === 'recent' ? cmp(a.created_at, b.created_at) : cmp(a.effective_price, b.effective_price);
  return (first || cmp(a.id, b.id)) * (sort === 'price_asc' ? 1 : -1);
}
export function createCatalogReference({ readVisibleRows, subject = null, serverTime = () => new Date().toISOString().slice(0, -1) + '000Z' }) {
  if (typeof readVisibleRows !== 'function') throw new TypeError('fixture_reader_required');
  return {
    page(request = {}) {
      const prepared = prepareCatalogRequest(request, subject);
      if (!prepared.ok) return prepared; // Invalid/one-character queries read zero rows.
      try {
        const f = prepared.filters, source = readVisibleRows();
        if (!Array.isArray(source)) throw new TypeError('invalid_fixture');
        const publicRows = source.map(visibleCard).filter(Boolean);
        if (new Set(publicRows.map(row => row.id)).size !== publicRows.length) throw new TypeError('invalid_fixture');
        const matching = publicRows.filter(row => (f.category === null || row.category === f.category) && (f.sale_type === 'all' || row.sale_type === f.sale_type) && (!f.search || normalizeCatalogText(row.title).includes(f.search)) && (f.min_price === null || row.effective_price >= f.min_price) && (f.max_price === null || row.effective_price <= f.max_price));
        const ordered = matching.sort((a, b) => compare(a, b, f.sort));
        const position = prepared.position;
        const remaining = position ? ordered.filter(row => compare(row, { id: position.id, created_at: position.created_at, effective_price: position.price }, f.sort) > 0) : ordered;
        const lookahead = remaining.slice(0, f.page_size + 1), items = lookahead.slice(0, f.page_size), last = items.at(-1), hasMore = lookahead.length > f.page_size;
        const time = serverTime(); if (!validCursorTimestamp(time)) throw new TypeError('invalid_fixture');
        return { ok: true, reference_only: true, version: CATALOG_REFERENCE_VERSION, normalization: SEARCH_KEY_VERSION, server_time: time, consistency: 'synthetic_rows_only', payments_enabled: false, cash_enabled: false, items,
          page: { size: f.page_size, returned: items.length, has_more: hasMore, next_cursor: hasMore ? { v: 1, fingerprint: prepared.fingerprint, position: f.sort === 'recent' ? { created_at: last.created_at, id: last.id } : { price: last.effective_price, id: last.id } } : null } };
      } catch { return failure('unavailable'); }
    },
  };
}
