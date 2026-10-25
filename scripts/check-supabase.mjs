import { loadEnv } from 'vite';
import { validateConfig } from '../src/lib/config.js';
const env = loadEnv('development', process.cwd(), 'VITE_');
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const invalid = validateConfig(url, key);
console.log(invalid ? 'Variables: configuración incompleta o inválida (sin mostrar valores).' : 'Variables: URL HTTPS y clave pública configuradas.');
if (invalid) process.exit(1);
try {
  const response = await fetch(`${url}/rest/v1/rpc/marketplace_health`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || data !== 2) {
    console.log(`Servidor: HTTP ${response.status}. Compatibilidad no verificada. Revisa supabase/diagnostics/audit-marketplace.sql; no repitas la migración completa.`);
    process.exitCode = 1;
  } else {
    // limit=0 checks columns, grants and the FK join without downloading records.
    const columns = 'id,owner_id,title,description,category,condition,sale_type,price,area,image_path,created_at,updated_at,profiles!products_owner_id_fkey(display_name)';
    const checks = [
      ['Catálogo y relación con vendedores', `/rest/v1/products?select=${encodeURIComponent(columns)}&limit=0`],
      ['Columnas de perfiles públicos', '/rest/v1/profiles?select=id,display_name,bio,city,created_at&limit=0'],
      ['Configuración pública de Auth', '/auth/v1/settings'],
    ];
    for (const [label, endpoint] of checks) {
      const result = await fetch(`${url}${endpoint}`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
      console.log(`${label}: ${result.ok ? 'accesible' : `no compatible (HTTP ${result.status})`}.`);
      if (!result.ok) process.exitCode = 1;
    }
    console.log('Esta consulta no certifica RLS ni escrituras en Storage. Consulta docs/AUDITORIA-SUPABASE.md y ejecuta la prueba con dos cuentas.');
  }
} catch {
  console.log('Servidor: no se pudo establecer la conexión. No se imprimieron credenciales ni respuestas privadas.');
  process.exitCode = 1;
}
