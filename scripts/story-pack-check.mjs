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
          script_title: '《斗破苍穹：torvalds/linux宗》',
          script_brief: 'demo/pet 三年前被逐出宗门名册',
          script_beats: ['开局：名字被划掉。', '中段：药老留下半卷功法。', '收束：山门拦路。'],
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
          script_title: '《斗破苍穹：torvalds/linux宗》',
          script_brief: 'demo/pet 三年前被逐出宗门名册',
          script_beats: ['开局：名字被划掉。', '中段：药老留下半卷功法。', '收束：山门拦路。'],
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
          script_title: '《斗破苍穹：torvalds/linux宗》',
          script_brief: 'demo/pet 三年前被逐出宗门名册',
          script_beats: ['开局：名字被划掉。', '中段：药老留下半卷功法。', '收束：山门拦路。'],
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

  // 登录门槛：游客态可能已经存在（后端认得这个设备），两种情况都要能往下走
  const guest = await page.evaluate(() => {
    const g = Array.from(document.querySelectorAll('button')).find((b) => /游客进入/.test(b.textContent || ''))
    if (g) { g.click(); return 'clicked' }
    return 'already'
  })
  check('通过登录门槛', Boolean(guest), guest)
  // 登录是异步的（要打后端）：轮询等「进入剧情模式」按钮出现
  let found = false
  for (let i = 0; i < 30; i += 1) {
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
  check('出了三张方案卡', cards.length === 3, String(cards.length))
  check('方案卡带包铭牌', cards.some((c) => c.pack.includes('斗码苍穹')), JSON.stringify(cards.map((c) => c.pack)))
  check('方案是玄幻语汇', cards.some((c) => /宗门|魂殿|山门|斗破/.test(c.title)), JSON.stringify(cards.map((c) => c.title)))

  console.log('\n[pack] 建线后正片跑的是同一个包')
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /建线|出发/.test(b.textContent || ''))
    if (btn) btn.click()
  })
  await sleep(3000)

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
  check('进入正片舞台', Boolean(stage), '没找到 .story-stage')
  if (stage) {
    check('背景是包内的（山门之外）', stage.place.includes('山门之外'), stage.place)
    check('角色是包内的（药老 / 主角）',
      stage.chips.some((c) => c.includes('药老')) || stage.chips.includes('主角'),
      stage.chips.join(','))
    check('正片文本是玄幻语汇', /宗门|山门|斗气|功法|云岚|魂殿|名册/.test(stage.text), stage.text.slice(0, 60))
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
    /宗门|山门|斗气|功法|云岚|魂殿|名册/.test(afterReload.text),
    afterReload.text.slice(0, 60))

  check('页面没有 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (err) {
  failures += 1
  console.log(`  ✗ 脚本异常 — ${err?.message || err}`)
} finally {
  await browser.close()
}

console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ 全部通过'}\n`)
process.exit(failures ? 1 : 0)
