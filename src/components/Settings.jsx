import { useState } from 'react'
import { sfx } from '../sfx.js'
import { bgm } from '../bgm.js'
import AdvancedPanel from './AdvancedPanel.jsx'

// 设置页：经典游戏 OPTIONS 菜单 —— 左侧分组标签，右侧行式选项
const TABS = [
  { key: 'audio', zh: '音频', en: 'SOUND' },
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
    if (!window.confirm('清空本地图鉴、设置与登录状态？此操作不可恢复。')) return
    try { localStorage.clear() } catch { /* 隐私模式忽略 */ }
    sfx.back()
    window.location.reload()
  }

  return (
    <section className="settings-page" aria-label="设置">
      <header className="set-page-head">
        <h1>设置</h1>
        <span className="set-page-sub">SETTINGS · OPTIONS</span>
      </header>

      <div className="set-page-body">
        <nav className="set-tabs" role="tablist" aria-label="设置分组">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`set-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => { sfx.tick(); setTab(t.key) }}
            >
              <b>{t.zh}</b>
              <i>{t.en}</i>
            </button>
          ))}
        </nav>

        <div className="set-panel" role="tabpanel">
          {tab === 'audio' && (
            <div className="set-block anim-rise">
              <h2 className="set-block-title">声音 <em>AUDIO</em></h2>
              <Row label="音效" hint="点击、扫描、出招与命中的 8-bit 音效">
                <Toggle
                  on={!muted}
                  ariaLabel="音效开关"
                  onClick={() => onMutedChange(sfx.setMuted(!muted))}
                />
              </Row>
              <Row label="背景音乐" hint="战斗中的芯片音乐与胜负小调">
                <Toggle
                  on={bgmOn}
                  ariaLabel="背景音乐开关"
                  onClick={() => { setBgmOn(!bgmOn); bgm.setMuted(bgmOn) }}
                />
              </Row>
              <Row label="音量" hint={`当前 ${vol}%（音效与音乐共用）`}>
                <input
                  className="px-range"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={vol}
                  style={{ '--fill': `${vol}%` }}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label="音量"
                />
                <span className="vol-num">{vol}</span>
              </Row>
              <div className="set-test">
                <span className="opt-hint">试听：</span>
                <button className="mini-btn" onClick={() => sfx.blip()}>点击</button>
                <button className="mini-btn" onClick={() => sfx.attack({ physical: true, element: 'normal', power: 95 })}>出招</button>
                <button className="mini-btn" onClick={() => sfx.hit({ crit: true, value: 60 })}>暴击</button>
              </div>
            </div>
          )}

          {tab === 'battle' && (
            <div className="set-block anim-rise">
              <h2 className="set-block-title">战斗 <em>BATTLE</em></h2>
              <Row label="战斗快进" hint="跳过出手演出快速结算；战斗中可按 F 随时切换">
                <Toggle on={fast} ariaLabel="战斗快进" onClick={toggleFast} />
              </Row>
              <p className="set-note">
                三种竞技场玩法：在线对手（输入对方仓库地址）、同类对战（拆同技术栈）、随机宠物。开战后双方自动出招。
              </p>
            </div>
          )}

          {tab === 'model' && (
            <div className="set-block anim-rise">
              <h2 className="set-block-title">模型 <em>MODEL · BYOK</em></h2>
              <p className="set-note">
                抽卡时给仓库做品质评测所用的模型。粘贴一枚 API Key 即自动识别厂商并拉取其模型列表供下拉选择；不配置则使用服务端默认通道。
              </p>
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
              <h2 className="set-block-title">关于 <em>ABOUT</em></h2>
              <Row label="版本" hint="GitMon · 仓库抽卡对战">
                <span className="about-val">v0.1.0</span>
              </Row>
              <Row label="我的图鉴" hint={authed ? '已登录 GitHub，卡箱云端同步' : '游客模式：数据仅存本机'}>
                <span className="about-val">{petCount} 只</span>
              </Row>
              <Row label="本地数据" hint="图鉴、设置、登录状态均保存在浏览器 localStorage">
                <button className="mini-btn danger" onClick={wipeData}>清空数据</button>
              </Row>
              <p className="set-note">
                精灵由真实仓库数据生成：品种=技术栈，品质=代码质量，等级=工程量。
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
