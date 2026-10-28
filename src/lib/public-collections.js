import { createMarketplace, productColumns } from './marketplace-core.js';
import { serverClock } from '../utils/auction-time.js';
import { favoriteReferences } from './favorites.js';
export { favoriteReferences } from './favorites.js';

export const COLLECTION_PAGE_SIZE = 12;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const auctionColumns = 'id,product_id,initial_price,highest_amount,bid_count,ends_at,starts_at,status';

export function collectionFailure(response) {
  const error = response?.error || response;
  if ([401, 403].includes(response?.status) || ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error?.code)) return { status: 'error', reason: 'restricted' };
  return { status: 'error', reason: response?.status === 0 || error instanceof TypeError || error?.name === 'AbortError' ? 'connection' : 'service' };
}

// Queries use the existing browser client and its current RLS session only.
export function createPublicCollections(client) {
  const marketplace = createMarketplace(client);
  const abortable = (query, signal) => signal ? query.abortSignal(signal) : query;
  async function rows(query, signal) {
    const response = await abortable(query, signal);
    if (response.error) throw response;
    if (!Array.isArray(response.data)) throw new Error('invalid_response');
    return response.data;
  }
  async function products(source, signal) {
    if (new Set(source.map(row => row.id)).size !== source.length) throw new Error('duplicate_response');
    const auctionIds = source.filter(row => row.sale_type === 'auction').map(row => row.id);
    let auctions = [], clock;
    if (auctionIds.length) {
      const [data, health] = await Promise.all([
        rows(client.from('auctions').select(auctionColumns).in('product_id', auctionIds), signal),
        abortable(client.rpc('auctions_health'), signal),
      ]);
      if (health.error) throw health;
      clock = serverClock(health.data?.server_time);
      if (health.data?.version !== 5 || !Number.isFinite(clock.epoch)) throw new Error('auction_unavailable');
      auctions = data;
    }
    return source.map(row => {
      if (!uuid.test(row.id) || !timestamp.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at))) throw new Error('invalid_product');
      const product = marketplace.toProduct(row);
      if (row.sale_type !== 'auction') return product;
      const matching = auctions.filter(auction => auction.product_id === row.id);
      const auction = matching[0], price = Number(auction?.highest_amount ?? auction?.initial_price);
      if (matching.length !== 1 || !Number.isFinite(price) || price < 1 || !Number.isFinite(Date.parse(auction.ends_at))) throw new Error('auction_unavailable');
      return { ...product, auction, price, endsAt: Date.parse(auction.ends_at), clock };
    });
  }
  return {
    async seller({ sellerId, cursor = null, signal } = {}) {
      if (typeof sellerId !== 'string' || !uuid.test(sellerId)) return { status: 'invalid' };
      if (!client) return { status: 'error', reason: 'configuration' };
      if (cursor && (!uuid.test(cursor.id) || !timestamp.test(cursor.createdAt) || !Number.isFinite(Date.parse(cursor.createdAt)))) return { status: 'error', reason: 'service' };
      try {
        let query = client.from('products').select(productColumns).eq('owner_id', sellerId.toLowerCase())
          .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(COLLECTION_PAGE_SIZE + 1);
        // Preserve the server timestamp including microseconds; do not round via Date.
        if (cursor) query = query.or(`created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`);
        const [source, profile] = await Promise.all([
          rows(query, signal),
          cursor ? null : abortable(client.from('profiles').select('id,display_name,bio,city,created_at').eq('id', sellerId.toLowerCase()).maybeSingle(), signal),
        ]);
        if (profile?.error) throw profile;
        if (profile && !profile.data) return { status: 'unavailable' };
        if (profile?.data && profile.data.id !== sellerId.toLowerCase()) throw new Error('invalid_profile');
        if (source.some(row => row.owner_id !== sellerId.toLowerCase())) throw new Error('invalid_owner');
        const page = source.slice(0, COLLECTION_PAGE_SIZE), last = page.at(-1);
        return { status: 'ready', items: await products(page, signal), ...(profile ? { profile: profile.data } : {}),
          hasMore: source.length > COLLECTION_PAGE_SIZE, cursor: last ? { createdAt: last.created_at, id: last.id } : null, unavailable: 0 };
      } catch (error) { return collectionFailure(error); }
    },
    async favorites({ favorites = [], cursor = 0, signal } = {}) {
      const refs = favoriteReferences(favorites);
      if (!Number.isInteger(cursor) || cursor < 0 || cursor > refs.ids.length) return { status: 'error', reason: 'service' };
      const ids = refs.ids.slice(cursor, cursor + COLLECTION_PAGE_SIZE);
      if (!ids.length) return { status: 'ready', items: [], cursor: refs.ids.length, hasMore: false, unavailable: 0 };
      if (!client) return { status: 'error', reason: 'configuration' };
      try {
        const source = await rows(client.from('products').select(productColumns).in('id', ids)
          .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(COLLECTION_PAGE_SIZE), signal);
        if (source.some(row => !ids.includes(row.id))) throw new Error('invalid_favorite');
        const mapped = await products(source, signal);
        const items = ids.flatMap(id => mapped.filter(product => product.id === id));
        return { status: 'ready', items, cursor: cursor + ids.length, hasMore: cursor + ids.length < refs.ids.length, unavailable: ids.length - items.length };
      } catch (error) { return collectionFailure(error); }
    },
  };
}
