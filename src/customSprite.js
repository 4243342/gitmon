// 每只精灵的自定义形象（文档 §7.3 扩展）：上传 / 拖拽图片 → 方形裁剪 → IndexedDB 持久化
// GIF（小文件）原样保留动画；其余图片居中裁剪缩放到 256×256
const DB_NAME = 'gitmon'
const STORE = 'custom-sprites'

const subs = new Set()
const cache = new Map() // key -> dataURL
let dbPromise = null
let loaded = false

export function customSpriteKey(pet) {
  return `${pet.platform}:${pet.fullName}`
}

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function runTx(mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    let request
    try {
      request = fn(t.objectStore(STORE))
    } catch (e) {
      reject(e)
      return
    }
    t.oncomplete = () => resolve(request ? request.result : undefined)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

function notify() {
  for (const fn of subs) fn()
}

// 应用启动时调用一次：把全部自定义形象载入内存缓存
export function initCustomSprites() {
  if (loaded) return Promise.resolve()
  return runTx('readonly', (s) => s.getAll())
    .then((rows) => {
      for (const row of rows || []) cache.set(row.id, row.data)
      loaded = true
      notify()
    })
    .catch(() => {}) // IndexedDB 不可用时静默降级为默认立绘
}

export function onCustomSprite(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

export function getCustomSprite(pet) {
  return (pet && cache.get(customSpriteKey(pet))) || null
}

export function hasCustomSprite(pet) {
  return !!(pet && cache.has(customSpriteKey(pet)))
}

const readFile = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(r.error)
  r.readAsDataURL(file)
})

const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = url
})

async function fileToDataUrl(file) {
  // 小 GIF 原样入库，动画保留
  if (file.type === 'image/gif' && file.size < 400 * 1024) return readFile(file)
  const url = await readFile(file)
  const img = await loadImage(url)
  const S = 256
  const side = Math.min(img.width, img.height)
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = img.width > S || img.height > S
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S)
  return c.toDataURL('image/png')
}

export async function setCustomSprite(pet, file) {
  if (!pet || !file) return null
  const data = await fileToDataUrl(file)
  const id = customSpriteKey(pet)
  await runTx('readwrite', (s) => s.put({ id, data, updatedAt: Date.now() }))
  cache.set(id, data)
  notify()
  return data
}

export async function clearCustomSprite(pet) {
  if (!pet) return
  const id = customSpriteKey(pet)
  try {
    await runTx('readwrite', (s) => s.delete(id))
  } catch {
    // 存储不可用时也把内存里的清掉
  }
  cache.delete(id)
  notify()
}

// 供 canvas 绘制（分享卡等）取 Image 对象；没有自定义形象时返回 null
export async function loadCustomSpriteImage(pet) {
  const url = getCustomSprite(pet)
  if (!url) return null
  try {
    return await loadImage(url)
  } catch {
    return null
  }
}
