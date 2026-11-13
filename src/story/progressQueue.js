// 剧情推进的写入队列。
//
// 两个必须解决的问题：
// 1) 串行 —— /progress 带 step 乐观锁，连点两下若并发发出两个同 step 请求，
//    后端认第一个、把第二个判 409「状态已过期」。而本地已经进了下一屏，
//    于是本地和服务端各停在不同的屏上，后续每一步都 409。所以同一时刻只允许一次在飞。
// 2) 合并 —— 一屏的 ink_state 是「本屏开始前」的完整快照，后一屏天然覆盖前一屏。
//    在飞期间又走了两屏，只需要发最新那一屏，不必补发中间态。
//
// 断网时不丢：失败的最新一屏落到 localStorage，退避重试；重进剧情时先补发再 resume。

const DIRTY_KEY = 'gitmon:story:dirty'
const RETRY_MIN = 800
const RETRY_MAX = 15000
// 本地脏包留一天就够：再久的推进，玩家自己也不会认那是同一段进度
const DIRTY_TTL = 24 * 3600 * 1000

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false

// 这几类失败重试多少次都不会成功：脏包留着只会让玩家每次进来都撞同一堵墙
function terminal(err) {
  if (err?.expired) return true
  const status = Number(err?.status) || 0
  if (status === 409) return true
  if (status === 408 || status === 429) return false
  return status >= 400 && status < 500
}

function readRaw() {
  try {
    const raw = localStorage.getItem(DIRTY_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** 读取待补发的脏包（跨标签页共享，所以带 TTL 兜底脏数据） */
export function readDirty() {
  const raw = readRaw()
  if (!raw || !raw.run_id || !raw.payload) return null
  if (raw.at && Date.now() - raw.at > DIRTY_TTL) return null
  return raw
}

/** 丢掉脏包；不传 run_id 表示无条件清空 */
export function dropDirty(runId) {
  const raw = readRaw()
  if (!raw) return
  if (runId && raw.run_id !== runId) return
  try { localStorage.removeItem(DIRTY_KEY) } catch { /* 隐私模式：没落盘就没得清 */ }
}

/**
 * 重进剧情时先把上次没发出去的那一屏补上。
 * step 用服务端当前的 step 重新填 —— 脏包本来就没被服务端接受过，它的 step 一定是同一个。
 */
export async function replayDirty(run, send) {
  const dirty = readDirty()
  if (!dirty || !run?.id || dirty.run_id !== run.id) return { run, replayed: false }
  try {
    const res = await send({ ...dirty.payload, run_id: run.id, step: run.step })
    dropDirty(run.id)
    return {
      run: res?.run || run,
      replayed: true,
      cleared: Boolean(res?.cleared),
      reward: res?.reward || null,
    }
  } catch (err) {
    // 服务端已经不在这一步（另一端推进 / 已结案）：本地脏包作废，别再拿它顶
    if (err?.expired) dropDirty(run.id)
    return { run, replayed: false, error: err }
  }
}

/**
 * @param {(payload: object) => Promise<object>} options.send  真正发请求的函数
 * @param {(res: object, payload: object) => void} options.onApplied 服务端已收下
 * @param {(err: Error) => void} options.onError                    硬失败（含 409 过期）
 * @param {(payload: object, err: Error) => void} options.onQueued  已落到本地脏包
 * @param {() => void} options.onRecovered                          补发成功
 */
export function createProgressWriter({ send, onApplied, onError, onQueued, onRecovered } = {}) {
  // 待发的一屏。存的是「构造器」而不是构造好的包：真正发送时再读 runRef.step /
  // visited / history，保证发出去的永远是此刻最新的值。
  let pending = null
  let inflight = false
  let timer = null
  let wait = RETRY_MIN
  let dirty = false
  let stopped = false

  const clearTimer = () => {
    if (timer) { clearTimeout(timer); timer = null }
  }

  let lastError = null

  const schedule = (payload) => {
    dirty = true
    try { localStorage.setItem(DIRTY_KEY, JSON.stringify({ run_id: payload.run_id, payload, at: Date.now() })) } catch { /* 存不下就只靠内存 */ }
    onQueued?.(payload, lastError)
    clearTimer()
    // 明确离线时不空转退避，等 online 事件叫醒
    if (offline()) return
    timer = setTimeout(() => { timer = null; flush() }, wait)
    wait = Math.min(wait * 2, RETRY_MAX)
  }

  async function flush() {
    if (stopped || inflight || !pending) return
    inflight = true
    const build = pending
    pending = null
    let payload
    try {
      payload = build()
    } catch (err) {
      inflight = false
      lastError = err
      onError?.(err)
      return
    }
    // 构造时已经没有 run 了（结案 / 退出）：这一屏没有地方可写，安静丢掉
    if (!payload) { inflight = false; return }
    try {
      const res = await send(payload)
      inflight = false
      wait = RETRY_MIN
      if (dirty) {
        dirty = false
        dropDirty(payload.run_id)
        onRecovered?.()
      }
      onApplied?.(res, payload)
      // 等待期间又走了几屏：接着发最新那一屏
      if (pending) flush()
    } catch (err) {
      inflight = false
      lastError = err
      if (terminal(err)) {
        // 服务端的状态已经不认这一屏（过期 / 线已结案 / 参数不合法）：
        // 本地这一屏作废，别再落盘重试，让上层重新拉一次服务端状态。
        pending = null
        dirty = false
        dropDirty(payload.run_id)
        onError?.(err)
        return
      }
      // 网络 / 后端 5xx：保留构造器（若期间有更新的屏则用它），落盘并退避重试
      if (!pending) pending = build
      schedule(payload)
    }
  }

  const onOnline = () => {
    if (stopped) return
    wait = RETRY_MIN
    clearTimer()
    flush()
  }

  if (typeof window !== 'undefined') window.addEventListener('online', onOnline)

  return {
    /** 排队一屏。build 在真正发送时才执行，必须读最新的 ref 值 */
    push(build) {
      if (stopped) return
      pending = build
      flush()
    },
    /** 立即尝试发送（replay 之后 / 手动重试） */
    flushNow() {
      clearTimer()
      flush()
    },
    /**
     * 等手头这一屏落地。结案前必须等：结局那一屏没写进服务器，
     * 结局收集册和奖励都会丢（close 之后这条线就不再接受推进了）。
     */
    async drain(maxMs = 3500) {
      const started = Date.now()
      flush()
      while (!stopped && (inflight || pending) && Date.now() - started < maxMs) {
        await new Promise((resolve) => setTimeout(resolve, 40))
      }
      return !inflight && !pending
    },
    /** 还有没有没写进服务器的屏 */
    isDirty: () => dirty || Boolean(pending),
    stop() {
      stopped = true
      clearTimer()
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline)
    },
  }
}
