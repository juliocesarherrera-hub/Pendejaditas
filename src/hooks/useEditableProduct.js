import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createEditableProductLookup, initialEditableProduct } from '../lib/editable-product';
import { createProductDetailLoader } from '../lib/product-detail';

const lookup = createEditableProductLookup(supabase);
export function useEditableProduct(id, userId) {
  const key = JSON.stringify([id || '', userId || '']);
  const loader = useMemo(() => createProductDetailLoader((id, options) => lookup(id, userId, options)), [userId]);
  const [state, setState] = useState(() => ({ ...initialEditableProduct(id, userId), key }));
  const refresh = useCallback(() => loader.load(id, result => setState({ ...result, key })), [loader, key, id]);
  useEffect(() => { void refresh(); return () => loader.cancel(); }, [loader, refresh]);
  // No focus timer: refreshing a mounted edit form would lose drafts.
  return { ...(state.key === key ? state : initialEditableProduct(id, userId)), refresh };
}
