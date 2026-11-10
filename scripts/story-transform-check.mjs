// 变身过场浏览器端验证：node scripts/story-transform-check.mjs
//
// 验证的是「四段过场真的按顺序演了」，不是截个图好看：
//   1. 建线后先进开章解说屏
//   2. 点掉开章 → 进入过场屏（不是正片舞台）
//   3. 过场里有卡片 / 光团 / 人形态三个元素，素材 URL 真的能取到
//   4. 卡片先亮 → 光团亮 → 人形态亮（按时间点采样）
//   5. 画面确实变暗过（压暗层 opacity 到过 1）
//   6. 动画播完自动进序章
//
// 不依赖模型与 GitHub：选对手阶段用请求拦截 mock 掉。
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
    traits: [{ key: 'upstream', kind: 'positive', name: '上游垄断', desc: '整条链路都吃它。', reason: '内核生态位' }],
    quality_dims: { tests: 90, engineering: 95, docs: 70, maintenance: 88, community: 92 },
    sprite_seed: 4242,
  },
}

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

const state = { started: false }
await page.setRequestInterception(true)
page.on('request', (req) => {
  const url = req.url()
  const method = req.method()
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
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ texts: {}, source: 'fallback' }) })
    return
  }
  if (method === 'POST' && /\/api\/story\/progress$/.test(url)) {
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
          script_source: 'system',
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
    if (!state.started) {
      req.respond({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ run: null, saves: [], latest: null }),
      })
      return
    }
    req.respond({
      status: 200, contentType: 'application/json',
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
          script_source: 'system',
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
          script_source: 'system',
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

// 采样器：在过场屏存在期间，持续记录三个元素与压暗层的 opacity
const startSampling = () => page.evaluate(() => {
  window.__tfSamples = []
  window.__tfTimer = setInterval(() => {
    const root = document.querySelector('.story-tf')
    if (!root) return
    const op = (sel) => {
      const el = root.querySelector(sel)
      if (!el) return -1
      return Math.round(Number(getComputedStyle(el).opacity) * 100) / 100
    }
    window.__tfSamples.push({
      card: op('.story-tf-card'),
      orb: op('.story-tf-orb'),
      hero: op('.story-tf-hero'),
      dark: op('.story-tf-dark'),
      phase: root.className,
    })
  }, 90)
})
const stopSampling = () => page.evaluate(() => {
  clearInterval(window.__tfTimer)
  return window.__tfSamples || []
})

try {
  console.log('\n[tf] 进入剧情模式')
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
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

  const guest = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const g = btns.find((b) => /游客进入/.test(b.textContent || ''))
    if (g) { g.click(); return 'guest' }
    const d = btns.find((b) => /直接进入/.test(b.textContent || ''))
    if (d) { d.click(); return 'device' }
    return 'already'
  })
  check('通过登录门槛', Boolean(guest), guest)
  let found = false
  for (let i = 0; i < 60; i += 1) {
    await sleep(500)
    found = await page.evaluate(() => Array.from(document.querySelectorAll('button, [role="button"], a'))
      .some((n) => /进入剧情模式/.test(n.textContent || '')))
    if (found) break
  }
  check('登录完成进入大厅', found)
  await sleep(500)

  await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('button, [role="button"], a'))
      .find((n) => /进入剧情模式/.test(n.textContent || ''))
    if (hit) hit.click()
  })
  await sleep(2000)
  await page.evaluate(() => document.querySelector('.story-cast-card')?.click())
  await sleep(2500)
  await page.evaluate(() => document.querySelector('.story-boss')?.click())
  await sleep(1200)
  await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('button')).find((n) => /就选它/.test(n.textContent || ''))
    if (hit && !hit.disabled) hit.click()
  })
  await sleep(2200)

  // 选斗码苍穹 + 建线
  await page.evaluate(() => {
    const src = Array.from(document.querySelectorAll('.story-src')).find((n) => /系统剧本/.test(n.textContent || ''))
    if (src) src.click()
  })
  await sleep(2200)
  await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('.story-pack')).find((n) => n.textContent.includes('斗码苍穹'))
    if (hit) hit.click()
  })
  await sleep(2200)
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /建线|出发/.test(b.textContent || ''))
    if (btn) btn.click()
  })
  await sleep(2500)

  console.log('\n[tf] 开章解说屏')
  const opening = await page.evaluate(() => ({
    present: Boolean(document.querySelector('.story-opening')),
    hasTf: Boolean(document.querySelector('.story-tf')),
  }))
  check('建线后先进开章解说屏', opening.present && !opening.hasTf, JSON.stringify(opening))

  // 点掉开章 → 应该进过场屏
  console.log('\n[tf] 开章之后进过场屏')
  await startSampling()
  await page.evaluate(() => document.querySelector('.story-opening')?.click())
  await sleep(600)

  const tfPresent = await page.evaluate(() => ({
    present: Boolean(document.querySelector('.story-tf')),
    hasStage: Boolean(document.querySelector('.story-stage')),
    phase: document.querySelector('.story-tf')?.className || '',
  }))
  check('进的是过场屏（不是正片舞台）', tfPresent.present && !tfPresent.hasStage, JSON.stringify(tfPresent))

  if (tfPresent.present) {
    console.log('\n[tf] 过场素材')
    const assets = await page.evaluate(() => {
      const root = document.querySelector('.story-tf')
      const card = root.querySelector('.story-tf-card')
      const orb = root.querySelector('.story-tf-orb')
      const hero = root.querySelector('.story-tf-hero')
      const dark = root.querySelector('.story-tf-dark')
      const flash = root.querySelector('.story-tf-flash')
      return {
        cardHas: Boolean(card && card.children.length),
        orbSrc: orb?.getAttribute('src') || '',
        heroSrc: hero?.getAttribute('src') || '',
        hasDark: Boolean(dark),
        hasFlash: Boolean(flash),
        caption: root.querySelector('.story-tf-caption')?.textContent || '',
      }
    })
    check('卡片形象在（玩家自己的精灵）', assets.cardHas, JSON.stringify(assets))
    check('光团素材在', /orb-cyan\.gif$/.test(assets.orbSrc), assets.orbSrc)
    check('人形态立绘在', /hero_early\.png$/.test(assets.heroSrc), assets.heroSrc)
    check('压暗层在', assets.hasDark, JSON.stringify(assets))
    check('白闪层在', assets.hasFlash, JSON.stringify(assets))
    check('过场有字幕', assets.caption.length > 0, assets.caption)

    // 过场要盖住整个视口：「画面变暗」压的是整个画面，不是一小块。
    // （这里曾经踩过两个坑：根元素类名和子元素类名撞车，
    //   以及 fixed 被父容器的 CSS 上下文限制 —— 都会让过场缩成一小块）
    const layout = await page.evaluate(() => {
      const el = document.querySelector('.story-tf')
      if (!el) return null
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        position: cs.position,
        parentTag: el.parentElement?.tagName,
        rect: { w: Math.round(r.width), h: Math.round(r.height) },
        viewport: { w: window.innerWidth, h: window.innerHeight },
      }
    })
    check('过场铺满视口',
      layout && layout.rect.w >= layout.viewport.w - 2 && layout.rect.h >= layout.viewport.h - 2,
      JSON.stringify(layout))
    check('过场是 fixed 定位（不受父容器 CSS 上下文影响）',
      layout?.position === 'fixed', layout?.position)
    check('过场挂在 body 下（portal）', layout?.parentTag === 'BODY', layout?.parentTag)
    // 类名不能和子元素撞：story-tf-card 撞上会把根元素压成 absolute
    const cls = await page.evaluate(() => document.querySelector('.story-tf')?.className || '')
    check('根元素类名不与子元素冲突',
      !/\bstory-tf-(card|orb|hero|dark|flash|stage|caption|hint)\b/.test(cls),
      cls)
    // 层序：人形态要在压暗层之上，否则「黑暗里亮出人形」永远看不见
    const zOrder = await page.evaluate(() => {
      const root = document.querySelector('.story-tf')
      const z = (sel) => Number(getComputedStyle(root.querySelector(sel)).zIndex || 0)
      return { dark: z('.story-tf-dark'), stage: z('.story-tf-stage'), flash: z('.story-tf-flash') }
    })
    check('人形态在压暗层之上（黑暗里亮出来）',
      zOrder.stage > zOrder.dark, JSON.stringify(zOrder))
    check('白闪在所有元素之上', zOrder.flash > zOrder.stage, JSON.stringify(zOrder))

    // 素材真的能取到（不是 404 的空地址）
    const fetchOk = await page.evaluate(async () => {
      const root = document.querySelector('.story-tf')
      const urls = Array.from(root.querySelectorAll('img')).map((n) => n.getAttribute('src')).filter(Boolean)
      const out = []
      for (const u of urls) {
        const r = await fetch(u).catch(() => null)
        out.push({ url: u.split('/').pop(), ok: Boolean(r && r.ok), status: r?.status || 0 })
      }
      return out
    })
    check('过场素材都能取到', fetchOk.every((f) => f.ok), JSON.stringify(fetchOk))

    console.log('\n[tf] 四段顺序')
    // 让动画自然播完（约 7 秒）
    await sleep(7500)
    const samples = await stopSampling()
    check('采样到了动画帧', samples.length > 10, `${samples.length} 帧`)

    const everCard = samples.some((s) => s.card > 0.3)
    const everOrb = samples.some((s) => s.orb > 0.3)
    const everHero = samples.some((s) => s.hero > 0.3)
    const everDark = samples.some((s) => s.dark > 0.5)
    check('① 卡片出现过', everCard, `max=${Math.max(...samples.map((s) => s.card))}`)
    check('② 光团出现过', everOrb, `max=${Math.max(...samples.map((s) => s.orb))}`)
    check('③ 画面变暗过', everDark, `max=${Math.max(...samples.map((s) => s.dark))}`)
    check('④ 人形态出现过', everHero, `max=${Math.max(...samples.map((s) => s.hero))}`)

    // 顺序：卡片先于光团，光团先于人形态
    const firstCard = samples.findIndex((s) => s.card > 0.3)
    const firstOrb = samples.findIndex((s) => s.orb > 0.3)
    const firstHero = samples.findIndex((s) => s.hero > 0.3)
    check('顺序：卡片 → 光团', firstCard >= 0 && firstOrb > firstCard, `${firstCard} → ${firstOrb}`)
    check('顺序：光团 → 人形态', firstHero > firstOrb, `${firstOrb} → ${firstHero}`)

    // 变暗发生在人形态之前（意识断了才醒来）
    const firstDark = samples.findIndex((s) => s.dark > 0.5)
    check('顺序：变暗 → 醒来', firstDark >= 0 && firstDark < firstHero, `${firstDark} → ${firstHero}`)
  }

  console.log('\n[tf] 动画播完自动进正片')
  await sleep(2500)
  const after = await page.evaluate(() => ({
    tf: Boolean(document.querySelector('.story-tf')),
    stage: Boolean(document.querySelector('.story-stage')),
    place: document.querySelector('.story-stage-place')?.textContent || '',
    text: document.querySelector('.story-dialog p')?.textContent || '',
  }))
  check('过场结束，正片出现', after.stage && !after.tf, JSON.stringify(after).slice(0, 160))
  check('正片是序章（山门之外）', after.place.includes('山门之外'), after.place)
  check('正片讲的是三年之约', /三年|约期|名碑|除名通知/.test(after.text), after.text.slice(0, 60))

  console.log('\n[tf] 台词来源标记')
  const src = await page.evaluate(() => document.querySelector('.story-source-note')?.textContent || '')
  check('系统剧本标「剧本定稿」', src.includes('剧本定稿'), src || '（没有标记）')

  console.log('\n[tf] 控制台')
  const realErrors = errors.filter((e) => !/favicon|net::ERR_ABORTED|Failed to load resource/i.test(e))
  check('没有 JS 报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
} catch (err) {
  failures += 1
  console.log(`  ✗ 脚本异常：${err.message}`)
  if (process.env.GITMON_TF_DEBUG) console.log(err.stack)
} finally {
  await browser.close()
}

console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ 全部通过'}\n`)
process.exit(failures ? 1 : 0)
