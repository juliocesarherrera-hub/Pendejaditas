import { REMOTE_SUPABASE_ORIGINS, LAB_SUPABASE_ORIGINS } from './environment-policy.js';

export const PUBLIC_ENV_NAMES = Object.freeze(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_MAP_TILE_URL']);
export const DEFAULT_MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function clientAuthOptions(environment, labEnabled) {
  return { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    ...(environment === 'lab' && labEnabled === true ? { storageKey: 'pendejaditas-lab-auth-v1' } : {}),
  };
}

function jwtClaims(value) {
  if (typeof value !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(value)) return null;
  try { return JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return null; }
}

// Exposure guard only; this does not verify JWT signatures or grant access.
export function hasPrivateCredential(value) {
  if (typeof value !== 'string') return false;
  const claims = jwtClaims(value);
  return /sb_secret_|service_role|-----BEGIN .*PRIVATE KEY-----|postgres(?:ql)?:\/\//i.test(value)
    || Boolean(claims && claims.role !== 'anon');
}

export function validateConfig(url, key, { environment = 'production', labEnabled = false } = {}) {
  if (!['development', 'production', 'lab'].includes(environment)) return 'Entorno de aplicación no autorizado.';
  if (environment !== 'lab' && labEnabled) return 'El laboratorio no puede habilitarse en un entorno remoto.';
  if (!url || !key) return 'Falta la URL o la clave pública de Supabase. Revisa el archivo del entorno seleccionado y reinicia Vite.';
  if (typeof url !== 'string' || typeof key !== 'string') return 'Configuración pública de Supabase inválida.';
  let parsed;
  try { parsed = new URL(url); }
  catch { return 'La URL de Supabase no tiene un formato válido.'; }
  // Reject credentials, paths, alternate loopback spellings and unexpected ports.
  if (![parsed.origin, `${parsed.origin}/`].includes(url) || parsed.username || parsed.password) return 'Usa únicamente el origen autorizado de Supabase, sin rutas ni credenciales.';
  if (hasPrivateCredential(key)) return 'No uses credenciales administrativas, secretas ni service_role en el cliente.';
  const publishable = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (environment === 'lab') {
    if (labEnabled !== true || !LAB_SUPABASE_ORIGINS.includes(parsed.origin)) return 'El laboratorio requiere activación explícita y un destino local autorizado.';
    const claims = jwtClaims(key);
    const localAnon = claims?.role === 'anon' && claims.iss === 'supabase-demo' && (!claims.ref || claims.ref === 'supabase-demo');
    if (!publishable && !localAnon) return 'Usa exclusivamente la clave pública del laboratorio local, nunca claves de producción o administrativas.';
  } else {
    if (parsed.protocol !== 'https:' || !REMOTE_SUPABASE_ORIGINS.includes(parsed.origin)) return 'La URL debe ser el proyecto remoto autorizado y utilizar HTTPS.';
    if (!publishable) return 'Usa la clave pública publishable de Supabase. No uses claves secretas ni service_role.';
  }
  return '';
}

export function validatePublicEnv(env, options) {
  if (Object.entries(env).some(([name, value]) => !PUBLIC_ENV_NAMES.includes(name) || hasPrivateCredential(value))) return 'Hay variables públicas no autorizadas o credenciales privadas. No se mostraron sus valores.';
  if (env.VITE_MAP_TILE_URL && env.VITE_MAP_TILE_URL !== DEFAULT_MAP_TILE_URL) return 'El destino de mapas requiere una revisión explícita antes de autorizarse.';
  // Preserve the disconnected setup screen when neither Supabase variable exists.
  if (!env.VITE_SUPABASE_URL && !env.VITE_SUPABASE_PUBLISHABLE_KEY) return '';
  return validateConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
}
