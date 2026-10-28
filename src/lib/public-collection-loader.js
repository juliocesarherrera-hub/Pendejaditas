import { collectionFailure } from './public-collections.js';

export const initialCollection = key => ({ key, status: 'loading', items: [], hasMore: false, cursor: null, unavailable: 0, loadingMore: false, error: null });

export function createPublicCollectionLoader(fetchPage) {
  let generation = 0, pending = null, query, state;
  function cancel() { generation++; pending?.controller.abort(); pending = null; }
  function run(nextQuery, publish, append) {
    if (pending) return pending.promise;
    query = nextQuery;
    const request = { generation, controller: new AbortController() };
    pending = request;
    if (append) { state = { ...state, loadingMore: true, error: null }; publish(state); }
    request.promise = Promise.resolve().then(() => {
      if (generation !== request.generation) return null;
      return fetchPage(query, { cursor: append ? state.cursor : undefined, signal: request.controller.signal });
    }).catch(collectionFailure).then(result => {
      if (!result || generation !== request.generation) return result;
      if (result.status === 'ready') {
        const previous = append ? state.items : [];
        state = { ...state, ...result, key: query.key, items: [...previous, ...result.items.filter(item => !previous.some(old => old.id === item.id))],
          unavailable: (append ? state.unavailable : 0) + result.unavailable, loadingMore: false, error: null };
      } else if (append) state = { ...state, loadingMore: false, error: result.reason || 'service' };
      else state = { ...initialCollection(query.key), ...result };
      publish(state);
      return result;
    }).finally(() => { if (pending === request) pending = null; });
    return request.promise;
  }
  function reset(nextQuery, publish) {
    cancel();
    state = initialCollection(nextQuery.key); publish(state);
    return run(nextQuery, publish, false);
  }
  function more(publish) {
    if (pending) return pending.promise;
    if (!state?.hasMore || state.status !== 'ready') return Promise.resolve(null);
    return run(query, publish, true);
  }
  return { reset, more, cancel };
}
