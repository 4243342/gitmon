import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 后端地址：登录授权、徽章、卡片都在 8000 端口
const BACKEND = process.env.GITMON_BACKEND || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  // 独立缓存目录：避免沙箱对 node_modules/.vite 的批量删除保护
  cacheDir: 'node_modules/.vite-gitmon',
  server: {
    host: '127.0.0.1',
    port: 5173,
    // 同源代理：登录 cookie（SameSite=Lax）才能正常带上
    proxy: {
      '/api': { target: BACKEND, changeOrigin: false },
      '/badge': { target: BACKEND, changeOrigin: false },
      '/card': { target: BACKEND, changeOrigin: false },
    },
  },
})
