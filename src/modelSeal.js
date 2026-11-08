// 模型钢印的展示数据：把 model id 拆成「模型名字 + 型号」，供 DOM 钢印与导出 PNG 共用。
// 这里刻意不依赖任何模型厂商 SDK —— 只做字符串排版，不猜测模型能力。

const FAMILY_LABEL = {
  gpt: 'GPT', openai: 'OpenAI', deepseek: 'DeepSeek', qwen: 'Qwen',
  glm: 'GLM', claude: 'Claude', llama: 'Llama', gemini: 'Gemini',
  mistral: 'Mistral', hunyuan: '混元', doubao: '豆包', moonshot: 'Kimi',
  ernie: '文心', yi: 'Yi', baichuan: '百川', step: 'Step', minimax: 'MiniMax',
  sensenova: 'SenseChat', spark: '星火', grok: 'Grok', command: 'Command',
  mock: 'MOCK', local: 'LOCAL', custom: 'CUSTOM',
}

// 尾段出现这些词时，把它当成「型号」而不是模型名的一部分
const VARIANT = /^(mini|flash|turbo|lite|chat|instruct|preview|latest|free|pro|plus|max|air|lightning|reasoner|vision|audio|online|beta|think|exp|distill|quant|awq|gguf|\d+b|\d+k|v\d+|\d{4}|\d+)$/i

function pretty(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const low = raw.toLowerCase()
  if (FAMILY_LABEL[low]) return FAMILY_LABEL[low]
  // gpt-4o → GPT-4o；qwen2.5-7b → Qwen2.5-7b
  return raw
    .split('-')
    .map((part) => FAMILY_LABEL[part.toLowerCase()] || (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join('-')
}

export function splitModelLabel(modelId) {
  const raw = String(modelId || '').trim()
  if (!raw) return { family: 'AI MODEL', variant: '' }
  // OpenRouter 的 openai/gpt-4o-mini、siliconflow 的 Qwen/Qwen2.5-7B-Instruct
  const id = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw
  // Ollama 的 qwen2.5:7b
  if (id.includes(':')) {
    const i = id.lastIndexOf(':')
    return { family: pretty(id.slice(0, i)), variant: id.slice(i + 1) }
  }
  const parts = id.split('-').filter(Boolean)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    if (VARIANT.test(last)) {
      return { family: pretty(parts.slice(0, -1).join('-')), variant: last }
    }
    return { family: pretty(parts[0]), variant: parts.slice(1).join('-') }
  }
  return { family: pretty(id), variant: '' }
}

export function sealData(pet) {
  const modelId = String(pet?.aiModel || pet?.aiBinding?.model || '').trim()
  const binding = pet?.aiBinding || {}
  const provider = String(pet?.aiProviderLabel || binding.label || pet?.aiProvider || '').trim()
  const { family, variant } = splitModelLabel(modelId || 'AI MODEL')
  return {
    modelId: modelId || '未标注模型',
    family,
    variant: variant || 'EVALUATED',
    provider: provider || 'LLM',
    verified: binding.verified !== false,
  }
}
