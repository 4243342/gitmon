// 剧情运行时：inkjs 执行离线路线，模型只负责填台词。
//
// 关键分工（docs/STORY.md §4.2-F/G）：
//   · 结构（场景 / 选项 / 变量 / 跳转 / 结局）来自 story.ink，发布前定稿
//   · 台词是 {say("key")} 占位符，进入场景时由调用方预取；取不到就用 lines.json 的 fallback
//
// 两遍渲染：
//   ① 先跑一遍只收集标签（# scene / # battle / # keys），拿到本屏需要哪些台词
//   ② 预取台词后 LoadJson 回滚到进入前，再跑一遍，用真台词渲染
// 这也是 inkjs 存档 / 回滚能力的直接复用（state.ToJson / LoadJson）。
import { Story } from 'inkjs'
import { STORY_JSON, CHARACTERS, LINES } from './story-data.js'

const MARK = '\u0001'
const KNOWN_VARS = ['chapter', 'chapter_count', 'trust', 'deaths', 'route', 'ending_id']

export { CHARACTERS, LINES }

export function speakerOf(key) {
  return String(key || '').split('.')[0] || 'narrator'
}

function parseTags(tags = []) {
  const meta = { scene: '', bg: '', cast: [], keys: [], battle: '', win: '', lose: '', ending: false, tags }
  for (const raw of tags) {
    const tag = String(raw || '').trim()
    const [head, ...rest] = tag.split(':')
    const value = rest.join(':').trim()
    switch (head.trim()) {
      case 'scene': meta.scene = value; break
      case 'bg': meta.bg = value; break
      case 'cast': meta.cast = value.split(',').map((s) => s.trim()).filter(Boolean); break
      case 'keys': meta.keys = value.split(',').map((s) => s.trim()).filter(Boolean); break
      case 'battle': meta.battle = value; break
      case 'win': meta.win = value; break
      case 'lose': meta.lose = value; break
      case 'ending': meta.ending = true; break
      default: break
    }
  }
  return meta
}

export class StoryRuntime {
  constructor({ vars = {}, texts = {} } = {}) {
    this.texts = { ...texts }
    this.battleGoto = null
    this.story = new Story(STORY_JSON)
    // lookaheadSafe=true：say 是纯查表，允许 ink 在预读阶段重复调用
    this.story.BindExternalFunction('say', (key) => this.render(key), true)
    for (const [name, value] of Object.entries(vars)) this.setVar(name, value)
  }

  render(key) {
    const text = this.texts[key] || LINES[key] || '……'
    return `${MARK}${key}${MARK}${text}`
  }

  setTexts(map) {
    if (!map || typeof map !== 'object') return
    for (const [key, value] of Object.entries(map)) {
      if (typeof value === 'string' && value.trim()) this.texts[key] = value.trim()
    }
  }

  get vars() {
    const out = {}
    for (const name of KNOWN_VARS) out[name] = this.story.variablesState[name]
    return out
  }

  setVar(name, value) {
    if (!KNOWN_VARS.includes(name)) return
    this.story.variablesState[name] = value
  }

  snapshot() {
    return this.story.state.ToJson()
  }

  restore(json) {
    if (typeof json === 'string' && json) this.story.state.LoadJson(json)
  }

  get canContinue() {
    return this.story.canContinue
  }

  get choices() {
    return this.story.currentChoices.map((choice, index) => ({
      index,
      text: choice.text,
      // ink 原生支持选项条件：不可选的选项不会出现在 currentChoices 里
      tags: choice.tags || [],
    }))
  }

  choose(index) {
    const list = this.story.currentChoices
    if (!list.length) throw new Error('当前没有可选项')
    const safe = Math.max(0, Math.min(list.length - 1, Number(index) || 0))
    this.story.ChooseChoiceIndex(safe)
  }

  // 跑到「需要玩家决策」或「战斗 / 结局」为止
  drain({ collect = true } = {}) {
    const tags = []
    const lines = []
    for (let guard = 0; guard < 400; guard += 1) {
      if (!this.story.canContinue) break
      const raw = this.story.Continue()
      const currentTags = this.story.currentTags || []
      tags.push(...currentTags)
      if (currentTags.some((tag) => String(tag).trim().startsWith('battle:'))) break
      if (collect) {
        const text = String(raw || '')
        const match = text.match(/^\u0001([^\u0001]+)\u0001([\s\S]*)$/)
        if (match) {
          const body = match[2].trim()
          if (body) lines.push({ key: match[1], who: speakerOf(match[1]), text: body })
        } else if (text.trim()) {
          lines.push({ key: '', who: 'narrator', text: text.trim() })
        }
      }
      if (this.story.currentChoices.length) break
      if (!this.story.canContinue) break
    }
    return { tags, lines }
  }

  /**
   * 进入下一屏。
   * @param {object} opts
   * @param {(ctx:{sceneId:string, keys:string[], vars:object, meta:object}) => Promise<{texts:object, source?:string}|void>} [opts.fetchTexts]
   */
  async enter({ fetchTexts } = {}) {
    const before = this.snapshot()

    // 先按 fallback 跑一遍，拿到本屏的结构与台词 key
    const real = this.drain({ collect: true })
    const view = parseTags(real.tags)
    const atChoice = this.story.currentChoices.length > 0

    // 台词只替换展示文本，不碰 ink 状态（结构早已定稿，模型改不了路线）
    let textSource = 'fallback'
    if (view.keys.length && typeof fetchTexts === 'function') {
      try {
        const got = await fetchTexts({ sceneId: view.scene, keys: view.keys, vars: this.vars, meta: view })
        if (got && typeof got === 'object') {
          this.setTexts(got.texts)
          for (const line of real.lines) {
            const fresh = this.texts[line.key]
            if (fresh) line.text = fresh
          }
          textSource = got.source === 'llm' ? 'llm' : 'fallback'
        }
      } catch {
        // 模型超时 / 断网：整屏退回 fallback，不让玩家等
        textSource = 'fallback'
      }
    }

    // 战斗屏：记住 win / lose 指向的 knot，打完由运行时选择落点
    if (view.battle) this.battleGoto = { win: view.win, lose: view.lose }

    return {
      sceneId: view.scene,
      bg: view.bg || 'dawn',
      cast: view.cast,
      lines: real.lines,
      choices: this.choices,
      battle: view.battle,
      ending: view.ending,
      ended: !view.battle && (view.ending || (!atChoice && !this.story.canContinue)),
      endingId: String(this.vars.ending_id || ''),
      vars: this.vars,
      textSource,
      // 本屏开始前的 ink 快照：存档 / 回滚都从这里恢复，才能重新渲染同一屏
      stateIn: before,
    }
  }

  /** 战斗结束：按离线写好的 win / lose 分支跳转并继续。 */
  async resumeFromBattle(win, { fetchTexts } = {}) {
    const goto = this.battleGoto || {}
    this.battleGoto = null
    const target = win ? goto.win : goto.lose
    if (target) this.story.ChoosePathString(target)
    return this.enter({ fetchTexts })
  }
}

export function createStoryRuntime(options) {
  return new StoryRuntime(options)
}
