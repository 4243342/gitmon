// 剧本包浏览器端验证：node scripts/story-pack-check.mjs
//
// 验证的是「换包真的换了路线」，不是截个图好看：
//   1. /api/story/packs 返回两个包
//   2. 03 步的剧本包选择器渲染出来，default 排最后
//   3. 选「斗码苍穹」后，方案卡带包铭牌，且内容是玄幻语汇
//   4. 建线后正片跑的是斗码苍穹的路线（背景 / 角色 / 台词都是它自己的）
//   5. 重新进页面（走 resume 读档路径）后仍然跑同一个包，不串回 default
//
// 不依赖模型与 GitHub：选对手阶段用请求拦截 mock 掉，
// 剧本包相关的接口（/api/story/packs、/api/story/scripts）走真实后端。
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

const CHROME = [
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p))
if (!CHROME) {
  console.error('找不到 Edge / Chrome，跳过浏览器验证')
  process.exit(0)
}

const BASE = process.env.GITMON_BASE || 'http://127.0.0.1:5173'
let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 选对手阶段的假数据：只 mock 依赖 GitHub / 模型的部分
const FAKE_BOSS = {
  full_name: 'torvalds/linux',
  fullName: 'torvalds/linux',
  platform: 'github',
  stars: 180000,
  language: 'C',
  tier: 'SSR',
  level: 150,
  cp: 60000,
  reason: '同赛道的正面对手，量级高一档。',
  selection_source: 'ai',
  track: '操作系统内核',
  rationale: '上游垄断型对手。',
  queries: [],
  verdict: {
    element_key: 'steel',
    species_key: 'dragon',
    quality: 'SSR',
    level: 150,
    hp: 900,
    stats: [
      { name: 'HP', value: 900 }, { name: 'ATK', value: 820 }, { name: 'DEF', value: 800 },
      { name: 'SPD', value: 700 }, { name: 'crit', value: 640 }, { name: 'spd', value: 620 },
    ],
    skills: ['调度器改写', '抢占式调度'],
    // 词条是对象数组（key/kind/name/desc/reason），字符串会渲染不出内容
    traits: [{ key: 'upstream', kind: 'positive', name: '上游垄断', desc: '整条链路都听它的。', reason: '内核生态位' }],
    quality_dims: { tests: 90, engineering: 95, docs: 70, maintenance: 88, community: 92 },
    sprite_seed: 4242,
  },
}

// 主角精灵：注入本地 + 供后端图鉴接口返回，两边必须是同一只
const PROBE_PET = {
  fullName: 'demo/pet', repo: 'pet', platform: 'github', level: 12,
  aiEvaluated: true,
  element: { key: 'steel', name: '钢', color: '#9fb2c8', trait: '坚硬安全，极可靠' },
  species: { key: 'beast', name: '兽型', type: 'Web 应用', body: 'biped' },
  quality: { key: 'SSR', name: '传说', color: '#ffb300', glow: 'rgba(255,179,0,.7)' },
  stats: [
    { name: 'HP', value: 88 }, { name: 'ATK', value: 82 }, { name: 'DEF', value: 80 },
    { name: 'SPD', value: 79 }, { name: 'crit', value: 75 }, { name: 'spd', value: 74 },
  ],
  combatPower: 1200, spriteSeed: 12345, evolutionStage: 2, traits: [], skills: ['x'],
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 960 })

const errors = []
page.on('pageerror', (err) => errors.push(String(err)))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})

// 只拦依赖 GitHub / 模型的接口；剧本包的接口一律放行到真实后端
const state = { started: false }
await page.setRequestInterception(true)
page.on('request', (req) => {
  const url = req.url()
  const method = req.method()
  if (process.env.GITMON_PACK_DEBUG) {
    console.log(`  → ${method} ${url.replace(BASE, '')}`)
  }
  if (method === 'POST' && /\/api\/story\/(preview|preview\/stream)$/.test(url)) {
    const body = JSON.stringify({
      bosses: [FAKE_BOSS], track: FAKE_BOSS.track, rationale: FAKE_BOSS.rationale,
      queries: [], selection_source: 'ai', seed: 1,
    })
    req.respond({
      status: 200,
      contentType: 'application/x-ndjson',
      body: `${JSON.stringify({ type: 'stage', key: 'cards' })}\n${JSON.stringify({ type: 'result', data: JSON.parse(body) })}\n`,
    })
    return
  }
  if (method === 'POST' && /\/api\/story\/text$/.test(url)) {
    // 台词：故意返回空，让前端走包内 fallback —— 这样能验证兜底也是按包的
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ texts: {}, source: 'fallback' }) })
    return
  }
  if (method === 'POST' && /\/api\/story\/progress$/.test(url)) {
    // 推进：回一条带 run 的结果，脚本_pack 沿用建线时定的包
    req.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run: {
          id: 'run_probe_1', pet_key: 'github-demo/pet', pet_name: 'demo/pet',
          boss: {
            full_name: 'torvalds/linux', platform: 'github', stars: 180000,
            language: 'C', tier: 'SSR', level: 150, cp: 60000, verdict: FAKE_BOSS.verdict,
          },
          script_title: '《三年之约：torvalds/linux》',
          script_brief: 'demo/pet 三年前被除名，与云岚宗立下三年之约',
          script_beats: ['开局：递上战书。', '中段：焚决要公开复现才炼得成。', '收束：名碑上刻谁的名字。'],
          script_pack: 'douma',
          vars: { chapter: 0, chapter_count: 3, trust: 0, deaths: 0, route: 'solo', ending_id: '' },
          visited: [], history: [], ink_state: '',
          step: 1, status: 'active', chapter_count: 3,
        },
        cleared: false,
      }),
    })
    return
  }
  if (method === 'GET' && /\/api\/pets\?/.test(url)) {
    // 图鉴同步：后端会拉走本地精灵再覆盖回来。不返回它，主角就没了，
    // resume 会按设计把这条线结案（那是正确行为，不是 bug）。
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [PROBE_PET] }) })
    return
  }
  if (method === 'PUT' && /\/api\/pets$/.test(url)) {
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    return
  }
  if (method === 'POST' && /\/api\/story\/close$/.test(url)) {
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ run: null }) })
    return
  }
  if (method === 'GET' && /\/api\/story\/current$/.test(url)) {
    // 读档：模拟服务端存着这条线，script_pack 仍是 douma。
    // 但在「建线」之前必须返回空 —— 否则前端会直接续跑，跳过 01–03 步。
    if (!state.started) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ run: null, saves: [], latest: null }),
      })
      return
    }
    req.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run: {
          id: 'run_probe_1', pet_key: 'github-demo/pet', pet_name: 'demo/pet',
          boss: {
            full_name: 'torvalds/linux', platform: 'github', stars: 180000,
            language: 'C', tier: 'SSR', level: 150, cp: 60000, verdict: FAKE_BOSS.verdict,
          },
          script_title: '《三年之约：torvalds/linux》',
          script_brief: 'demo/pet 三年前被除名，与云岚宗立下三年之约',
          script_beats: ['开局：递上战书。', '中段：焚决要公开复现才炼得成。', '收束：名碑上刻谁的名字。'],
          script_pack: 'douma',
          vars: { chapter: 0, chapter_count: 3, trust: 0, deaths: 0, route: 'solo', ending_id: '' },
          visited: ['prologue'], history: [], ink_state: '',
          step: 1, status: 'active', chapter_count: 3,
        },
        saves: [],
        latest: null,
      }),
    })
    return
  }
  if (method === 'GET' && /\/api\/auth\/(me|providers)/.test(url)) {
    // 认证也 mock 掉：不 mock 的话每跑一次测试都要打后端几十个请求，
    // 很快撞上 120 次/分钟的全局限流，测试结果随机失败（看着像代码坏了）。
    // 剧本包的接口（/api/story/packs、/api/story/scripts）仍然走真实后端。
    if (/providers/.test(url)) {
      req.respond({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ github: true, gitee: true }),
      })
      return
    }
    req.respond({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        authenticated: false, online: true,
        quota: { limit: 60, remaining: 60, resetAt: 0 },
      }),
    })
    return
  }
  if (method === 'POST' && /\/api\/tts\/warm$/.test(url)) {
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    return
  }
  if (method === 'POST' && /\/api\/story\/start$/.test(url)) {
    // 建线要真模型密钥 + GitHub 扫描，这里造一条已建好的线。
    // script_pack 来自请求里的 script.pack —— 与真实后端同一个约定。
    let requestedPack = 'default'
    try { requestedPack = JSON.parse(req.postData() || '{}')?.script?.pack || 'default' } catch { /* ignore */ }
    state.started = true
    req.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run: {
          id: 'run_probe_1',
          pet_key: 'github-demo/pet',
          pet_name: 'demo/pet',
          boss: {
            full_name: 'torvalds/linux', platform: 'github', stars: 180000,
            language: 'C', tier: 'SSR', level: 150, cp: 60000,
            verdict: FAKE_BOSS.verdict,
          },
          script_title: '《三年之约：torvalds/linux》',
          script_brief: 'demo/pet 三年前被除名，与云岚宗立下三年之约',
          script_beats: ['开局：递上战书。', '中段：焚决要公开复现才炼得成。', '收束：名碑上刻谁的名字。'],
          script_pack: requestedPack,
          vars: { chapter: 0, chapter_count: 3, trust: 0, deaths: 0, route: 'solo', ending_id: '' },
          visited: [], history: [], ink_state: '',
          step: 0, status: 'active', chapter_count: 3,
        },
        desk: { key: 'github-demo/pet', locked: true },
      }),
    })
    return
  }
  req.continue()
})

page.on('response', (res) => {
  if (res.status() >= 400) {
    console.log(`  ! ${res.status()} ${res.url().replace(BASE, '')}`)
  }
})

try {
  console.log('\n[pack] 包清单接口')
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  const packsRes = await page.evaluate(async () => {
    const res = await fetch('/api/story/packs')
    return res.json()
  })
  const packIds = (packsRes.items || []).map((p) => p.id)
  check('返回两个包', packIds.length >= 2, packIds.join(','))
  check('含斗码苍穹', packIds.includes('douma'), packIds.join(','))
  check('default 排最后', packIds[packIds.length - 1] === 'default', packIds.join(','))

  console.log('\n[pack] 进入剧情模式')
  // 清掉上一轮遗留的 active run：否则前端会直接续跑，跳过 01–03 步
  await page.evaluate(async () => {
    const cur = await fetch('/api/story/current').then((r) => r.json()).catch(() => ({}))
    if (cur?.run?.id) {
      await fetch('/api/story/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_id: cur.run.id, reason: 'abandon' }),
      }).catch(() => {})
    }
  })
  await page.evaluate((pet) => {
    localStorage.setItem('gitmon:collection:v2', JSON.stringify([pet]))
    localStorage.setItem('gitmon:llm:config', JSON.stringify({
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'probe',
      binding: {
        provider: 'custom', label: 'probe', baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'probe', verified: true, detectedBy: 'manual', models: [],
      },
      custom: { baseUrl: 'http://127.0.0.1:11434/v1', label: 'probe', model: 'probe' },
      deepAudit: false,
    }))
    sessionStorage.setItem('gitmon:llm:key', 'sk-test')
  }, PROBE_PET)
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1500)

  // 登录门槛：登录页有三个入口，得都认。
  //   · 「游客进入」   —— 没有任何登录态时才有
  //   · 「直接进入」   —— 后端认得这台机器的 gh 登录态时，用它替代游客按钮
  //   · 已经进了大厅   —— 游客态残留，直接往下走
  // 只认「游客进入」会在第二种情况下卡死（按钮压根不渲染，断言还假通过）。
  const guest = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const g = btns.find((b) => /游客进入/.test(b.textContent || ''))
    if (g) { g.click(); return 'guest' }
    const d = btns.find((b) => /直接进入/.test(b.textContent || ''))
    if (d) { d.click(); return 'device' }
    return 'already'
  })
  check('通过登录门槛', Boolean(guest), guest)
  // 登录是异步的（要打后端；「直接进入」还要跑一次 gh 登录态探测，可能慢）：
  // 轮询等「进入剧情模式」按钮出现
  let found = false
  for (let i = 0; i < 60; i += 1) {
    await sleep(500)
    found = await page.evaluate(() => Array.from(document.querySelectorAll('button, [role="button"], a'))
      .some((n) => /进入剧情模式/.test(n.textContent || '')))
    if (found) break
  }
  check('登录完成进入大厅', found)
  await sleep(500)

  const storyBtn = await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('button, [role="button"], a'))
      .find((n) => /进入剧情模式/.test(n.textContent || ''))
    if (hit) { hit.click(); return (hit.textContent || '').trim() }
    return ''
  })
  check('找到剧情模式入口', Boolean(storyBtn), storyBtn || '没找到')
  await sleep(2000)

  // 01 步：点主角卡（直接触发选对手流程）
  await page.evaluate(() => {
    const card = document.querySelector('.story-cast-card')
    if (card) card.click()
  })
  await sleep(2500)

  // 02 步：先点对手卡选中，再点确认。
  // 若服务端已有进行中的线，前端会直接 resume 到正片 —— 那时本来就没有 02 步。
  await page.evaluate(() => {
    const card = document.querySelector('.story-boss')
    if (card) card.click()
  })
  await sleep(1200)
  const confirmed = await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('button'))
      .find((n) => /就选它/.test(n.textContent || ''))
    if (hit && !hit.disabled) { hit.click(); return (hit.textContent || '').trim() }
    return ''
  })
  const alreadyInStage = await page.evaluate(() => Boolean(document.querySelector('.story-stage')))
  check('锁定对手进入剧本步骤', Boolean(confirmed) || alreadyInStage,
    confirmed || (alreadyInStage ? '（已有进行中的线，直接续跑）' : '没找到可点的确认按钮'))
  await sleep(2200)

  console.log('\n[pack] 剧本包选择器')
  // 包选择器只在「系统剧本」模式下出现：先点来源，再看选择器
  const pickedSystem = await page.evaluate(() => {
    const src = Array.from(document.querySelectorAll('.story-src')).find((n) => /系统剧本/.test(n.textContent || ''))
    if (src) { src.click(); return true }
    return false
  })
  check('切到系统剧本来源', pickedSystem)
  await sleep(2200)
  const hasPackUi = await page.evaluate(() => Boolean(document.querySelector('.story-pack-strip')))
  check('选择器已渲染', hasPackUi)
  const packButtons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.story-pack')).map((n) => n.textContent.trim()))
  check('选择器里有斗码苍穹', packButtons.some((t) => t.includes('斗码苍穹')), packButtons.join(' | '))

  console.log('\n[pack] 选斗码苍穹并出卡')
  await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('.story-pack')).find((n) => n.textContent.includes('斗码苍穹'))
    if (hit) hit.click()
  })
  await sleep(2200)

  const cards = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.story-script')).map((n) => ({
      title: n.querySelector('b')?.textContent || '',
      pack: n.querySelector('.story-script-pack')?.textContent || '',
    })))
  check('出了一张方案卡', cards.length === 1, String(cards.length))
  check('方案卡带包铭牌', cards.some((c) => c.pack.includes('斗码苍穹')), JSON.stringify(cards.map((c) => c.pack)))
  check('方案是玄幻语汇', cards.some((c) => /宗门|魂殿|山门|斗破|约|焚决|名碑/.test(c.title)), JSON.stringify(cards.map((c) => c.title)))
  // 只留《三年之约》一案：另外两个角度不能出现在界面上
  check('留下的是《三年之约》', cards.some((c) => c.title.includes('三年之约')), JSON.stringify(cards.map((c) => c.title)))
  check('《焚决》没有残留', !cards.some((c) => c.title.includes('焚决')), JSON.stringify(cards.map((c) => c.title)))
  check('《名碑》没有残留', !cards.some((c) => c.title.includes('名碑')), JSON.stringify(cards.map((c) => c.title)))

  console.log('\n[open] 开章解说屏')
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /建线|出发/.test(b.textContent || ''))
    if (btn) btn.click()
  })
  await sleep(2500)

  // 建线后第一屏是开章解说：旁白独占屏幕中央，成品配音 + 逐字显现
  const opening = await page.evaluate(() => {
    const el = document.querySelector('.story-opening')
    if (!el) return { present: false, hasStage: Boolean(document.querySelector('.story-stage')) }
    const chars = Array.from(el.querySelectorAll('.story-open-char'))
    const lit = chars.filter((c) => Number(getComputedStyle(c).opacity) > 0.5)
    const text = el.querySelector('.story-opening-text')
    const tr = text?.getBoundingClientRect()
    const er = el.getBoundingClientRect()
    return {
      present: true,
      total: chars.length,
      lit: lit.length,
      text: text?.textContent || '',
      fontSize: text ? getComputedStyle(text).fontSize : '',
      // 垂直居中：文字中心离容器中心的偏移（像素，越小越居中）
      vOffset: tr && er ? Math.round((tr.y + tr.height / 2) - (er.y + er.height / 2)) : null,
    }
  })
  check('进的是开章解说屏（不是正片舞台）', opening.present && !opening.hasStage,
    JSON.stringify(opening).slice(0, 160))
  if (opening.present) {
    check('开章文字讲的是码气世界', /码气/.test(opening.text), opening.text.slice(0, 40))
    // 偏移用 ?? 而不是 ||：偏移正好是 0（完全居中）时，|| 会把它当成「没测到」而短路成 999
    check('开章文字已居中', Math.abs(opening.vOffset ?? 999) < 40, `偏移 ${opening.vOffset}px`)
    check('开章字号够大（≥28px）', parseFloat(opening.fontSize) >= 28, opening.fontSize)
    // 逐字显现：刚进屏时不该已经全亮
    check('开章是逐字显现（没一次性全亮）', opening.lit < opening.total,
      `${opening.lit}/${opening.total}`)
    // 音频：包内 mp3 要真的能取到。
    // 探测方式读组件挂在 DOM 上的 data-audio-src ——
    // Audio 对象不把 src 暴露出来，performance 条目又可能因为缓存而不重复记录。
    const audio = await page.evaluate(() => {
      const el = document.querySelector('.story-opening')
      if (!el) return null
      return { src: el.getAttribute('data-audio-src') || null }
    })
    check('开章有音频源', Boolean(audio?.src), JSON.stringify(audio))
    // 音频真的能取到（不是 404）
    if (audio?.src) {
      const ok = await page.evaluate(async (u) => {
        const r = await fetch(u).catch(() => null)
        return Boolean(r && r.ok)
      }, audio.src)
      check('开章音频能取到', ok, audio.src)
    }
  }

  console.log('\n[pack] 解说屏三屏之后经过场进正片')
  // 解说屏有三屏：开章 + 身世两屏。一屏点一次。
  for (let i = 0; i < 4; i += 1) {
    const clicked = await page.evaluate(() => {
      const el = document.querySelector('.story-opening')
      if (!el) return false
      el.click()
      return true
    })
    if (!clicked) break
    await sleep(1200)
  }

  // 三屏解说之后先进过场（变身动画），过场播完才进正片。
  // 这一段的详细断言在 scripts/story-transform-check.mjs 里。
  const transformSeen = await page.evaluate(() => Boolean(document.querySelector('.story-tf')))
  check('解说屏之后进过场屏', transformSeen, '没找到 .story-tf')

  // 过场约 7 秒，等它播完自动进正片
  await sleep(9000)

  const stage = await page.evaluate(() => {
    const sec = document.querySelector('.story-stage')
    if (!sec) return null
    return {
      bgClass: sec.className,
      place: sec.querySelector('.story-stage-place')?.textContent || '',
      chips: Array.from(sec.querySelectorAll('.story-chip')).map((n) => n.textContent.trim()),
      text: sec.querySelector('.story-dialog p')?.textContent || '',
    }
  })
  check('开章之后进入正片舞台', Boolean(stage), '没找到 .story-stage')
  if (stage) {
    check('背景是包内的（山门之外）', stage.place.includes('山门之外'), stage.place)
    check('角色是包内的（药老 / 主角）',
      stage.chips.some((c) => c.includes('药老')) || stage.chips.includes('主角'),
      stage.chips.join(','))
    check('正片文本是玄幻语汇', /宗门|山门|斗气|功法|云岚|魂殿|名册|约期|名碑|焚决/.test(stage.text), stage.text.slice(0, 60))
    // 真正的骨架校验：序章必须是「三年之约」，不是旧那套「被逐出宗门」
    check('正片讲的是三年之约', /三年|约期|名碑|除名通知|立约/.test(stage.text), stage.text.slice(0, 80))
    check('正片没有旧的「逐出宗门」骨架', !/逐出宗门|被逐出/.test(stage.text), stage.text.slice(0, 80))
  }

  console.log('\n[pack] 重新进页面（resume 路径）仍跑同一个包')
  const beforeReload = await page.evaluate(() => document.querySelector('.story-stage-place')?.textContent || '')
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(2500)
  // 读档发生在「进入剧情模式」时：重进页面后要再点一次入口（入口可能稍后才出现）
  let reEnter = ''
  for (let i = 0; i < 20; i += 1) {
    reEnter = await page.evaluate(() => {
      const hit = Array.from(document.querySelectorAll('button, [role="button"], a'))
        .find((n) => /进入剧情模式|剧情模式/.test(n.textContent || ''))
      if (hit) { hit.click(); return (hit.textContent || '').trim() }
      return ''
    })
    if (reEnter) break
    await sleep(500)
  }
  check('重进后再次进入剧情模式', Boolean(reEnter), reEnter || '没找到入口')
  await sleep(3500)

  // 读档路径：mock 返回的 ink_state 是空的，运行时从头开始 ——
  // 所以要先过开章、身世旁白两屏、过场才到正片。
  // （这跟第一次进线的路径一样：开章 → origin_a → origin_b → 过场 → 序章）
  const resumePath = await page.evaluate(() => ({
    opening: Boolean(document.querySelector('.story-opening')),
    transform: Boolean(document.querySelector('.story-tf')),
    stage: Boolean(document.querySelector('.story-stage')),
  }))
  check('重进后仍在同一个包里（解说屏 / 过场 / 正片三选一）',
    resumePath.opening || resumePath.transform || resumePath.stage,
    JSON.stringify(resumePath))

  // 走到正片：解说屏有三屏（开章 + 身世两屏），一屏点一次，再等过场播完
  for (let i = 0; i < 4; i += 1) {
    const clicked = await page.evaluate(() => {
      const el = document.querySelector('.story-opening')
      if (!el) return false
      el.click()
      return true
    })
    if (!clicked) break
    await sleep(1200)
  }
  await sleep(9000)
  const dbg = await page.evaluate(() => {
    const raw = localStorage.getItem('gitmon:collection:v2')
    let parsed = []
    try { parsed = JSON.parse(raw || '[]') } catch { /* ignore */ }
    return {
      collection: parsed.map((p) => ({
        fullName: p.fullName, platform: p.platform, aiEvaluated: p.aiEvaluated, synced: p.synced,
      })),
      storyText: document.querySelector('.story-section')?.innerText?.slice(0, 200) || '',
      hasStage: Boolean(document.querySelector('.story-stage')),
      err: document.querySelector('.story-error')?.textContent || '',
    }
  })
  if (process.env.GITMON_PACK_DEBUG) {
    console.log('  dbg:', JSON.stringify(dbg))
  }
  const afterReload = await page.evaluate(() => {
    const sec = document.querySelector('.story-stage')
    return {
      present: Boolean(sec),
      place: sec?.querySelector('.story-stage-place')?.textContent || '',
      chips: Array.from(sec?.querySelectorAll('.story-chip') || []).map((n) => n.textContent.trim()),
      text: sec?.querySelector('.story-dialog p')?.textContent || '',
    }
  })
  check('重进后仍在正片', afterReload.present, JSON.stringify(afterReload))
  check('重进后背景牌没串包',
    afterReload.place === beforeReload && afterReload.place.includes('山门之外'),
    `${beforeReload} → ${afterReload.place}`)
  check('重进后角色没串包',
    afterReload.chips.some((c) => c.includes('药老') || c.includes('主角')),
    afterReload.chips.join(','))
  check('重进后文本仍是玄幻语汇',
    /宗门|山门|斗气|功法|云岚|魂殿|名册|约期|名碑|焚决/.test(afterReload.text),
    afterReload.text.slice(0, 60))
  check('重进后仍是三年之约的骨架', /三年|约期|名碑|除名通知|立约/.test(afterReload.text), afterReload.text.slice(0, 80))

  check('页面没有 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '))

  console.log('\n[art] 角色立绘按包加载')
  // 序章只有主角和旁白（都没立绘），得推进到成长章 —— 那里药老登场。
  // 先点掉序章的选项，进成长章看立绘层。
  // 一路推进到「有 NPC 登场」的那一屏（成长章 · 药老）。
  // 不能一路点到杂兵战 —— 战斗屏是另一个视图，没有立绘层。
  // 每一步都先看有没有 NPC chip，有就停。
  let reachedNpc = false
  for (let i = 0; i < 12; i += 1) {
    const state = await page.evaluate(() => ({
      hasNpc: Array.from(document.querySelectorAll('.story-chip'))
        .some((n) => /药老|魂殿|云岚宗/.test(n.textContent || '')),
      inBattle: Boolean(document.querySelector('.story-battle')),
    }))
    if (state.hasNpc) { reachedNpc = true; break }
    // 已经进了战斗就退回来：走「先撤」那条路能回到剧情
    if (state.inBattle) {
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find((x) => /先撤/.test(x.textContent || ''))
        if (b) b.click()
      })
      await sleep(1500)
      continue
    }
    await page.evaluate(() => {
      const opt = document.querySelector('.story-choices button')
      if (opt) { opt.click(); return }
      document.querySelector('.story-dialog')?.click()
    })
    await sleep(1600)
  }
  // 循环退出后可能正好停在 NPC 登场的那一屏（最后一次点击才进去的），
  // 所以循环外再查一次 —— 否则 reachedNpc 会漏判
  if (!reachedNpc) {
    reachedNpc = await page.evaluate(() => Array.from(document.querySelectorAll('.story-chip'))
      .some((n) => /药老|魂殿|云岚宗/.test(n.textContent || '')))
  }
  check('推进到有 NPC 的场景', reachedNpc)

  const dbgArt = await page.evaluate(() => ({    chips: Array.from(document.querySelectorAll('.story-chip')).map((n) => n.textContent.trim()),
    choices: Array.from(document.querySelectorAll('.story-choices button')).map((n) => n.textContent.trim()),
    hasFigures: Boolean(document.querySelector('.story-stage-figures')),
    figureCount: document.querySelectorAll('.story-figure').length,
    battle: Boolean(document.querySelector('.story-battle')),
    sceneText: document.querySelector('.story-dialog p')?.textContent?.slice(0, 50) || '',
    artProbe: (() => {
      // 直接问管道：这个包有哪些立绘
      return Array.from(document.querySelectorAll('.story-stage img')).map((n) => n.getAttribute('src')?.slice(0, 50))
    })(),
  }))
  console.log('  dbg-art:', JSON.stringify(dbgArt))

  const artState = await page.evaluate(() => {
    const sec = document.querySelector('.story-stage')
    if (!sec) return { present: false }
    const figs = Array.from(sec.querySelectorAll('.story-figure'))
    return {
      present: true,
      figures: figs.map((f) => {
        const img = f.querySelector('img')
        return {
          cls: f.className,
          src: img?.getAttribute('src') || null,
          // naturalWidth > 0 才说明图片真的解码出来了（不是 404 也不是空 src）
          loaded: Boolean(img && img.complete && img.naturalWidth > 0),
          w: img?.naturalWidth || 0,
          h: img?.naturalHeight || 0,
        }
      }),
      chipFaces: Array.from(sec.querySelectorAll('.story-chip-face')).map((n) => ({
        loaded: Boolean(n.complete && n.naturalWidth > 0),
        w: n.naturalWidth || 0,
      })),
      speakerFace: (() => {
        const n = sec.querySelector('.story-speaker-face')
        return n ? { loaded: Boolean(n.complete && n.naturalWidth > 0), w: n.naturalWidth || 0 } : null
      })(),
      chips: Array.from(sec.querySelectorAll('.story-chip')).map((n) => n.textContent.trim()),
    }
  })
  check('推进到有立绘角色的场景', artState.present && artState.figures.length > 0,
    JSON.stringify(artState).slice(0, 200))
  if (artState.present && artState.figures.length) {
    check('立绘图真的加载出来了',
      artState.figures.every((f) => f.loaded),
      JSON.stringify(artState.figures))
    // 立绘必须来自包内的 art/ 目录。
    // 不能按文件名里的角色关键词判定 —— 阶段化立绘的文件名是
    // <角色>_<阶段>.png（hero_early / boss_early），跟旧的无阶段命名不一样。
    check('立绘来自包内素材',
      artState.figures.every((f) => /\/packs\/douma\/art\//.test(f.src || '')),
      JSON.stringify(artState.figures.map((f) => f.src)))
    check('角色牌里有头像', artState.chipFaces.length > 0, JSON.stringify(artState.chipFaces))
    check('头像真的加载出来了', artState.chipFaces.every((f) => f.loaded), JSON.stringify(artState.chipFaces))
  }

} catch (err) {
  failures += 1
  console.log(`  ✗ 脚本异常 — ${err?.message || err}`)
} finally {
  await browser.close()
}

console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ 全部通过'}\n`)
process.exit(failures ? 1 : 0)
