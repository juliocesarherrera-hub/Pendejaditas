import { useCallback, useEffect, useState } from 'react';
import { fetchProductById } from '../lib/marketplace';
import { createProductDetailLoader, initialProductDetail } from '../lib/product-detail';

export function useProductDetail(id) {
  const [loader] = useState(() => createProductDetailLoader(fetchProductById));
  const [state, setState] = useState(() => initialProductDetail(id));
  const refresh = useCallback(() => loader.load(id, setState), [id, loader]);
  useEffect(() => {
    void refresh();
    const foreground = () => { if (!document.hidden) void refresh(); };
    const timer = setInterval(foreground, 30000);
    window.addEventListener('focus', foreground);
    window.addEventListener('online', foreground);
    return () => {
      loader.cancel();
      clearInterval(timer);
      window.removeEventListener('focus', foreground);
      window.removeEventListener('online', foreground);
    };
  }, [refresh, loader]);
  return { ...(state.id === id ? state : initialProductDetail(id)), refresh };
}
