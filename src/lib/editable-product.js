import { createMarketplace, productColumns } from './marketplace-core.js';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function initialEditableProduct(id, userId) {
  if (typeof userId !== 'string' || !uuid.test(userId)) return { status: 'restricted' };
  return { status: typeof id === 'string' && uuid.test(id) ? 'loading' : 'invalid' };
}
export function createEditableProductLookup(client) {
  const marketplace = createMarketplace(client);
  return async (id, userId, { signal } = {}) => {
    const initial = initialEditableProduct(id, userId);
    if (initial.status !== 'loading') return initial;
    if (!client) return { status: 'error', reason: 'configuration' };
    if (signal?.aborted) return { status: 'error', reason: 'connection' };
    try {
      let query = client.from('products').select(productColumns).eq('id', id.toLowerCase()).eq('owner_id', userId.toLowerCase()).maybeSingle();
      if (signal) query = query.abortSignal(signal);
      const response = await query;
      if (signal?.aborted) return { status: 'error', reason: 'connection' };
      if (response.error) {
        if ([401, 403].includes(response.status) || ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(response.error.code)) return { status: 'restricted' };
        return { status: 'error', reason: response.status === 0 ? 'connection' : 'service' };
      }
      if (!response.data) return { status: 'unavailable' };
      const row = response.data;
      if (row.id !== id.toLowerCase() || row.owner_id !== userId.toLowerCase()) return { status: 'restricted' };
      if (row.sale_type === 'auction') return { status: 'blocked' };
      if (!['fixed', 'offers'].includes(row.sale_type) || !row.updated_at) return { status: 'error', reason: 'service' };
      return { status: 'ready', product: marketplace.toProduct(row) };
    } catch (error) {
      return { status: 'error', reason: error instanceof TypeError || error?.name === 'AbortError' ? 'connection' : 'service' };
    }
  };
}
