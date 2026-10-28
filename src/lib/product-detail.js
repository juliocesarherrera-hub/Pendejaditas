import { createMarketplace, productColumns } from './marketplace-core.js';
import { serverClock } from '../utils/auction-time.js';

const productIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const auctionColumns = 'id,product_id,initial_price,highest_amount,bid_count,ends_at,starts_at,status';

export function initialProductDetail(id) {
  return { id, status: typeof id === 'string' && productIdPattern.test(id) ? 'loading' : 'invalid', product: null };
}

function lookupFailure(response) {
  const error = response?.error ?? response;
  if ([401, 403].includes(response?.status) || ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error?.code)) {
    return { status: 'restricted', product: null };
  }
  const connection = response?.status === 0 || error instanceof TypeError || error?.name === 'AbortError';
  // Never expose server messages, SQL details, URLs or session information.
  return { status: 'error', reason: connection ? 'connection' : 'service', product: null };
}

// Only existing, read-only Supabase queries. No catalog, cache or privileged client.
export function createProductLookup(client) {
  const marketplace = createMarketplace(client);
  return async function fetchProductById(id, { signal } = {}) {
    if (initialProductDetail(id).status === 'invalid') return { status: 'invalid', product: null };
    if (!client) return { status: 'error', reason: 'configuration', product: null };
    const productId = id.toLowerCase();
    const abortable = query => signal ? query.abortSignal(signal) : query;
    try {
      if (signal?.aborted) return { status: 'error', reason: 'connection', product: null };
      const response = await abortable(client.from('products').select(productColumns).eq('id', productId).maybeSingle());
      if (signal?.aborted) return { status: 'error', reason: 'connection', product: null };
      if (response.error) return lookupFailure(response);
      // RLS may hide an existing row. Do not probe with another identity or claim deletion.
      if (!response.data) return { status: 'not_found', product: null };
      if (response.data.id !== productId) return { status: 'error', reason: 'service', product: null };
      const product = marketplace.toProduct(response.data);
      if (product.type !== 'auction') return { status: 'ready', product };

      const [auctionResponse, health] = await Promise.all([
        abortable(client.from('auctions').select(auctionColumns).eq('product_id', productId).maybeSingle()),
        Promise.resolve(abortable(client.rpc('auctions_health'))).then(result => ({ ...result, clock: serverClock(result.data?.server_time) })),
      ]);
      if (auctionResponse.error) return lookupFailure(auctionResponse);
      if (health.error) return lookupFailure(health);
      const auction = auctionResponse.data;
      const price = Number(auction?.highest_amount ?? auction?.initial_price);
      if (!auction || auction.product_id !== productId || health.data?.version !== 5 ||
          !Number.isFinite(health.clock.epoch) || !Number.isFinite(Date.parse(auction.ends_at)) ||
          !Number.isFinite(price) || price < 1) {
        // An incomplete auction must never fall back to fixed-price actions.
        return { status: 'error', reason: 'service', product: null };
      }
      return { status: 'ready', product: { ...product, auction, price, endsAt: Date.parse(auction.ends_at), clock: health.clock } };
    } catch (error) { return lookupFailure(error); }
  };
}

// One pending lookup per mounted detail. Superseded responses cannot update the UI,
// even if a transport ignores AbortSignal. Deferred starts coalesce StrictMode effects.
export function createProductDetailLoader(fetchProduct) {
  let generation = 0;
  let pending = null;
  let state = null;
  function cancel() {
    generation += 1;
    pending?.controller.abort();
    pending = null;
  }
  function load(id, publish) {
    if (pending?.id === id) return pending.promise;
    cancel();
    const request = { id, generation, controller: new AbortController(), promise: null };
    pending = request;
    // Background refreshes preserve mounted auction forms, gallery and history.
    publish(state?.id === id && state.status === 'ready' ? { ...state, refreshing: true } : initialProductDetail(id));
    request.promise = Promise.resolve().then(() => {
      if (generation !== request.generation) return null;
      return fetchProduct(id, { signal: request.controller.signal });
    }).catch(lookupFailure).then(result => {
      if (result && generation === request.generation) {
        state = { ...result, id, refreshing: false };
        publish(state);
      }
      return result;
    }).finally(() => { if (pending === request) pending = null; });
    return request.promise;
  }
  return { load, cancel };
}
