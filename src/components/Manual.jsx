import { useState } from 'react'

// 使用说明书：章节内容按当前实现的真实规则撰写（engine.js / traits.js / evolution.js / GrowPanel.jsx / Battle.jsx）
const TIERS = [
  { n: '1–9', name: '金星', desc: '1 颗 = 1 级，逐颗并排' },
  { n: '10', name: '炫彩星', desc: '10 级起，每 10 星 1 枚' },
  { n: '100', name: '月亮', desc: '每 100 星 1 枚' },
  { n: '1,000', name: '地球', desc: '每 1,000 星 1 枚' },
  { n: '1 万', name: '太阳', desc: '每 1 万星 1 枚' },
  { n: '10 万', name: '黑太阳', desc: '每 10 万星 1 枚' },
  { n: '100 万', name: '宇宙', desc: '每 100 万星 1 枚' },
  { n: '1,000 万', name: '至高', desc: '金箔文字招牌，不再叠图标' },
]

const CHAPTERS = [
  {
    id: 'start', no: '01', name: '快速上手',
    body: (
      <>
        <h4>三步孵出第一只</h4>
        <ol>
          <li><b>填地址</b>：仓库地址（<code>github.com/owner/repo</code>）= <b>1 包</b>；账号主页（<code>github.com/owner</code>）= <b>一整箱</b>，名下每个项目各一包，fork / 空仓库跳过。</li>
          <li><b>等扫描</b>：读取项目清单 → 读取技术栈 → 估算工程量 → 评估代码质量，逐项打勾。</li>
          <li><b>开包收下</b>：出场动画后「收入图鉴」；详情页可导出分享卡、带它去对战、做养成任务。</li>
        </ol>
        <h4>登录有什么用</h4>
        <ul>
          <li><b>游客</b>：匿名 GitHub / Gitee API 每小时 60 次，整箱孵化容易打满。</li>
          <li><b>登录 GitHub / Gitee</b>：只读授权，不写代码；自动列出名下项目（含私有仓库），额度更充裕。</li>
        </ul>
        <p className="manual-tip">右上角 <b>♪ ON / ♪ OFF</b> 一键静音，同时管住音效与对战 BGM。</p>
      </>
    ),
  },
  {
    id: 'judge', no: '02', name: '判定规则',
    body: (
      <>
        <h4>品种 = 属性 × 生态型</h4>
        <ul>
          <li><b>主语言 → 元素属性</b>：Python 水系 / JS 雷系 / Rust 钢系… 多语言时可能带第二属性。</li>
          <li><b>项目类型 → 生态型</b>：AI 龙型 / CLI 鸟型 / Web 兽型… 属性决定技能池与克制关系。</li>
        </ul>
        <h4>品质：五维加权 → N / R / SR / SSR</h4>
        <ul>
          <li>测试完备度 <b>25%</b> · 工程质量 <b>20%</b> · 文档完整度 <b>20%</b> · 维护健康度 <b>20%</b> · 社区认可 <b>15%</b>。</li>
          <li>总分 <b>≥80 SSR</b>（传说）· <b>≥60 SR</b> · <b>≥40 R</b> · 其余 N；卡面右上角六边形宝石标显示字母。</li>
        </ul>
        <h4>等级 / 进化 / 六维</h4>
        <ul>
          <li><b>工程量</b>：代码规模 35% + 提交总量 30% + 根目录条目 10% + 贡献者 15% + 活跃时长 10%，对数归一 → <b>Lv.1–999</b>。</li>
          <li><b>进化 9 段</b>：按等级推进（幼体 → 初生体 → 成长体 → … → 人形态·神话），卡面进化条显示距下一段还差多少级。</li>
          <li><b>六维</b>：攻击 / 防御 / 速度 / 特攻 / 特防 / HP，评级 S ≥90 · A ≥75 · B ≥60 · C ≥40 · D；<b>4 个技能</b>按 Lv.1 / 1 / 150 / 500 解锁。</li>
          <li><b>根基</b>（测试 30% / 粒度 20% / 提交史 15% / 文档 20% / 真实性 15%）分稳固 / 尚可 / 松动 / 根基不稳；<b>性格词条</b>由仓库特征生成，正面 / 负面影响属性与经验倍率，<b>?</b> 是可修复提示。</li>
        </ul>
        <p className="manual-tip">超过 30 天没有提交的仓库会变成「沉睡」状态，投喂会被拦下——推一次代码就能唤醒。</p>
      </>
    ),
  },
  {
    id: 'stars', no: '03', name: '星级段位',
    body: (
      <>
        <h4>1 颗星 = 1 级</h4>
        <p>徽章读的是仓库真实 star 数，卡面右上角与图鉴小格都有角标。跨档时按倍数并排多枚图标（最多 9 枚，自动缩小保持单排），不写 ×N。</p>
        <div className="manual-tiers">
          {TIERS.map((t) => (
            <div key={t.n}>
              <b>{t.n}</b>
              <span>{t.name}</span>
              <em>{t.desc}</em>
            </div>
          ))}
        </div>
        <p className="manual-tip">例：51,800 ★ → 太阳 ×5；232,000 ★ → 黑太阳 ×2；≥1,000 万 → 只显示「至高」。</p>
      </>
    ),
  },
  {
    id: 'battle', no: '04', name: '竞技场',
    body: (
      <>
        <h4>三种打法</h4>
        <ul>
          <li><b>在线对手</b>：输入对方仓库 / 账号地址，按真实实力 1v1；<b>整仓全员上阵，不限精灵数量</b>。</li>
          <li><b>同类型对战</b>：从同属性仓库里挑对手，可调难度。</li>
          <li><b>随机宠物</b>：抽到谁打谁，可调难度。</li>
        </ul>
        <h4>全自动，不用点技能</h4>
        <ul>
          <li>开战后双方自动出招：按估伤 × 命中挑最优招式，残血且替补属性更优时自动换人；<b>没有技能按钮、也不需要手动操作</b>，看战报和演出即可。</li>
          <li>顶栏 <b>» 快进</b> 或 <kbd>F</kbd> 可跳过逐帧演出、让整场更快打完（偏好会被记住）。</li>
          <li>属性克制、先制、异常状态、换人共同决定结果；等级高不一定赢，每回合有战斗日志。</li>
        </ul>
        <h4>结算</h4>
        <ul>
          <li>战斗有专属 BGM 与结算音效；胜利给全队 <b>XP</b> 与羁绊（胜 +4 / 负 +1）。</li>
        </ul>
        <p className="manual-tip">卡面右上角 ♪ 可随时静音 / 恢复；离场自动停 BGM。</p>
      </>
    ),
  },
  {
    id: 'grow', no: '05', name: '养成与图鉴',
    body: (
      <>
        <h4>养成</h4>
        <ul>
          <li><b>每日投喂</b>：+40 XP、羁绊 +5（每天一次，沉睡时不可投喂）。</li>
          <li><b>每周训练任务</b>：按仓库短板派发 3 个任务（补测试 / 写文档 / 加 CI / 关 issue / 发 release），+90 ~ 200 XP、羁绊 +4。</li>
          <li><b>升级曲线</b>：升下一级需要 100 × Lv^1.5 点 EXP；羁绊称号：初次见面 → 熟悉的朋友(20) → 默契伙伴(50) → 灵魂伴侣(80)。</li>
        </ul>
        <h4>图鉴 / 卡面 / 分享</h4>
        <ul>
          <li>图鉴存在本机浏览器，点小卡随时回详情；卡片支持鼠标跟随倾斜与全息反光。</li>
          <li><b>换形象</b>：详情页点「换形象」或直接把图片拖进立绘区，自定义形象存 IndexedDB，可一键还原。</li>
          <li><b>导出分享卡</b>：1080 × 1509 PNG，完整复刻卡面全要素（星级、品质标、六维、技能、词条、页脚）。</li>
        </ul>
        <p className="manual-tip">当前版本 XP 由手动任务结算；正式版会按每日 commit / PR / release 自动结算。</p>
      </>
    ),
  },
  {
    id: 'faq', no: '06', name: '常见问题',
    body: (
      <>
        <h4>提示「名下还没有可孵化的项目」</h4>
        <ul>
          <li>项目全是 fork / 空仓库会被跳过；也可能是接口返回空或权限不足。登录授权后能列出私有仓库，页上会显示具体跳过原因。</li>
        </ul>
        <h4>限流 / 403 / 配额用尽</h4>
        <ul>
          <li>匿名额度 60 次/小时；整箱孵化会连打多个接口。点「登录后自动读我的仓库」即可换用登录态额度。</li>
        </ul>
        <h4>数据来源与隐私</h4>
        <ul>
          <li>数据来自 GitHub / Gitee 公开 API，OAuth 为只读授权，不会往仓库写任何内容；图鉴、自定义形象都只存在本机。</li>
          <li>判定里含少量随机微扰，同一仓库使用固定种子，结果可复现。</li>
        </ul>
        <p className="manual-tip">顶部 GitMon 标志可随时回到首页；图鉴与详情页的「再孵一只」会清空当前流程重新扫描。</p>
      </>
    ),
  },
]

export default function Manual() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(CHAPTERS[0].id)
  const chapter = CHAPTERS.find((c) => c.id === active) || CHAPTERS[0]
  return (
    <section className={`manual ${open ? 'open' : 'closed'}`}>
      <button className="manual-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="manual-title">
          <h3>说明书</h3>
          <small>GitMon v0.3 · 共 6 章</small>
        </span>
        <span className="manual-toggle">{open ? '收起 ▴' : '展开 ▾'}</span>
      </button>
      {!open && (
        <button className="manual-peek" onClick={() => setOpen(true)}>
          快速上手 · 判定规则 · 星级段位 · 竞技场 · 养成与图鉴 · 常见问题
          <span>点开查看完整规则 →</span>
        </button>
      )}
      {open && (
        <div className="manual-wrap">
          <nav className="manual-tabs" aria-label="说明书目录">
            {CHAPTERS.map((c) => (
              <button
                key={c.id}
                className={`manual-tab ${c.id === active ? 'active' : ''}`}
                onClick={() => setActive(c.id)}
                aria-current={c.id === active ? 'page' : undefined}
              >
                <i>{c.no}</i>{c.name}
              </button>
            ))}
          </nav>
          <div className="manual-page" key={chapter.id}>
            <div className="manual-page-head">
              <span>{chapter.no}</span>
              <h4>{chapter.name}</h4>
            </div>
            {chapter.body}
          </div>
        </div>
      )}
    </section>
  )
}
