import { createMarketplace, productColumns } from './marketplace-core.js';
import { collectionFailure } from './public-collections.js';
import { serverClock } from '../utils/auction-time.js';

export const CATALOG_PAGE_SIZE = 12;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const validTime = value => typeof value === 'string' && timestamp.test(value) && Number.isFinite(Date.parse(value));
const categories = ['Todas', 'Consolas', 'Videojuegos', 'Accesorios', 'Componentes', 'Coleccionables'];
const types = ['all', 'fixed', 'offers', 'auction'];
const auctionColumns = 'id,product_id,initial_price,highest_amount,bid_count,ends_at,starts_at,status,revision';
export function catalogQuery(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['category', 'type', 'sort', 'query', 'min', 'max', 'sessionKey'].includes(key))) return { status: 'invalid' };
  const { category = 'Todas', type = 'all', sort = 'recent', query = '', min = '', max = '', sessionKey = 'anonymous' } = input;
  if (!categories.includes(category) || !types.includes(type) || !['recent', 'price_asc', 'price_desc'].includes(sort) || typeof query !== 'string' || query.length > 90 || typeof sessionKey !== 'string') return { status: 'invalid' };
  const price = value => value === '' ? null : typeof value === 'number' || (typeof value === 'string' && /^\d{1,7}$/.test(value)) ? Number(value) : NaN;
  const low = price(min), high = price(max);
  if ([low, high].some(value => value !== null && (!Number.isInteger(value) || value < 0 || value > 1000000)) || (low !== null && high !== null && low > high)) return { status: 'invalid' };
  // Never silently degrade accent folding or filter/order using an auction's initial price.
  if (query.trim() || ((sort !== 'recent' || low !== null || high !== null) && !['fixed', 'offers'].includes(type))) return { status: 'unsupported', reason: 'server_required' };
  const filters = { category, type, sort, min: low, max: high, sessionKey };
  return { status: 'supported', filters, key: JSON.stringify(filters) };
}
export function createCatalogPages(client) {
  const marketplace = createMarketplace(client);
  const run = (query, signal) => signal ? query.abortSignal(signal) : query;
  async function read(query, signal) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const response = await run(query, signal);
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (response.error) throw response;
    if (!Array.isArray(response.data)) throw new Error('invalid_response');
    return response.data;
  }
  async function auctionBatch(ids, signal) {
    if (!ids.length) return [];
    const [rows, health] = await Promise.all([
      read(client.from('auctions').select(auctionColumns).in('product_id', ids).limit(CATALOG_PAGE_SIZE), signal),
      run(client.rpc('auctions_health'), signal),
    ]);
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (health.error) throw health;
    const clock = serverClock(health.data?.server_time);
    if (health.data?.version !== 5 || !Number.isFinite(clock.epoch)) throw new Error('auction_unavailable');
    if (rows.length !== ids.length || new Set(rows.map(row => row.product_id)).size !== ids.length || rows.some(row => !ids.includes(row.product_id))) throw new Error('auction_unavailable');
    return rows.map(auction => {
      const price = Number(auction.highest_amount ?? auction.initial_price);
      if (!uuid.test(auction.id) || !Number.isInteger(price) || price < 1 || price > 1000000 || !validTime(auction.ends_at) || !validTime(auction.starts_at) || !Number.isInteger(auction.revision) || auction.revision < 1 || !['scheduled', 'active', 'ended_no_bids', 'ended_winner', 'cancelled'].includes(auction.status)) throw new Error('auction_unavailable');
      return { id: auction.product_id, auction, price, endsAt: Date.parse(auction.ends_at), clock };
    });
  }
  return {
    async page(input = {}, { cursor = null, signal } = {}) {
      const spec = catalogQuery(input);
      if (spec.status !== 'supported') return spec;
      const f = spec.filters;
      if (cursor && (cursor.queryKey !== spec.key || !uuid.test(cursor.id) || (f.sort === 'recent' ? !validTime(cursor.createdAt) : !Number.isInteger(cursor.price) || cursor.price < 1 || cursor.price > 1000000))) return { status: 'invalid' };
      if (!client) return { status: 'error', reason: 'configuration' };
      try {
        let request = client.from('products').select(productColumns);
        if (f.category !== 'Todas') request = request.eq('category', f.category);
        if (f.type !== 'all') request = request.eq('sale_type', f.type);
        if (f.min !== null) request = request.gte('price', f.min);
        if (f.max !== null) request = request.lte('price', f.max);
        if (f.sort === 'recent') {
          request = request.order('created_at', { ascending: false }).order('id', { ascending: false });
          if (cursor) request = request.or(`created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`);
        } else {
          const ascending = f.sort === 'price_asc', op = ascending ? 'gt' : 'lt';
          request = request.order('price', { ascending }).order('id', { ascending });
          if (cursor) request = request.or(`price.${op}.${cursor.price},and(price.eq.${cursor.price},id.${op}.${cursor.id})`);
        }
        const rows = await read(request.limit(CATALOG_PAGE_SIZE + 1), signal);
        if (rows.length > CATALOG_PAGE_SIZE + 1 || new Set(rows.map(row => row.id)).size !== rows.length || rows.some(row => !uuid.test(row.id) || !validTime(row.created_at) || !types.slice(1).includes(row.sale_type) || !Number.isInteger(Number(row.price)) || Number(row.price) < 1 || Number(row.price) > 1000000)) throw new Error('invalid_product');
        const page = rows.slice(0, CATALOG_PAGE_SIZE), last = page.at(-1);
        const auctions = await auctionBatch(page.filter(row => row.sale_type === 'auction').map(row => row.id), signal);
        const items = page.map(row => ({ ...marketplace.toProduct(row), ...auctions.find(auction => auction.id === row.id) }));
        return { status: 'ready', items, hasMore: rows.length > CATALOG_PAGE_SIZE, unavailable: 0,
          cursor: last ? { queryKey: spec.key, id: last.id, ...(f.sort === 'recent' ? { createdAt: last.created_at } : { price: Number(last.price) }) } : null,
          consistency: 'live_queries_not_snapshot' };
      } catch (error) { return collectionFailure(error); }
    },
    async auctionUpdates(ids, { signal } = {}) {
      if (!Array.isArray(ids) || ids.length > CATALOG_PAGE_SIZE || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !uuid.test(id))) return { status: 'invalid' };
      if (!client) return { status: 'error', reason: 'configuration' };
      try { return { status: 'ready', updates: await auctionBatch(ids, signal) }; }
      catch (error) { return collectionFailure(error); }
    },
  };
}
