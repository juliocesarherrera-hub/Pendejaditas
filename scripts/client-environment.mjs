import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { PUBLIC_ENV_NAMES, validateConfig, validatePublicEnv } from '../src/lib/config.js';

const LAB_NAMES = ['PJD_LAB_ENABLED', 'PJD_LAB_SUPABASE_URL', 'PJD_LAB_SUPABASE_PUBLISHABLE_KEY'];

// Only these selected, validated values are ever emitted to the browser.
export function selectClientEnvironment({ mode, command = 'serve', isPreview = false, env = {}, remoteKeys = [] }) {
  if (!['development', 'production', 'lab'].includes(mode)) throw new Error('Modo no autorizado. Usa development, production o lab.');
  if ((command === 'build' || isPreview) && mode !== 'production') throw new Error('Solo se permite compilar o previsualizar el entorno de producción. El laboratorio es local y no genera dist.');
  const lab = mode === 'lab';
  let publicEnv;
  if (lab) {
    if (Object.keys(env).some(name => !LAB_NAMES.includes(name)) || env.PJD_LAB_ENABLED !== 'true') throw new Error('El laboratorio requiere su archivo separado y activación explícita, sin variables VITE_ ni credenciales remotas.');
    publicEnv = { VITE_SUPABASE_URL: env.PJD_LAB_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: env.PJD_LAB_SUPABASE_PUBLISHABLE_KEY };
    if (remoteKeys.filter(Boolean).includes(publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY)) throw new Error('Se rechazó una clave del entorno remoto en el laboratorio.');
    const invalid = validateConfig(publicEnv.VITE_SUPABASE_URL, publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY, { environment: 'lab', labEnabled: true });
    if (invalid) throw new Error(invalid);
  } else {
    publicEnv = env;
    const invalid = validatePublicEnv(env, { environment: mode });
    if (invalid) throw new Error(invalid);
  }
  const values = Object.fromEntries(PUBLIC_ENV_NAMES.map(name => [name, publicEnv[name] || '']));
  values.VITE_PJD_ENVIRONMENT = mode;
  values.VITE_PJD_LAB_ENABLED = lab ? 'true' : 'false';
  return { lab, define: Object.fromEntries(Object.entries(values).map(([name, value]) => [`import.meta.env.${name}`, JSON.stringify(value)])) };
}

export function loadClientEnvironment({ mode, command = 'serve', isPreview = false, root = process.cwd() }) {
  // Never load root .env* into the lab; reject VITE_ inherited from a shell.
  const env = loadEnv(mode, mode === 'lab' ? resolve(root, '.lab') : root, mode === 'lab' ? ['PJD_LAB_', 'VITE_'] : 'VITE_');
  const remoteKeys = mode === 'lab' ? ['development', 'production'].map(remoteMode => loadEnv(remoteMode, root, 'VITE_').VITE_SUPABASE_PUBLISHABLE_KEY) : [];
  return selectClientEnvironment({ mode, command, isPreview, env, remoteKeys });
}

export function assertLabServer(config) {
  if (config.server.host !== '127.0.0.1' || config.server.port !== 5175 || config.server.strictPort !== true) throw new Error('El laboratorio solo puede servirse en 127.0.0.1:5175, sin exposición a la red local.');
}
