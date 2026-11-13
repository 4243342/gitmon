import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 后端地址：登录授权、徽章、卡片都在 8000 端口
const BACKEND = process.env.GITMON_BACKEND || 'http://127.0.0.1:8000'

// 剧本包里整包嵌入的静态站点（public/petgame/）。
// vite dev / preview 的 SPA 兜底会把 /petgame/ 也吃成宿主首页 —— iframe 里
// 打开的是 GitMon 自己，看着就像「游戏没接进去」。这里把目录地址补成 index.html，
// 静态服务器（nginx / GitHub Pages）本来就会这么做，本地也要一致。
const PETGAME_DIRS = ['/petgame', '/petgame/atlas', '/petgame/docs']
const petgameDirIndex = () => {
  const rewrite = (req) => {
    const url = req.url || ''
    const [path, query = ''] = url.split('?')
    const clean = path.replace(/\/+$/, '') || '/'
    if (!PETGAME_DIRS.includes(clean)) return
    req.url = `${clean}/index.html${query ? `?${query}` : ''}`
  }
  return {
    name: 'petgame-directory-index',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req)
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), petgameDirIndex()],
  // 独立缓存目录：避免沙箱对 node_modules/.vite 的批量删除动作
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
