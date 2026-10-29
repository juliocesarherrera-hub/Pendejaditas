import { initialCollection } from './public-collection-loader.js';
import { collectionFailure } from './public-collections.js';
import { catalogQuery, CATALOG_PAGE_SIZE } from './catalog-page.js';

// Prepared controller only: no subscriptions, intervals or automatic mount in App.
// Membership stays frozen until an explicit first-page refresh succeeds.
// A cursor belongs to one query/session and is unusable after known changes.
export function createCatalogPageLoader(service, publish) {
  let state, generation = 0, liveRequest = null, pending = null, sequence = 0, query;
  let active = false, connected = true;
  const emit = next => { state = next; publish(state); };
  const blocked = reason => Promise.resolve({ status: 'blocked', reason });
  const errorReason = reason => ['connection', 'restricted', 'configuration'].includes(reason) ? reason : 'service';
  function cancelPage() { pending?.controller.abort(); pending = null; }
  function cancelLive() { liveRequest?.controller.abort(); liveRequest = null; }
  function cancel() { generation++; active = false; cancelPage(); cancelLive(); }
  function freshState() {
    return { ...initialCollection(query.key), resultsChanged: false, refreshing: false, liveError: null, connected };
  }
  function markChanged() {
    if (!active || !state) return;
    // Identity checking discards responses even if the transport ignores abort.
    cancelPage();
    emit({ ...state, resultsChanged: true, loadingMore: false, refreshing: false,
      ...(state.status === 'loading' ? { status: 'error', error: 'results_changed' } : {}) });
  }
  function restricted() {
    // Preserving a public list never takes precedence over a permission change.
    cancelPage(); cancelLive();
    emit({ ...freshState(), status: 'error', error: 'restricted', resultsChanged: true });
  }
  function uniqueItems(items) {
    const seen = new Set();
    return items.filter(item => {
      if (!item || typeof item.id !== 'string' || !item.id) throw new Error('invalid_page');
      const key = item.id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function run(kind) {
    const request = { kind, generation, controller: new AbortController(), query,
      cursor: kind === 'more' ? state.cursor : null };
    const current = () => active && generation === request.generation && pending === request;
    request.promise = Promise.resolve().then(() => current()
      ? service.page(request.query.input, { cursor: request.cursor, signal: request.controller.signal }) : null)
      .catch(collectionFailure).then(result => {
        if (!current()) return { status: 'cancelled' };
        if (result?.status === 'ready') {
          try {
            if (!Array.isArray(result.items) || result.items.length > CATALOG_PAGE_SIZE || typeof result.hasMore !== 'boolean' || (result.hasMore && !result.cursor)) throw new Error('invalid_page');
            if (kind === 'more' && result.hasMore && JSON.stringify(result.cursor) === JSON.stringify(request.cursor)) throw new Error('stalled_cursor');
            let changed = false;
            const previous = new Map(state.items.map(item => [item.id, item]));
            const incoming = result.items.map(item => {
              const old = previous.get(item.id);
              if (old?.auction && item.auction && old.auction.revision === item.auction.revision
                && (old.price !== item.price || old.auction.status !== item.auction.status || old.endsAt !== item.endsAt)) throw new Error('inconsistent_revision');
              if (!old?.auction || !item.auction || old.auction.revision <= item.auction.revision) return item;
              changed ||= old.price !== item.price || old.auction.status !== item.auction.status || old.endsAt !== item.endsAt;
              return { ...item, auction: old.auction, price: old.price, endsAt: old.endsAt, clock: old.clock };
            });
            const items = uniqueItems(kind === 'more' ? [...state.items, ...incoming] : incoming);
            pending = null;
            if (kind === 'refresh') cancelLive(); // Old-membership batches cannot patch the replacement list.
            emit({ ...state, status: 'ready', items, hasMore: result.hasMore, cursor: result.cursor ?? null,
              unavailable: (kind === 'more' ? state.unavailable : 0) + (result.unavailable || 0),
              consistency: result.consistency, loadingMore: false, refreshing: false, error: null,
              resultsChanged: changed, liveError: kind === 'more' ? state.liveError : null });
            return result;
          } catch { result = { status: 'error', reason: 'service' }; }
        }
        if (result?.reason === 'restricted') { restricted(); return { status: 'error', reason: 'restricted' }; }
        pending = null;
        const error = errorReason(result?.reason);
        if (kind === 'initial') emit({ ...freshState(), status: ['invalid', 'unsupported'].includes(result?.status) ? result.status : 'error', error, resultsChanged: false });
        else emit({ ...state, status: state.status === 'loading' ? 'error' : state.status,
          loadingMore: false, refreshing: false, error, resultsChanged: kind === 'refresh' || state.resultsChanged });
        return ['invalid', 'unsupported'].includes(result?.status) ? { status: result.status, reason: error } : { status: 'error', reason: error };
      }).finally(() => { if (pending === request) pending = null; });
    pending = request;
    emit({ ...state, error: null, loadingMore: kind === 'more', refreshing: kind === 'refresh',
      resultsChanged: kind === 'refresh' || state.resultsChanged });
    return request.promise;
  }
  function reset(input) {
    generation++; active = true; cancelPage(); cancelLive();
    const spec = catalogQuery(input);
    query = { input: input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : input, key: spec.status === 'supported' ? spec.key : `invalid-${++sequence}` };
    // Filters/session changes immediately remove the previous query's data.
    state = freshState();
    if (!connected) {
      emit({ ...state, status: 'error', error: 'connection', resultsChanged: true });
      return blocked('disconnected');
    }
    return run('initial');
  }
  function more() {
    if (!active || !state) return blocked('inactive');
    if (!connected) return blocked('disconnected');
    if (state.resultsChanged) return blocked('results_changed');
    if (pending) return pending.kind === 'more' ? pending.promise : blocked('refreshing');
    if (state.status !== 'ready' || !state.hasMore) return Promise.resolve(null);
    return run('more');
  }
  function refresh() {
    if (!active || !query) return Promise.resolve(null);
    if (pending?.kind === 'refresh') return pending.promise;
    generation++; cancelPage(); cancelLive();
    if (!connected) { markChanged(); return blocked('disconnected'); }
    return run('refresh');
  }
  // Inject shared public events later. These adapters create ZERO subscriptions,
  // timers, automatic queries or writes, including on reconnect/focus.
  function notifyChange(change = {}) {
    const { source, event } = change || {};
    if (!['products', 'auctions'].includes(source) || !['INSERT', 'UPDATE', 'DELETE'].includes(event)) return false;
    markChanged(); return true; // Conservative, also covers an auction outside loaded pages.
  }
  function connectionChanged(online) {
    if (typeof online !== 'boolean' || online === connected) return;
    connected = online;
    if (!active || !state) return;
    cancelLive();
    markChanged();
    emit({ ...state, connected, error: online ? state.error : 'connection' });
  }
  function refreshAuctions(ids) {
    if (!active || state?.status !== 'ready') return Promise.resolve({ status: 'invalid' });
    if (!connected) return blocked('disconnected');
    const allowed = state.items.filter(item => item.type === 'auction').map(item => item.id);
    if (!Array.isArray(ids) || ids.length > CATALOG_PAGE_SIZE || ids.some(id => !allowed.includes(id))) return Promise.resolve({ status: 'invalid' });
    const batch = [...new Set(ids)].sort(), key = JSON.stringify(batch);
    if (liveRequest) return key === liveRequest.ids ? liveRequest.promise : Promise.resolve({ status: 'busy' });
    if (!batch.length) return Promise.resolve({ status: 'ready', updates: [] });
    const request = { generation, controller: new AbortController(), ids: key }; liveRequest = request;
    const current = () => active && generation === request.generation && liveRequest === request;
    request.promise = Promise.resolve().then(() => current() ? service.auctionUpdates(batch, { signal: request.controller.signal }) : null)
      .catch(collectionFailure).then(result => {
        if (!current()) return { status: 'cancelled' };
        if (result?.reason === 'restricted') { restricted(); return { status: 'error', reason: 'restricted' }; }
        if (result?.status === 'ready') {
          try {
            if (!Array.isArray(result.updates) || result.updates.length !== batch.length || new Set(result.updates.map(update => update.id)).size !== batch.length) throw new Error('invalid_updates');
            const currentItems = new Map(state.items.map(item => [item.id, item]));
            const updates = result.updates.filter(update => {
              if (!batch.includes(update.id) || !Number.isInteger(update.auction?.revision) || update.auction.revision < 1 || !Number.isInteger(update.price) || update.price < 1 || update.price > 1000000) throw new Error('invalid_updates');
              const old = currentItems.get(update.id);
              if (old.auction.revision === update.auction.revision && (old.price !== update.price || old.auction.status !== update.auction.status)) throw new Error('inconsistent_revision');
              return update.auction.revision >= old.auction.revision;
            });
            const changed = updates.some(update => {
              const old = currentItems.get(update.id);
              return old.price !== update.price || old.auction.status !== update.auction.status || old.endsAt !== update.endsAt;
            });
            if (changed) markChanged(); // Abort an append/refresh before applying new prices.
            const byId = new Map(updates.map(update => [update.id, update]));
            emit({ ...state, items: state.items.map(item => {
              const update = byId.get(item.id);
              return update ? { ...item, auction: update.auction, price: update.price, endsAt: update.endsAt, clock: update.clock } : item;
            }), liveError: null });
            return result;
          } catch { result = { status: 'error', reason: 'service' }; }
        }
        markChanged();
        const reason = errorReason(result?.reason);
        emit({ ...state, liveError: reason });
        return { status: 'error', reason };
    }).finally(() => { if (liveRequest === request) liveRequest = null; });
    return request.promise;
  }
  return { reset, more, cancel, markChanged, notifyChange, connectionChanged, refreshAuctions, refresh, getState: () => state };
}
