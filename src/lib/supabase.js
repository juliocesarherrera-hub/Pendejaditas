import { createClient } from '@supabase/supabase-js';
import { validateConfig } from './config';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configError = validateConfig(url, key);
export const supabase = configError ? null : createClient(url, key, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export function authRedirect(recovery = false) {
  const target = new URL(window.location.pathname, window.location.origin);
  if (recovery) target.searchParams.set('flow', 'recovery');
  return target.href;
}
