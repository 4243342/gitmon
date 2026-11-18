import { useState } from 'react'
import { sfx } from '../sfx.js'
import { bgm } from '../bgm.js'
import {
  tts, getTtsConfig, setTtsEnabled, setTtsEngine, setTtsRate, setTtsVolume, setTtsAutoFirst,
} from '../tts.js'
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
  const [voiceCfg, setVoiceCfg] = useState(() => getTtsConfig())
  const [voiceMsg, setVoiceMsg] = useState('')

  // 每次改完重读模块里的配置，避免 UI 与 localStorage 两份状态打架
  const patchVoice = (apply) => {
    apply()
    setVoiceCfg(getTtsConfig())
  }

  const tryVoice = async (who) => {
    setVoiceMsg('')
    tts.unlock()
    try {
      await tts.preview(who)
      const left = tts.degraded
      if (left) {
        setVoiceMsg(t('在线音源不可用，这次用的是系统朗读', 'Online voice unavailable — played the system voice'))
      }
    } catch (err) {
      setVoiceMsg(err?.message || t('试听失败', 'Preview failed'))
    }
  }

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

          {tab === 'audio' && (
            <div className="set-block anim-rise">
              <h2 className="set-block-title">{t('语音朗读', 'Voice')} <em>TTS</em></h2>
              <Row
                label={t('台词朗读', 'Read lines aloud')}
                hint={t('剧情模式里逐句念出台词；关掉则只显示文字', 'Speak story lines one by one; off means text only')}
              >
                <Toggle
                  on={voiceCfg.enabled}
                  ariaLabel={t('语音朗读开关', 'Toggle voice')}
                  onClick={() => patchVoice(() => setTtsEnabled(!voiceCfg.enabled))}
                />
              </Row>
              <Row
                label={t('音源', 'Voice source')}
                hint={voiceCfg.engine === 'local'
                  ? t('本地模型（Kokoro 中文）：纯 CPU 离线合成，免 key 免联网，四个角色四个嗓子',
                    'Local model (Kokoro zh): offline CPU synthesis, no key, four distinct voices')
                  : voiceCfg.engine === 'cloud'
                    ? t('用已绑定模型端点的 /audio/speech 合成，音色最好，按字符计费',
                      'Synthesised by your bound endpoint (/audio/speech), best quality, billed per character')
                    : voiceCfg.engine === 'edge'
                      ? t('edge-tts：免 key，需要后端装了这个可选依赖', 'edge-tts: no key needed, requires the optional backend package')
                      : t('浏览器系统朗读：零成本兜底，各角色只有音高差异',
                        'Browser speech: free fallback, characters differ only by pitch')}
              >
                <div className="lb-seg">
                  {['local', 'cloud', 'edge', 'system'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={voiceCfg.engine === key ? 'active' : ''}
                      onClick={() => { sfx.tick(); patchVoice(() => setTtsEngine(key)) }}
                    >
                      {key === 'local' ? t('本地', 'Local')
                        : key === 'cloud' ? t('在线', 'Online')
                          : key === 'edge' ? 'edge' : t('系统', 'System')}
                    </button>
                  ))}
                </div>
              </Row>
              <Row
                label={t('进场自动念第一句', 'Speak the first line on entry')}
                hint={t('进入新一屏时自动开口；不想要就关掉，只在你点击时念',
                  'Start talking when a scene opens; turn off to speak only on click')}
              >
                <Toggle
                  on={voiceCfg.autoFirst}
                  ariaLabel={t('自动朗读开关', 'Toggle auto-speak')}
                  onClick={() => patchVoice(() => setTtsAutoFirst(!voiceCfg.autoFirst))}
                />
              </Row>
              <Row label={t('语速', 'Speed')} hint={`${voiceCfg.rate.toFixed(2)}×`}>
                <input
                  className="px-range"
                  type="range"
                  min="60"
                  max="160"
                  step="5"
                  value={Math.round(voiceCfg.rate * 100)}
                  style={{ '--fill': `${((voiceCfg.rate - 0.6) / 1.0) * 100}%` }}
                  onChange={(e) => patchVoice(() => setTtsRate(Number(e.target.value) / 100))}
                  aria-label={t('语音语速', 'Voice speed')}
                />
              </Row>
              <Row label={t('语音音量', 'Voice volume')} hint={`${Math.round(voiceCfg.volume * 100)}%（独立于音乐）`}>
                <input
                  className="px-range"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(voiceCfg.volume * 100)}
                  style={{ '--fill': `${voiceCfg.volume * 100}%` }}
                  onChange={(e) => patchVoice(() => setTtsVolume(Number(e.target.value) / 100))}
                  aria-label={t('语音音量', 'Voice volume')}
                />
              </Row>
              <div className="set-test">
                <span className="opt-hint">{t('试听：', 'Test:')}</span>
                {tts.roles.map((who) => (
                  <button key={who} className="mini-btn" onClick={() => tryVoice(who)}>
                    {who === 'narrator' ? t('旁白', 'Narrator')
                      : who === 'pet' ? t('主角', 'Hero')
                        : who === 'scout' ? t('引路人', 'Guide') : t('宿敌', 'Rival')}
                  </button>
                ))}
              </div>
              {voiceMsg && <p className="opt-hint">{voiceMsg}</p>}
              {voiceCfg.degraded && (
                <p className="set-note">
                  {voiceCfg.degraded === 'nomodel'
                    ? t('后端没找到本地语音模型，已在本次会话改用系统朗读。见 docs/TTS.md 的安装说明。',
                      'The backend could not find the local voice model — this session falls back to the system voice.')
                    : voiceCfg.degraded === 'unsupported'
                      ? t('当前模型端点没有 /audio/speech，已在本次会话改用系统朗读。',
                        'Your endpoint has no /audio/speech — this session falls back to the system voice.')
                      : voiceCfg.degraded === 'unstable'
                        ? t('在线语音连续失败，已在本次会话改用系统朗读。',
                          'Online voice kept failing — this session falls back to the system voice.')
                        : t('没有可用的模型密钥，已在本次会话改用系统朗读。',
                          'No model key available — this session falls back to the system voice.')}
                </p>
              )}
              <p className="set-note">
                {voiceCfg.engine === 'local'
                  ? t('台词只在本机合成，不出网也不落任何第三方；模型只在第一次用时加载。',
                    'Lines are synthesised on this machine — nothing leaves it. The model loads once.')
                  : t('台词文本会发送给你配置的语音服务；密钥只存在当前标签页内存里，不落盘。',
                    'Line text is sent to your configured voice service; the key stays in this tab’s memory.')}
              </p>
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
