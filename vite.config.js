import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 独立缓存目录：避免沙箱对 node_modules/.vite 的批量删除保护
  cacheDir: 'node_modules/.vite-gitmon',
  server: { host: '127.0.0.1', port: 5173 },
})
