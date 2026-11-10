// 背包与商店的前端接口封装（/api/inventory、/api/shop）。
//
// 余额与流水一律以服务端为准：这里不做本地镜像，也不缓存。
// 背包是账号级资产，两边各存一份迟早会对不上账。
import { ownerHeader } from './sync.js'

const TIMEOUT = 15000

async function request(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...ownerHeader() },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(TIMEOUT) : undefined,
    })
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error('背包服务超时，稍后重试')
    }
    throw new Error('连不上后端 /api/inventory —— 请先启动 FastAPI 服务（默认 127.0.0.1:8000）')
  }
  let data = null
  try { data = await res.json() } catch { /* 非 JSON 响应走状态码 */ }
  if (!res.ok) {
    const detail = data?.detail
    let message = ''
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      message = [detail.error, detail.hint].filter(Boolean).join(' · ')
    } else if (typeof detail === 'string' && detail) {
      message = detail
    } else if (data?.error) {
      message = [data.error, data.hint].filter(Boolean).join(' · ')
    } else {
      message = `请求失败（HTTP ${res.status}）`
    }
    const err = new Error(message || '操作失败')
    err.status = res.status
    throw err
  }
  return data
}

export function fetchInventory() {
  return request('/api/inventory')
}

export function fetchShop() {
  return request('/api/shop')
}

/** 兑换商品。request_id 由调用方生成并在重试时复用，保证只扣一次款。 */
export function exchangeOffer(offerKey, requestId) {
  return request('/api/shop/exchange', {
    method: 'POST',
    body: { offer_key: offerKey, request_id: requestId },
  })
}

/** 消耗一件道具（羁绊符 / 经验液）。 */
export function spendItem(itemKey, count = 1, reason = '') {
  return request('/api/inventory/spend', {
    method: 'POST',
    body: { item_key: itemKey, count, reason },
  })
}

/** 发奖（战斗 / 剧情结算调用）。source_key 幂等：同一个事件重复结算只发一次。 */
export function grantItem(itemKey, count, sourceKey, reason = '') {
  return request('/api/inventory/grant', {
    method: 'POST',
    body: { item_key: itemKey, count, source_key: sourceKey, reason },
  })
}

export function newRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 32)
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}
