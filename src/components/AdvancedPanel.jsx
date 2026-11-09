import { useEffect, useRef, useState } from 'react'
import '../advanced.css'

// 高级模式（BYOK）：全程只填一枚密钥，后端自动识别厂商 / 模型，无需点任何按钮。
// 自定义端点与补充说明只在「更多选项」里，默认只显示一个密钥框。
export default function AdvancedPanel({
  config, onConfigChange, hint, onHintChange, onClearKey, busy,
  bindState = 'idle', bindError = '', gate = null, pingTesting = false, onBind, onClose,
  deepAudit = true, onDeepAuditChange,
}) {
  const [showCustom, setShowCustom] = useState(false)
  const onKeyChange = (apiKey) => onConfigChange?.({ ...config, apiKey, binding: null })

  const binding = config.binding
  const bound = bindState === 'bound' && binding
  const keyReady = !!config.apiKey?.trim()
  // 厂商识别时带回的 /models 列表（去重 + 当前模型必在列），供用户换模型
  const modelOptions = binding?.models?.length
    ? [...new Set([binding.model, ...binding.models])].filter(Boolean)
    : []

  // 输入密钥后自动识别厂商 / 模型，不用单独点「自动绑定」
  const onBindRef = useRef(onBind)
  onBindRef.current = onBind
  useEffect(() => {
    const key = (config.apiKey || '').trim()
    if (key.length >= 8 && bindState !== 'bound' && bindState !== 'binding' && bindState !== 'error') {
      const t = setTimeout(() => onBindRef.current?.(), 700)
      return () => clearTimeout(t)
    }
  }, [config.apiKey, bindState])

  return (
    <section className="llm-panel" aria-label="高级模式：模型评测配置">
      <header className="llm-head">
        <span className="llm-badge">AI高级版</span>
        {onClose && (
          <button type="button" className="llm-close" onClick={onClose} aria-label="关闭">✕</button>
        )}
      </header>

      {/* 开启高级模式的门槛：连接测试（真打一次 chat/completions）没通过就不放行 */}
      {pingTesting && (
        <p className="llm-bind-status busy">正在做连接测试…</p>
      )}
      {!pingTesting && gate && (
        <p className={`llm-bind-status ${gate.type === 'ok' ? 'ok' : 'error'}`}>
          {gate.type === 'ok' ? gate.text : `! ${gate.text}`}
        </p>
      )}

      <label className="llm-key-field">
        <input
          type="password"
          value={config.apiKey || ''}
          onChange={(e) => onKeyChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && keyReady && !busy) onBindRef.current?.() }}
          placeholder="粘贴 API Key，粘贴后自动识别厂商与模型"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </label>

      {bindState === 'binding' && (
        <p className="llm-bind-status busy">正在识别…</p>
      )}
      {bindState === 'error' && (
        <p className="llm-bind-status error">! {bindError || '识别失败'}</p>
      )}
      {bound && (
        <div className="llm-bound">
          <span className="llm-bound-dot" />
          <strong>{binding.label || binding.provider}</strong>
          {modelOptions.length > 1 ? (
            <select
              className="llm-model-select"
              aria-label="选择评测模型"
              title="识别厂商时已自动拉取该厂商的模型列表，选一个用于抽卡评测"
              value={binding.model}
              onChange={(e) => {
                const model = e.target.value
                onConfigChange?.({ ...config, model, binding: { ...binding, model } })
              }}
              disabled={busy}
            >
              {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <code>{binding.model}</code>
          )}
          {!binding.models?.length && (
            <button
              type="button"
              className="llm-fetch"
              onClick={onBind}
              disabled={busy || bindState === 'binding'}
              title="重新向厂商拉取 /models 模型列表"
            >拉取模型列表</button>
          )}
          <span className="llm-bound-ok">{binding.verified ? '已验证' : '已识别'}</span>
        </div>
      )}

      {/* 深度审计（docs/AI-AUDIT.md）：默认开——真实扫仓 + 里程碑弹幕 + 等级进化演出 */}
      <label className="llm-deep" title="开启后抽卡会先真实抓取仓库证据（2–5 分钟）：里程碑弹幕、属性/种族弹窗、等级从 Lv.1 滚到审计完成等级并触发进化；关闭则退回即时推测">
        <input
          type="checkbox"
          checked={deepAudit}
          onChange={(e) => onDeepAuditChange?.(e.target.checked)}
          disabled={busy}
        />
        <span className="llm-deep-text">
          深度审计（2–5 分钟）
          <em>真实扫仓 · 里程碑弹幕 · 等级进化演出</em>
        </span>
      </label>

      <details className="llm-custom" open={showCustom} onToggle={(e) => setShowCustom(e.currentTarget.open)}>
        <summary>更多选项（可选）</summary>
        <div className="llm-custom-fields">
          <label>
            <span>Base URL</span>
            <input
              value={config.custom?.baseUrl || ''}
              onChange={(e) => onConfigChange?.({
                ...config, custom: { baseUrl: '', label: '', model: '', ...(config.custom || {}), baseUrl: e.target.value }, binding: null,
              })}
              placeholder="http://127.0.0.1:11434/v1"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          <label>
            <span>显示名称</span>
            <input
              value={config.custom?.label || ''}
              onChange={(e) => onConfigChange?.({
                ...config, custom: { baseUrl: '', label: '', model: '', ...(config.custom || {}), label: e.target.value }, binding: null,
              })}
              placeholder="本地 Ollama"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          <label>
            <span>模型名</span>
            <input
              value={config.custom?.model || ''}
              onChange={(e) => onConfigChange?.({
                ...config, custom: { baseUrl: '', label: '', model: '', ...(config.custom || {}), model: e.target.value }, binding: null,
              })}
              placeholder="qwen2.5:7b"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          <label className="llm-hint-field">
            <span>补充说明（可选）</span>
            <textarea
              value={hint}
              onChange={(e) => onHintChange?.(e.target.value)}
              placeholder="例如：按 2024 年状态评、把等级压低一点…"
              rows={2}
              disabled={busy}
            />
          </label>
        </div>
      </details>

      {keyReady && (
        <div className="llm-foot">
          <button type="button" className="llm-clear" onClick={onClearKey} disabled={busy}>清除密钥</button>
        </div>
      )}
    </section>
  )
}
