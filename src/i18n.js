// 双语模式（设置页切换）：界面交互文案中英对照，游戏内容（技能/属性/品质/精灵名）保留中文。
// 约定：t(zh, en) —— 英文模式且有英文文案时返回 en，否则回退 zh。
// 组件内用 useI18n() 拿到响应式的 t；模块级代码（事件流文案等）直接用裸 t()。
import { useSyncExternalStore } from 'react'

const KEY = 'gitmon:lang'

function read() {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh' } catch { return 'zh' }
}

let lang = read()
const subs = new Set()

export function getLang() { return lang }

export function setLang(next) {
  if ((next !== 'zh' && next !== 'en') || next === lang) return
  lang = next
  try { localStorage.setItem(KEY, next) } catch { /* 隐私模式忽略 */ }
  try { document.documentElement.lang = next === 'en' ? 'en' : 'zh-Hans' } catch { /* SSR 忽略 */ }
  subs.forEach((f) => f())
}

/** 裸翻译：读当前语言快照，适用于非组件模块（不触发重渲染） */
export function t(zh, en) {
  return lang === 'en' && en ? en : zh
}

function subscribe(f) {
  subs.add(f)
  return () => subs.delete(f)
}

/** 组件内接入：const { lang, setLang, t } = useI18n() */
export function useI18n() {
  const l = useSyncExternalStore(subscribe, getLang, getLang)
  return {
    lang: l,
    isEn: l === 'en',
    setLang,
    t: (zh, en) => (l === 'en' && en ? en : zh),
  }
}

// 首次加载同步 <html lang>
try { document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hans' } catch { /* ignore */ }
