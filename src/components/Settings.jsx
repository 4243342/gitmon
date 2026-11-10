import { useState } from 'react'
import { sfx } from '../sfx.js'
import { bgm } from '../bgm.js'
import { useI18n } from '../i18n.js'
import AdvancedPanel from './AdvancedPanel.jsx'

// 设置页：经典游戏 OPTIONS 菜单 —— 左侧分组标签，右侧行式选项
const TABS = [
  { key: 'audio', zh: '音频', en: 'SOUND' },
  { key: 'lang', zh: '语言', en: 'LANG' },
  { key: 'battle', zh: '战斗', en: 'BATTLE' },
  { key: 'model', zh: '模型', en: 'MODEL' },
  { key: 'about', zh: '关于', en: 'ABOUT' },
]

function Row({ label, hint, children }) {
  return (
    <div className="opt-row">
      <div className="opt-text">
        <span className="opt-label">{label}</span>
        {hint && <i className="opt-hint">{hint}</i>}
      </div>
      <div className="opt-ctrl">{children}</div>
    </div>
  )
}

function Toggle({ on, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      className={`set-toggle ${on ? 'on' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={on}
    >
      {on ? 'ON' : 'OFF'}
    </button>
  )
}

function readFast() {
  try { return localStorage.getItem('gitmon:battle:fast') === '1' } catch { return false }
}

export default function Settings({
  muted, onMutedChange,
  llmConfig, onLLMConfigChange, llmHint, onLLMHintChange, onClearLLMKey,
  aiBusy, bindState, bindError, onBind,
  petCount = 0, authed = false,
}) {
  const [tab, setTab] = useState('audio')
  const [bgmOn, setBgmOn] = useState(() => !bgm.muted)
  const [vol, setVol] = useState(() => Math.round(sfx.volume * 100))
  const [fast, setFast] = useState(readFast)
  const { t, lang, setLang } = useI18n()

  const changeVolume = (v) => {
    setVol(v)
    sfx.volume = v / 100
    bgm.setVolume(v / 100)
  }

  const toggleFast = () => {
    const next = !fast
    setFast(next)
    try { localStorage.setItem('gitmon:battle:fast', next ? '1' : '0') } catch { /* 隐私模式忽略 */ }
    window.dispatchEvent(new Event('gitmon:fast-change'))
  }

  const wipeData = () => {
    if (!window.confirm(t('清空本地图鉴、设置与登录状态？此操作不可恢复。', 'Erase local Dex, settings and login? This cannot be undone.'))) return
    try { localStorage.clear() } catch { /* 隐私模式忽略 */ }
    sfx.back()
    window.location.reload()
  }

  return (
    <section className="settings-page" aria-label={t('设置', 'Settings')}>
      <header className="set-page-head">
        <h1>{t('设置', 'Settings')}</h1>
        <span className="set-page-sub">SETTINGS · OPTIONS</span>
      </header>

      <div className="set-page-body">
        <nav className="set-tabs" role="tablist" aria-label={t('设置分组', 'Settings sections')}>
          {TABS.map((tb) => (
            <button
              key={tb.key}
              type="button"
              role="tab"
              aria-selected={tab === tb.key}
              aria-label={t(tb.zh, tb.en)}
              className={`set-tab ${tab === tb.key ? 'active' : ''}`}
              onClick={() => { sfx.tick(); setTab(tb.key) }}
            >
              <b>{lang === 'en' ? tb.en : tb.zh}</b>
              <i>{lang === 'en' ? tb.zh : tb.en}</i>
            </button>
          ))}
        </nav>

        <div className="set-panel" role="tabpanel">
          {tab === 'audio' && (
            <div className="set-block anim-rise">
              <h2 className="set-block-title">{t('声音', 'Sound')} <em>AUDIO</em></h2>
              <Row label={t('音效', 'SFX')} hint={t('点击、扫描、出招与命中的 8-bit 音效', '8-bit blips for clicks, scans, attacks & hits')}>
                <Toggle
                  on={!muted}
                  ariaLabel={t('音效开关', 'Toggle SFX')}
                  onClick={() => onMutedChange(sfx.setMuted(!muted))}
                />
              </Row>
              <Row label={t('背景音乐', 'Music')} hint={t('战斗中的芯片音乐与胜负小调', 'Chiptune battles & victory tunes')}>
                <Toggle
                  on={bgmOn}
                  ariaLabel={t('背景音乐开关', 'Toggle music')}
                  onClick={() => { setBgmOn(!bgmOn); bgm.setMuted(bgmOn) }}
                />
              </Row>
              <Row label={t('音量', 'Volume')} hint={t(`当前 ${vol}%（音效与音乐共用）`, `Now ${vol}% (shared by SFX & music)`)}>
                <input
                  className="px-range"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={vol}
                  style={{ '--fill': `${vol}%` }}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label={t('音量', 'Volume')}
                />
                <span className="vol-num">{vol}</span>
              </Row>
              <div className="set-test">
                <span className="opt-hint">{t('试听：', 'Test:')}</span>
                <button className="mini-btn" onClick={() => sfx.blip()}>{t('点击', 'Click')}</button>
                <button className="mini-btn" onClick={() => sfx.attack({ physical: true, element: 'normal', power: 95 })}>{t('出招', 'Attack')}</button>
                <button className="mini-btn" onClick={() => sfx.hit({ crit: true, value: 60 })}>{t('暴击', 'Crit')}</button>
              </div>
            </div>
          )}

          {tab === 'lang' && (
            <div className="set-block anim-rise">
              <h2 className="set-block-title">{t('语言', 'Language')} <em>LANGUAGE</em></h2>
              <Row label={t('界面语言', 'Interface language')} hint={t('切换全部界面文案的显示语言', 'Language used across the whole UI')}>
                <div className="lb-seg">
                  <button
                    type="button"
                    className={lang === 'zh' ? 'active' : ''}
                    onClick={() => { sfx.tick(); setLang('zh') }}
                  >
                    中文
                  </button>
                  <button
                    type="button"
                    className={lang === 'en' ? 'active' : ''}
                    onClick={() => { sfx.tick(); setLang('en') }}
                  >
                    English
                  </button>
                </div>
              </Row>
              <p className="set-note">
                {t('技能名、属性、品质、种族等游戏内容保持中文；模型生成的评测文案随模型语言。',
                   'Game content (skills, elements, qualities, species) stays in Chinese; model-written reviews follow the model.')}
              </p>
            </div>
          )}

          {tab === 'battle' && (
            <div className="set-block anim-rise">
              <h2 className="set-block-title">{t('战斗', 'Battle')} <em>BATTLE</em></h2>
              <Row label={t('战斗快进', 'Fast battles')} hint={t('跳过出手演出快速结算；战斗中可按 F 随时切换', 'Skip attack animations; press F mid-battle to toggle')}>
                <Toggle on={fast} ariaLabel={t('战斗快进', 'Fast battles')} onClick={toggleFast} />
              </Row>
              <p className="set-note">
                {t('三种竞技场玩法：在线对手（输入对方仓库地址）、同类对战（拆同技术栈）、随机宠物。开战后双方自动出招。',
                   'Three arena modes: online rival (enter their repo), same-stack battle, random pets. Both sides attack automatically.')}
              </p>
            </div>
          )}

          {tab === 'model' && (
            <div className="set-block anim-rise">
              <h2 className="set-block-title">{t('模型', 'Model')} <em>MODEL · BYOK</em></h2>
              <p className="set-note">
                {t('抽卡时给仓库做品质评测所用的模型。粘贴一枚 API Key 即自动识别厂商并拉取其模型列表供下拉选择；不配置则使用服务端默认通道。',
                   'Model used to rate repos when drawing cards. Paste an API Key to auto-detect the vendor and load its model list; leave unconfigured to use the server default.')}
              </p>
              {/* 深度审计作为独立设置项（默认开），不藏在 BYOK 面板里 */}
              <Row
                label={t('深度审计（2–5 分钟）', 'Deep Audit (2–5 min)')}
                hint={t('真实扫仓 · 里程碑弹幕 · 等级进化演出；关闭则退回即时推测', 'Real repo scan · milestone barrage · level-up evolution; off falls back to instant guesses')}
              >
                <Toggle
                  on={llmConfig.deepAudit !== false}
                  ariaLabel={t('深度审计开关', 'Toggle deep audit')}
                  onClick={() => onLLMConfigChange({ ...llmConfig, deepAudit: llmConfig.deepAudit === false })}
                />
              </Row>
              <AdvancedPanel
                config={llmConfig}
                onConfigChange={onLLMConfigChange}
                hint={llmHint}
                onHintChange={onLLMHintChange}
                onClearKey={onClearLLMKey}
                busy={aiBusy}
                bindState={bindState}
                bindError={bindError}
                onBind={onBind}
              />
            </div>
          )}

          {tab === 'about' && (
            <div className="set-block anim-rise">
              <h2 className="set-block-title">{t('关于', 'About')} <em>ABOUT</em></h2>
              <Row label={t('版本', 'Version')} hint={t('GitMon · 仓库抽卡对战', 'GitMon · repo gacha battles')}>
                <span className="about-val">v0.1.0</span>
              </Row>
              <Row label={t('我的图鉴', 'My Dex')} hint={authed ? t('已登录 GitHub，卡箱云端同步', 'GitHub signed in; box synced to cloud') : t('游客模式：数据仅存本机', 'Guest mode: data stored locally only')}>
                <span className="about-val">{t(`${petCount} 只`, `${petCount} pets`)}</span>
              </Row>
              <Row label={t('本地数据', 'Local data')} hint={t('图鉴、设置、登录状态均保存在浏览器 localStorage', 'Dex, settings and login live in browser localStorage')}>
                <button className="mini-btn danger" onClick={wipeData}>{t('清空数据', 'Erase data')}</button>
              </Row>
              <p className="set-note">
                {t('精灵由真实仓库数据生成：品种=技术栈，品质=代码质量，等级=工程量。',
                   'Pets are generated from real repo data: species = stack, quality = code quality, level = scale.')}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
