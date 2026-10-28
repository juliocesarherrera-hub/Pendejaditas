import { createClient } from '@supabase/supabase-js';
import { validateConfig, clientAuthOptions } from './config';
import { fetchWithTimeout } from './fetch-timeout';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const environment = import.meta.env.VITE_PJD_ENVIRONMENT || 'production';
const labEnabled = import.meta.env.VITE_PJD_LAB_ENABLED === 'true' && import.meta.env.DEV && environment === 'lab';
export const configError = validateConfig(url, key, { environment, labEnabled });
export const supabase = configError ? null : createClient(url, key, {
  global: {fetch: fetchWithTimeout},
  auth: clientAuthOptions(environment, labEnabled),
});

export function authRedirect(recovery = false) {
  const target = new URL(window.location.pathname, window.location.origin);
  if (recovery) target.searchParams.set('flow', 'recovery');
  return target.href;
}
