import { sealData } from '../modelSeal.js'
import '../advanced.css'

// 高级模式专属：模型溯源全息钢印。
// 与 share.js 导出的 PNG 同款构图（彩虹 foil 外圈 + 内芯模型名 / 型号 / 厂商）。
export default function ModelSeal({ pet }) {
  if (!pet?.aiEvaluated) return null
  const { family, variant, provider, modelId } = sealData(pet)
  const tip = `全部评测由模型 ${modelId}（${provider}）给出 · 非真实扫描`
  return (
    <div className="model-seal" title={tip} aria-label={tip}>
      <div className="model-seal__foil" />
      <div className="model-seal__inner">
        <span className="model-seal__top">✦ AI 推测 ✦</span>
        <strong className="model-seal__name">{family}</strong>
        <span className="model-seal__variant">{variant}</span>
        <span className="model-seal__provider">{provider}</span>
        <span className="model-seal__id">{modelId}</span>
      </div>
      <div className="model-seal__sheen" />
    </div>
  )
}
