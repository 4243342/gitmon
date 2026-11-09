// 图鉴同步层（唯一契约：docs/SSOT.md §2 身份头 / §4 API / §5 同步协议）
//
// 后端 SQLite 是唯一真相源；localStorage 降级为「本地镜像 + 离线缓冲」：
// UI 永远先读本地（不等网络），本地每次变更 markDirty 入队 → debounce 推送；
// 推送失败不丢数据，留在脏队列 30s 重试或下次启动再推。
// 任何同步失败都静默降级，绝不阻塞、不回滚 UI。

import { loadCollection, saveCollection, sortPets } from './storage.js'

const QUEUE_KEY = 'gitmon:sync_queue'
const DEVICE_KEY = 'gitmon:device'
const BATCH_LIMIT = 60 // PUT /api/pets 单批上限（契约 §4）
const DEBOUNCE_MS = 600 // 变更 → 推送的防抖窗口（契约 §5）
const RETRY_MS = 30000 // 推送失败后的重试间隔
const PULL_LIMIT = 200 // 启动拉取条数（契约 §4/§5）

// ---------------------------------------------------------------- 身份（契约 §2）

// 设备 ID：首次生成后写进 localStorage，之后一直复用
function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = `dev_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch { return 'dev_anonymous' }
}

// 所有对 /api/* 的 fetch 都必须带的身份头；登录态由会话 cookie 优先，头照发
export function ownerHeader() {
  return { 'X-Gitmon-User': deviceId() }
}

// ---------------------------------------------------------------- 脏队列

// 合并与脏键定位：platform|fullName（契约 §5）
function petKey(pet) {
  return `${pet?.platform || ''}|${pet?.fullName || ''}`
}

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

function writeQueue(keys) {
  try {
    if (keys.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(keys))
    else localStorage.removeItem(QUEUE_KEY)
  } catch { /* ignore */ }
}

// 入参归一成 platform|fullName：pet 对象 / key 字符串 / 单独的 fullName 都收
function resolveKey(item) {
  if (typeof item !== 'string') return petKey(item)
  if (item.includes('|')) return item
  const p = loadCollection().find((x) => x.fullName === item)
  return p ? petKey(p) : ''
}

let pushTimer = null
let retryTimer = null
let flushing = null
// 推送飞行途中又被 markDirty 的键：成功后不能出队，否则那次改动永远发不出去
let touchedInFlight = null
let starting = false

// 未被服务端确认的键的重试次数：连续多次收不下就出队（本地保留，靠 synced 标记兜底）
const ATTEMPT_KEY = 'gitmon:sync_attempts'
const ATTEMPT_CAP = 5

function bumpAttempts(keys) {
  if (!keys.length) return []
  try {
    const all = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{}')
    const capped = keys.filter((k) => (all[k] = (all[k] || 0) + 1) >= ATTEMPT_CAP)
    capped.forEach((k) => delete all[k])
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(all))
    return capped
  } catch { return [] }
}

function schedulePush(ms = DEBOUNCE_MS) {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => { pushTimer = null; flushQueue() }, ms)
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => { retryTimer = null; flushQueue() }, RETRY_MS)
}

// 任意本地变更（收图鉴 / 战斗结算 / 升级 / 喂养…）后调用：入队 + debounce 推送
export function markDirty(pet) {
  const items = Array.isArray(pet) ? pet : [pet]
  const queue = readQueue()
  let changed = false
  for (const item of items) {
    const key = resolveKey(item)
    if (!key) continue
    // 推送飞行途中又改动了这个键：记下来，成功出队时要留下继续推
    if (touchedInFlight) touchedInFlight.add(key)
    if (!queue.includes(key)) {
      queue.push(key)
      changed = true
    }
  }
  if (changed) writeQueue(queue)
  schedulePush()
}

// ---------------------------------------------------------------- 推送（契约 §4 PUT /api/pets）

// 服务端权威条目覆盖本地同键条目（合并不重新入队）；id / syncedAt 由服务端回填
function overlay(local, serverItems) {
  const map = new Map(local.map((p) => [petKey(p), p]))
  for (const it of serverItems) {
    const key = petKey(it)
    const prev = map.get(key)
    map.set(key, prev ? { ...prev, ...it } : it)
  }
  return sortPets([...map.values()])
}

// 立即推送脏队列（按 60 条分批）。成功 true / 失败 false；同一时刻只有一个推送在飞
export function flushQueue() {
  if (flushing) return flushing
  flushing = pushLoop().finally(() => { flushing = null })
  return flushing
}

async function pushLoop() {
  for (;;) {
    const keys = readQueue()
    if (!keys.length) return true
    const list = loadCollection()
    const items = list.filter((p) => keys.includes(petKey(p)))
    if (!items.length) {
      writeQueue([]) // 死键（本地已无对应精灵），清掉免得反复重试
      return true
    }
    const batch = items.slice(0, BATCH_LIMIT)
    const touched = new Set()
    touchedInFlight = touched
    let data = null
    try {
      const res = await fetch('/api/pets', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...ownerHeader() },
        body: JSON.stringify({ items: batch }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json()
    } catch {
      // 离线 / 后端不可达：队列原样保留，30s 后重试，全程静默不打扰 UI
      touchedInFlight = null
      scheduleRetry()
      return false
    }
    touchedInFlight = null
    // 用响应里的权威版本覆盖本地（saveCollection 直接落盘，不走 markDirty）
    const serverItems = Array.isArray(data?.items) ? data.items : []
    const confirmed = new Set(serverItems.map(petKey))
    if (serverItems.length) {
      // 服务端确认收下的条目打上 synced 标记（仅本地字段，供下次启动判断是否别端删除）
      const merged = overlay(loadCollection(), serverItems)
      saveCollection(merged.map((p) => (confirmed.has(petKey(p)) ? { ...p, synced: true } : p)))
    }
    // 出队只看服务端是否确认：被整条拒收的条目（如 AI 卡的特殊名字）留在队列里重试，
    // 超次后出队但本地保留——否则下次启动会被「本地有服务端无 → 丢弃」规则误杀
    const batchKeys = new Set(batch.map(petKey))
    const unconfirmed = [...batchKeys].filter((k) => !confirmed.has(k))
    const capped = bumpAttempts(unconfirmed)
    writeQueue(readQueue().filter((k) => !(confirmed.has(k) || capped.includes(k)) || touched.has(k)))
    // 本轮还有未确认条目：停一轮 30s 后再试，避免同一坏条目紧循环打后端
    if (unconfirmed.some((k) => !capped.includes(k))) {
      scheduleRetry()
      return true
    }
  }
}

// ---------------------------------------------------------------- 启动同步（契约 §5）

// flushQueue → GET /api/pets?limit=200 → 逐 pet 合并 → saveCollection（不入队）。
// 返回合并后的列表；null 表示拉取失败或跳过，UI 维持本地镜像。
export async function startupSync() {
  if (starting) return null // StrictMode 双跑去重
  starting = true
  try {
    // 1) 先推脏队列，失败则中止后续 pull，队列保留
    const ok = await flushQueue()
    if (!ok) return null
    // 2) 拉服务端清单
    const res = await fetch(`/api/pets?limit=${PULL_LIMIT}`, {
      credentials: 'same-origin',
      headers: ownerHeader(),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const server = Array.isArray(data?.items) ? data.items : []
    const local = loadCollection()
    // 3) 首次引导：服务端整体为空而本地非空 → 本地全量入队，立即推送
    if (!server.length && local.length) {
      const queue = readQueue()
      local.forEach((p) => {
        const key = petKey(p)
        if (!queue.includes(key)) queue.push(key)
      })
      writeQueue(queue)
      return (await flushQueue()) ? loadCollection() : null
    }
    // 4) 逐 pet 合并：本地脏的本地赢（等推送），否则服务端赢；
    //    服务端有本地无 → 追加；本地有服务端无：同步过（synced）才视为别端删除丢弃
    const queue = new Set(readQueue())
    const serverMap = new Map(server.map((p) => [petKey(p), p]))
    const seen = new Set()
    const merged = []
    for (const p of local) {
      const key = petKey(p)
      if (queue.has(key)) {
        merged.push(p)
        seen.add(key)
        continue
      }
      const s = serverMap.get(key)
      if (s) {
        // 服务端有 → 权威侧确认过，顺手补上 synced 标记
        merged.push({ ...p, ...s, synced: true })
        seen.add(key)
        continue
      }
      // 本地有、服务端无：曾同步过才是「已被别端删除」；
      // 从未被服务端确认过（拒收 / 离线新建）必须保留
      if (p.synced) continue
      merged.push(p)
    }
    for (const s of server) {
      const key = petKey(s)
      if (!seen.has(key)) merged.push(s)
    }
    const next = sortPets(merged)
    saveCollection(next) // 合并结果只落本地，不重新入队
    return next
  } catch {
    return null // 后端不可达：静默降级，UI 照常读本地
  } finally {
    starting = false
  }
}
