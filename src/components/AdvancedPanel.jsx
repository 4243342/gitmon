import { useState } from 'react'
import '../advanced.css'

// 高级模式（BYOK）：只粘贴一枚密钥，后端自动识别厂商 / 接口 / 模型。
// 自定义端点只作为自托管模型（Ollama / vLLM / 未收录厂商）的折叠兜底。
export default function AdvancedPanel({
  config, onConfigChange, hint, onHintChange, onClearKey, busy,
  bindState = 'idle', bindError = '', onBind,
}) {
  const [showCustom, setShowCustom] = useState(false)
  const set = (patch) => onConfigChange?.({ ...config, ...patch })
  const onKeyChange = (apiKey) => onConfigChange?.({ ...config, apiKey, binding: null })
  const setCustom = (patch) => onConfigChange?.({
    ...config,
    custom: { baseUrl: '', label: '', model: '', ...(config.custom || {}), ...patch },
    binding: null,
  })

  const binding = config.binding
  const bound = bindState === 'bound' && binding
  const keyReady = !!config.apiKey?.trim()

  return (
    <section className="llm-panel" aria-label="高级模式：模型评测配置">
      <header className="llm-head">
        <span className="llm-badge">BYOK</span>
        <div className="llm-head-text">
          <strong>只填密钥 · 模型全权评测</strong>
          <span>自动识别厂商与模型；品质、六维、根基、词条、技能、等级、属性全部由模型给出，本地不跑规则引擎</span>
        </div>
      </header>

      <div className="llm-bind-row">
        <label className="llm-key-field">
          <span>API Key（裸密钥 / 厂商=密钥 / .env 片段都行）</span>
          <input
            type="password"
            value={config.apiKey || ''}
            onChange={(e) => onKeyChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && keyReady && !busy) onBind?.() }}
            placeholder="sk-…  粘贴后自动识别，不用填地址和模型"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="llm-bind-btn"
          onClick={() => onBind?.()}
          disabled={!keyReady || busy || bindState === 'binding'}
        >
          {bindState === 'binding' ? '识别中…' : bound ? '重新识别' : '自动绑定'}
        </button>
      </div>

      {bindState === 'binding' && (
        <p className="llm-bind-status busy">正在拿这枚密钥试拉各厂商的模型列表，找出它属于哪家…</p>
      )}
      {bindState === 'error' && (
        <p className="llm-bind-status error">! {bindError || '自动绑定失败'}</p>
      )}
      {bound && (
        <div className="llm-bound">
          <span className="llm-bound-dot" />
          <strong>{binding.label || binding.provider}</strong>
          <code>{binding.model}</code>
          <span className="llm-bound-url" title={binding.baseUrl}>{binding.baseUrl}</span>
          <span className="llm-bound-ok">{binding.verified ? '已验证' : '手动指定'}</span>
        </div>
      )}
      {!bound && bindState !== 'error' && bindState !== 'binding' && (
        <p className="llm-bind-status">还没绑定密钥。绑定后卡片会盖上这枚模型专属的全息钢印。</p>
      )}

      <details className="llm-custom" open={showCustom} onToggle={(e) => setShowCustom(e.currentTarget.open)}>
        <summary>自定义端点（自托管 / 未收录厂商，可选）</summary>
        <div className="llm-custom-fields">
          <label>
            <span>Base URL</span>
            <input
              value={config.custom?.baseUrl || ''}
              onChange={(e) => setCustom({ baseUrl: e.target.value })}
              placeholder="http://127.0.0.1:11434/v1"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          <label>
            <span>显示名称</span>
            <input
              value={config.custom?.label || ''}
              onChange={(e) => setCustom({ label: e.target.value })}
              placeholder="本地 Ollama"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          <label>
            <span>模型名（填了可跳过 /models 探测）</span>
            <input
              value={config.custom?.model || ''}
              onChange={(e) => setCustom({ model: e.target.value })}
              placeholder="qwen2.5:7b"
              spellCheck={false}
              disabled={busy}
            />
          </label>
        </div>
      </details>

      <label className="llm-hint-field">
        <span>补充说明 / 额外要求（可选）</span>
        <textarea
          value={hint}
          onChange={(e) => onHintChange?.(e.target.value)}
          placeholder="例如：按 2024 年的状态评、这是一个内部工具、把等级压低一点…"
          rows={2}
          disabled={busy}
        />
      </label>

      <footer className="llm-foot">
        <span>
          密钥只活在本标签页和一次请求里，服务端转发即丢弃、不落盘；自动识别 = 拿密钥去各官方 /models 试开一次。
          结果标注「AI 推测」，不消耗 GitHub / Gitee 配额。
        </span>
        {keyReady && (
          <button type="button" className="llm-clear" onClick={onClearKey} disabled={busy}>清除密钥</button>
        )}
      </footer>
      <p className="llm-anchor">
        等级校准已写进提示词：Dify ≈ Lv.120、Odoo ≈ Lv.150，等级看代码体量而非 star 数；普通项目不超过 Lv.160。
      </p>
    </section>
  )
}
