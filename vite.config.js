import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { loadClientEnvironment, assertLabServer } from './scripts/client-environment.mjs'

export default defineConfig(({ mode, command, isPreview }) => {
  const selected = loadClientEnvironment({ mode, command, isPreview })
  return {
    envDir: false,
    envPrefix: [],
    define: selected.define,
    plugins: [react(), ...(selected.lab ? [{ name: 'pendejaditas-lab-isolation', configResolved: assertLabServer }] : [])],
    ...(selected.lab ? { server: { host: '127.0.0.1', port: 5175, strictPort: true } } : {}),
  }
})
