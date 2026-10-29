// Prepared adapter only. Not imported by App/hooks; no fallback to a full catalog.
import { createCatalogPages } from './catalog-page.js';
import { serverClock } from '../utils/auction-time.js';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const categories = ['Consolas', 'Videojuegos', 'Accesorios', 'Componentes', 'Coleccionables'];
const types = ['fixed', 'offers', 'auction'];
const sorts = ['recent', 'price_asc', 'price_desc'];
const statuses = ['scheduled', 'active', 'ended_no_bids', 'ended_winner', 'cancelled'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const money = value => Number.isInteger(value) && value >= 1 && value <= 1000000;
const bytes = value => new TextEncoder().encode(value).length;
function text(value, max) {
  if (typeof value !== 'string' || Array.from(value).length > max || value.includes('\0')) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
function timestamp(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/);
  if (!match) return false;
  const [y, m, d, h, min, s] = match.slice(1, 7).map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] && h <= 23 && min <= 59 && s <= 59;
}
export function normalizeCatalogSearch(value) {
  if (!text(value, 90) || bytes(value) > 512) return null;
  // Explicit trim set from the approved v1 contract; server remains authoritative.
  const trim = new Set([9, 10, 11, 12, 13, 32, 133, 160, 5760, ...Array.from({ length: 11 }, (_, i) => 8192 + i), 8232, 8233, 8239, 8287, 12288, 65279]);
  let start = 0, end = value.length;
  while (start < end && trim.has(value.charCodeAt(start))) start++;
  while (end > start && trim.has(value.charCodeAt(end - 1))) end--;
  const raw = value.slice(start, end);
  const normalized = raw.normalize('NFC').toLowerCase().split('ñ').map(part => part.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')).join('ñ');
  return raw && !normalized ? null : normalized;
}
function validCursor(cursor, sort) {
  if (cursor === null) return true;
  if (!exact(cursor, ['v', 'fingerprint', 'position']) || cursor.v !== 1 || typeof cursor.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(cursor.fingerprint)) return false;
  try { if (bytes(JSON.stringify(cursor)) > 1536) return false; } catch { return false; }
  const p = cursor.position;
  return exact(p, sort === 'recent' ? ['created_at', 'id'] : ['price', 'id']) && typeof p.id === 'string' && uuid.test(p.id)
    && (sort === 'recent' ? timestamp(p.created_at) : money(p.price));
}
export function catalogRpcQuery(input = {}, cursor = null) {
  if (!plain(input) || Object.keys(input).some(key => !['category', 'type', 'sort', 'query', 'min', 'max', 'sessionKey'].includes(key)) || Object.values(input).some(value => value === undefined)) return { status: 'invalid', reason: 'invalid_request' };
  const { category = 'Todas', type = 'all', sort = 'recent', query = '', min = '', max = '', sessionKey = 'anonymous' } = input;
  const normalized = normalizeCatalogSearch(query);
  const amount = v => v === '' ? null : typeof v === 'number' || typeof v === 'string' && /^\d{1,7}$/.test(v) ? Number(v) : NaN;
  const low = amount(min), high = amount(max);
  if (normalized === null || !['Todas', ...categories].includes(category) || !['all', ...types].includes(type) || !sorts.includes(sort) || !text(sessionKey, 200)
    || [low, high].some(v => v !== null && (!Number.isInteger(v) || v < 0 || v > 1000000)) || low !== null && high !== null && low > high) return { status: 'invalid', reason: 'invalid_request' };
  if (Array.from(normalized).length === 1) return { status: 'invalid', reason: 'query_too_short' };
  if (!validCursor(cursor, sort)) return { status: 'invalid', reason: 'invalid_cursor' };
  const request = { category: category === 'Todas' ? null : category, sale_type: type, sort, search: query, min_price: low, max_price: high, page_size: 12, cursor };
  return { status: 'supported', request, key: JSON.stringify([category, type, sort, normalized, low, high, sessionKey]) };
}
const cardKeys = ['id', 'owner_id', 'seller_name', 'title', 'category', 'condition', 'sale_type', 'area', 'image_path', 'created_at', 'updated_at', 'effective_price', 'currency', 'price_kind', 'auction'];
function validCard(row) {
  if (!exact(row, cardKeys) || !uuid.test(row.id) || !uuid.test(row.owner_id) || !text(row.title, 90) || !text(row.seller_name, 60) || !categories.includes(row.category)
    || !['Nuevo', 'Como nuevo', 'Buen estado', 'Con detalles'].includes(row.condition) || !types.includes(row.sale_type) || !text(row.area, 100)
    || !timestamp(row.created_at) || !timestamp(row.updated_at) || !money(row.effective_price) || row.currency !== 'MXN'
    || typeof row.image_path !== 'string' || !new RegExp(`^${row.owner_id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(row.image_path)) return false;
  if (row.sale_type !== 'auction') return row.auction === null && row.price_kind === (row.sale_type === 'fixed' ? 'fixed_reference' : 'negotiable_reference');
  const a = row.auction;
  if (!exact(a, ['id', 'status', 'initial_price', 'highest_amount', 'bid_count', 'revision', 'starts_at', 'ends_at']) || !uuid.test(a.id) || !statuses.includes(a.status)
    || !money(a.initial_price) || !Number.isInteger(a.bid_count) || a.bid_count < 0 || !Number.isInteger(a.revision) || a.revision < 1 || !timestamp(a.starts_at) || !timestamp(a.ends_at)) return false;
  return a.bid_count === 0 ? a.highest_amount === null && row.effective_price === a.initial_price && row.price_kind === 'auction_initial'
    : money(a.highest_amount) && row.effective_price === a.highest_amount && row.price_kind === 'auction_highest_valid';
}
function decode(data, request, client) {
  if (!exact(data, ['ok', 'version', 'normalization', 'server_time', 'consistency', 'payments_enabled', 'cash_enabled', 'items', 'page']) || data.ok !== true
    || data.version !== 'catalog-v1' || data.normalization !== 'es-nfc-preserve-enye-v1' || data.consistency !== 'statement_snapshot_only'
    || !timestamp(data.server_time) || data.payments_enabled !== false || data.cash_enabled !== false || !Array.isArray(data.items) || data.items.length > 12
    || !data.items.every(validCard) || new Set(data.items.map(item => item.id)).size !== data.items.length) throw new Error('invalid_response');
  const p = data.page;
  if (!exact(p, ['size', 'returned', 'has_more', 'next_cursor']) || p.size !== 12 || p.returned !== data.items.length || typeof p.has_more !== 'boolean'
    || !validCursor(p.next_cursor, request.sort) || (p.has_more ? p.next_cursor === null || p.returned !== 12 : p.next_cursor !== null)) throw new Error('invalid_response');
  if (p.has_more) {
    const last = data.items.at(-1), position = p.next_cursor.position;
    if (position.id !== last.id || (request.sort === 'recent' ? position.created_at !== last.created_at : position.price !== last.effective_price)) throw new Error('invalid_response');
  }
  const clock = serverClock(data.server_time);
  return { status: 'ready', items: data.items.map(row => ({ id: row.id, ownerId: row.owner_id, title: row.title, seller: row.seller_name,
    category: row.category, condition: row.condition, type: row.sale_type, price: row.effective_price, priceKind: row.price_kind,
    area: row.area, imagePath: row.image_path, image: client.storage.from('product-images').getPublicUrl(row.image_path).data.publicUrl,
    createdAt: row.created_at, updatedAt: row.updated_at,
    ...(row.auction ? { auction: row.auction, endsAt: Date.parse(row.auction.ends_at), clock } : {}) })),
    hasMore: p.has_more, cursor: p.next_cursor, unavailable: 0, consistency: data.consistency };
}
export function createCatalogRpcPages(client) {
  const updates = createCatalogPages(client);
  return {
    async page(input = {}, { cursor = null, signal } = {}) {
      if (signal?.aborted) return { status: 'cancelled' };
      const spec = catalogRpcQuery(input, cursor);
      if (spec.status !== 'supported') return spec;
      if (!client) return { status: 'error', reason: 'configuration' };
      try {
        let call = client.rpc('catalog_page_v1', { p_request: spec.request });
        if (signal && typeof call.abortSignal === 'function') call = call.abortSignal(signal);
        const response = await call;
        if (signal?.aborted) return { status: 'cancelled' };
        if (!plain(response) || !Object.hasOwn(response, 'data') || !Object.hasOwn(response, 'error')) return { status: 'error', reason: 'service' };
        if (response.error) {
          const code = response.error.code;
          if (code === '57014' || response.status === 504) return { status: 'error', reason: 'timeout' };
          if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code) || [401, 403].includes(response.status)) return { status: 'error', reason: 'restricted' };
          if (['PGRST202', '42P01', '42703', '42883'].includes(code)) return { status: 'error', reason: 'not_installed' };
          return { status: 'error', reason: response.status === 0 ? 'connection' : 'service' };
        }
        const data = response.data;
        if (exact(data, ['ok', 'code']) && data.ok === false) {
          if (['invalid_request', 'query_too_short', 'invalid_cursor'].includes(data.code)) return { status: 'invalid', reason: data.code };
          return { status: 'error', reason: data.code === 'query_timeout' ? 'timeout' : 'service' };
        }
        try { return decode(data, spec.request, client); } catch { return { status: 'error', reason: 'service' }; }
      } catch (error) {
        if (signal?.aborted) return { status: 'cancelled' };
        return { status: 'error', reason: error instanceof TypeError ? 'connection' : 'service' };
      }
    },
    // Existing read-only batch, bounded to 12; never auction_snapshot/settlement.
    auctionUpdates: updates.auctionUpdates,
  };
}
