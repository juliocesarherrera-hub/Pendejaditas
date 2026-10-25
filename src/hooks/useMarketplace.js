import { useCallback, useEffect, useRef, useState } from 'react';
import { configError, supabase } from '../lib/supabase';
import { fetchProducts } from '../lib/marketplace';
export function useMarketplace() {
  const [products, setProducts] = useState([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!supabase) { setError(configError); setLoading(false); return; }
    try {
      const { data, error: healthError } = await supabase.rpc('marketplace_health');
      if (healthError || data !== 2) throw new Error('No se pudo comprobar la compatibilidad de Supabase. Revisa el diagnóstico de docs/ETAPA-2.md; no vuelvas a ejecutar la migración completa.');
      const rows = await fetchProducts();
      if (request === generation.current) { setProducts(rows); setReady(true); setError(''); }
    } catch (failure) {
      if (request === generation.current) { setReady(false); setError(failure.message || 'No se pudo cargar el catálogo.'); }
    } finally { if (request === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    const onFocus = () => { if (!document.hidden) refresh(); };
    const timer = setInterval(onFocus, 30000);
    let realtimeTimer;
    const onAuction=()=>{clearTimeout(realtimeTimer);realtimeTimer=setTimeout(refresh,200);};
    const channel=supabase?.channel('catalog-auctions').on('postgres_changes',{event:'*',schema:'public',table:'auctions'},onAuction).subscribe();
    window.addEventListener('focus', onFocus);
    const invalidate = () => { generation.current += 1; };
    return () => { invalidate(); clearInterval(timer); clearTimeout(realtimeTimer); window.removeEventListener('focus', onFocus); if(channel)void supabase.removeChannel(channel); };
  }, [refresh]);
  return { products, ready, loading, error, refresh };
}
