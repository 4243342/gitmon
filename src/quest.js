// 任务模式接口封装（/api/quest/*）。
//
// 任务本身是「领取 → 复审 → 发奖」三步，但**判定全在后端**：
// 前端不读星数、不算奖励、不判断通过没通过，只把后端给的结果原样显示出来。
//
// 归因核对需要**玩家自己**的令牌（后端拿它去问平台「这个账号收藏过这个仓库吗」），
// 所以两个平台的令牌都要带上：目标在 GitHub 就用 GitHub 令牌，在 Gitee 就用 Gitee 令牌。
// 游客没令牌也能玩，只是最多拿到 40% 的部分奖励。
import { ownerHeader } from './sync.js'

const TIMEOUT = 20000

function tokenHeaders() {
  const headers = {}
  try {
    const gh = localStorage.getItem('gitmon:gh_token') || ''
    const gt = localStorage.getItem('gitmon:gitee_token') || ''
    if (gh) headers['X-GitHub-Token'] = gh
    if (gt) headers['X-Gitee-Token'] = gt
  } catch { /* 隐私模式忽略 */ }
  return headers
}

async function request(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...ownerHeader(),
        ...tokenHeaders(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(TIMEOUT) : undefined,
    })
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error('任务服务超时，稍后重试')
    }
    throw new Error('连不上后端 /api/quest —— 请先启动 FastAPI 服务（默认 127.0.0.1:8000）')
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

/** 任务板：今天能领什么、额度还剩多少、我手上有哪些没复审的。 */
export function fetchQuestBoard() {
  return request('/api/quest/board')
}

/**
 * 领取任务。target 用任务板给的原样字符串（形如 github-owner/repo），
 * 后端据此认平台 —— 别在前端拆 owner/repo，拆错了平台就对不上。
 *
 * 目标其实是固定的（后端配置里那一个仓库），带上 target 只是让后端能校验
 * 「前端没拿错」。传空串也行。
 */
export function issueQuest(goalKey, target = '') {
  return request('/api/quest/issue', {
    method: 'POST',
    body: { goal_key: goalKey, target },
  })
}

/** 提交复审：后端重新拉一次星数比对，通过就发奖。 */
export function verifyQuest(runId) {
  return request('/api/quest/verify', {
    method: 'POST',
    body: { id: runId },
  })
}

/** 历史记录与通过率。 */
export function fetchQuestHistory() {
  return request('/api/quest/history')
}
