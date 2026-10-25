import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { validateConfig } from './src/lib/config.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (Object.keys(env).some((key) => /SECRET|SERVICE_ROLE|PASSWORD|PRIVATE/.test(key))) {
    throw new Error('Una variable VITE_ parece contener credenciales privadas. Retírala antes de iniciar o compilar.')
  }
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY && validateConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('Configuración pública de Supabase inválida. Revisa .env.local sin usar claves secretas.')
  }
  return { plugins: [react()] }
})
