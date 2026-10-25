import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next); setLoading(false);
      if (event === 'PASSWORD_RECOVERY') window.location.hash = 'auth/reset';
    });
    supabase.auth.getSession().then(({ data, error: failure }) => {
      if (!active) return;
      setSession(data.session); setLoading(false);
      if (failure) setError('No se pudo recuperar tu sesión. Vuelve a iniciar sesión.');
    }).catch(() => { if (active) { setLoading(false); setError('No se pudo conectar con autenticación.'); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return { session, user: session?.user || null, loading, error };
}
