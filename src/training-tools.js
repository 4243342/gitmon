// 训练场：AI 编程工具导航。点击卡片直达对应软件（新标签页）。
// 地址均为官方入口，2026-11-09 核实；国内用户 Trae 默认走 .cn 国内版。
export const TRAINING_TOOLS = [
  {
    id: 'trae',
    name: 'Trae',
    mark: 'TR',
    vendor: '字节跳动',
    kind: 'AI IDE',
    desc: 'IDE 与 SOLO 双模式的 AI 工程师，从需求到部署一条龙。国内版开箱即用。',
    url: 'https://www.trae.cn/',
    alt: { label: '国际版 ↗', url: 'https://www.trae.ai/' },
    color: '#8b6cff',
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    mark: 'WB',
    vendor: '腾讯',
    kind: 'AI 工作台',
    desc: '一句话下达任务，自主规划并交付文档、代码、设计与可直接验收的成果。',
    url: 'https://www.workbuddy.cn/',
    alt: { label: '产品文档 ↗', url: 'https://www.workbuddy.cn/docs/workbuddy/Overview' },
    color: '#3a8dff',
  },
  {
    id: 'codex',
    name: 'Codex',
    mark: 'CX',
    vendor: 'OpenAI',
    kind: '编程智能体',
    desc: '云端 / CLI / IDE / 网页多端同一个 Agent，用 ChatGPT 账号登录即可开工。',
    url: 'https://chatgpt.com/codex',
    alt: { label: '产品页 ↗', url: 'https://openai.com/codex/' },
    color: '#10a37f',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    mark: 'CU',
    vendor: 'Anysphere',
    kind: 'AI 编辑器',
    desc: '整库理解 + 并行 Agent，Tab 补全、多文件改动和云端任务都在一个编辑器里。',
    url: 'https://www.cursor.com/',
    alt: null,
    color: '#e2b96b',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    mark: 'CC',
    vendor: 'Anthropic',
    kind: '终端 Agent',
    desc: '在终端里读代码、改文件、跑命令；也有桌面版和网页版，可用 skills 沉淀工作流。',
    url: 'https://claude.ai/code',
    alt: { label: '官方文档 ↗', url: 'https://code.claude.com/docs/en/overview' },
    color: '#d97757',
  },
  {
    id: 'grok-bot',
    name: 'Grok Bot',
    mark: 'GB',
    vendor: 'xAI',
    kind: '云端 Bot',
    desc: '给常驻云端的 Bot 派活，关掉电脑也继续跑，还能设定时重复任务。',
    url: 'https://x.ai/bot',
    alt: { label: '上手指南 ↗', url: 'https://docs.x.ai/grok-bot/get-started' },
    color: '#9aa8c4',
  },
]

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
