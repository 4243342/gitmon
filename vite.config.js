import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

// 后端地址：登录授权、徽章、卡片都在 8000 端口
const BACKEND = process.env.GITMON_BACKEND || 'http://127.0.0.1:8000'

const PUBLIC_DIR = resolve(process.cwd(), 'public')

// public/ 下整包嵌入的静态站点（/petgame/、/pokerogue/ 这类）。
// vite dev / preview 的 SPA 兜底会把 /xxx/ 也吃成宿主首页 —— iframe 里打开的是
// GitMon 自己，看着就像「游戏没接进去」。这里把「public 里确实有 index.html 的目录」
// 补成 index.html，静态服务器（nginx / GitHub Pages）本来就会这么做，本地也保持一致。
const staticAppDirIndex = () => {
  const rewrite = (req) => {
    const url = req.url || ''
    const [path, query = ''] = url.split('?')
    if (path === '/' || /\.[a-z0-9]+$/i.test(path)) return
    const clean = path.replace(/\/+$/, '')
    if (!clean) return
    // 防止 ../ 穿越
    const dir = resolve(PUBLIC_DIR, `.${clean}`)
    if (!dir.startsWith(PUBLIC_DIR)) return
    if (!existsSync(join(dir, 'index.html'))) return
    req.url = `${clean}/index.html${query ? `?${query}` : ''}`
  }
  const middleware = (req, _res, next) => {
    rewrite(req)
    next()
  }
  return {
    name: 'static-app-directory-index',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  plugins: [react(), staticAppDirIndex()],
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
