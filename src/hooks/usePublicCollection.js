import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createPublicCollections, favoriteReferences } from '../lib/public-collections';
import { createPublicCollectionLoader, initialCollection } from '../lib/public-collection-loader';

const service = createPublicCollections(supabase);
export function usePublicCollection({ kind, sellerId, favorites = [], viewerId }) {
  const [authScope, setAuthScope] = useState('initial');
  const [loader] = useState(() => createPublicCollectionLoader((query, options) => service[query.kind]({ ...query, ...options })));
  const refs = favoriteReferences(favorites);
  const key = JSON.stringify([kind, sellerId || '', refs.ids, refs.legacyCount, viewerId, authScope]);
  const query = useMemo(() => {
    const [kind, sellerId, ids] = JSON.parse(key);
    return { kind, sellerId, favorites: [...ids].reverse(), key };
  }, [key]);
  const [state, setState] = useState(() => initialCollection(key));
  useEffect(() => {
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => { setAuthScope(session?.user?.id || 'anonymous'); });
    return () => subscription?.data.subscription.unsubscribe();
  }, []);
  const refresh = useCallback(() => loader.reset(query, setState), [loader, query]);
  const loadMore = useCallback(() => loader.more(setState), [loader]);
  useEffect(() => { void refresh(); return () => loader.cancel(); }, [refresh, loader]);
  return { ...(state.key === key ? state : initialCollection(key)), refresh, loadMore, references: refs };
}
