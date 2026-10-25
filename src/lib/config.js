export function validateConfig(url, key) {
  if (!url || !key) return 'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local. Reinicia Vite después de configurarlas.';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) return 'La URL de Supabase debe ser la URL HTTPS del proyecto.';
  } catch { return 'La URL de Supabase no tiene un formato válido.'; }
  // Only the new, explicitly public key type is accepted in the browser.
  if (!key.startsWith('sb_publishable_')) return 'Usa la clave pública publishable de Supabase. No uses claves secretas ni service_role.';
  return '';
}
