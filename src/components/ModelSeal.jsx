import { sealData } from '../modelSeal.js'
import { useI18n } from '../i18n.js'
import '../advanced.css'

// 高级模式专属：模型溯源全息钢印。
// 与 share.js 导出的 PNG 同款构图（彩虹 foil 外圈 + 内芯模型名 / 型号 / 厂商）。
export default function ModelSeal({ pet }) {
  const { t } = useI18n()
  if (!pet?.aiEvaluated) return null
  const { family, variant, provider, modelId } = sealData(pet)
  const tip = pet.audited
    ? t(`模型 ${modelId}（${provider}）基于真实审计证据总评`, `Model ${modelId} (${provider}) rated from real audit evidence`)
    : t(`全部评测由模型 ${modelId}（${provider}）给出 · 非真实扫描`, `All ratings by model ${modelId} (${provider}) · not a real scan`)
  return (
    <div className="model-seal" title={tip} aria-label={tip}>
      <div className="model-seal__foil" />
      <div className="model-seal__inner">
        <span className="model-seal__top">{pet.audited ? t('✦ 深度审计 ✦', '✦ Deep Audit ✦') : t('✦ AI 推测 ✦', '✦ AI Guess ✦')}</span>
        <strong className="model-seal__name">{family}</strong>
        <span className="model-seal__variant">{variant}</span>
        <span className="model-seal__provider">{provider}</span>
        <span className="model-seal__id">{modelId}</span>
      </div>
      <div className="model-seal__sheen" />
    </div>
  )
}
