import { useState } from 'react'
import { expForLevel } from '../engine.js'
import { useI18n } from '../i18n.js'

// 养成面板（文档 §7.2）：每日投喂 / 每周训练任务 / 羁绊值
const TASK_POOL = [
  { key: 'test', label: ['补一个单元测试', 'Add a unit test'], hint: ['测试完备度 +', 'Test coverage +'], xp: 120 },
  { key: 'doc', label: ['补写一段 README 文档', 'Write a README section'], hint: ['文档完整度 +', 'Docs completeness +'], xp: 100 },
  { key: 'ci', label: ['给仓库加上 CI 配置', 'Set up CI for the repo'], hint: ['工程质量 +', 'Code quality +'], xp: 150 },
  { key: 'issue', label: ['关闭一个陈年 issue', 'Close a stale issue'], hint: ['维护健康度 +', 'Maintenance health +'], xp: 90 },
  { key: 'release', label: ['发布一个 release', 'Ship a release'], hint: ['维护健康度 +', 'Maintenance health +'], xp: 200 },
]

function pickTasks(pet) {
  // 依据仓库短板派发任务：缺测试→补测试，缺文档→写文档
  const weak = []
  pet.qualityDims.forEach((d) => { if (d.value < 60) weak.push(d.key) })
  const map = { tests: 'test', docs: 'doc', engineering: 'ci', health: 'release' }
  const picked = []
  weak.forEach((w) => { if (map[w] && !picked.includes(map[w])) picked.push(map[w]) })
  for (const t of TASK_POOL) {
    if (picked.length >= 3) break
    if (!picked.includes(t.key)) picked.push(t.key)
  }
  return picked.slice(0, 3).map((k) => TASK_POOL.find((t) => t.key === k))
}

export default function GrowPanel({ pet, onUpdate }) {
  const { t: tf } = useI18n()
  const [tasks] = useState(() => pickTasks(pet))
  const [done, setDone] = useState([])
  const [fedAt, setFedAt] = useState(pet.fedAt || 0)
  const [msg, setMsg] = useState('')
  const [exp, setExp] = useState(pet.exp || 0)
  const [level, setLevel] = useState(pet.level)

  const gain = (xp, bond = 2) => {
    let nextExp = exp + xp
    let nextLevel = level
    while (nextLevel < 999 && nextExp >= expForLevel(nextLevel)) {
      nextExp -= expForLevel(nextLevel)
      nextLevel += 1
    }
    setExp(nextExp)
    setLevel(nextLevel)
    onUpdate?.({ ...pet, exp: nextExp, level: nextLevel, bond: Math.min(100, (pet.bond || 0) + bond) })
  }

  const feed = () => {
    const today = new Date().toDateString()
    if (fedAt === today) { setMsg(tf('今天已经投喂过啦', 'Already fed today')); return }
    if (pet.status === 'sleeping') { setMsg(tf('精灵沉睡中，先提交一次代码唤醒它', 'Fast asleep — push a commit to wake it')); return }
    setFedAt(today)
    setMsg(tf('投喂成功，精灵开心地晃了晃', 'Fed! Your pet wiggled happily'))
    gain(40, 5)
  }

  const complete = (task) => {
    if (done.includes(task.key)) return
    setDone([...done, task.key])
    const label = tf(...task.label)
    setMsg(tf(`完成「${label}」，+${task.xp} XP`, `Completed “${label}” · +${task.xp} XP`))
    gain(task.xp, 4)
  }

  const bond = pet.bond || 0
  const bondTitle = bond >= 80 ? tf('灵魂伴侣', 'Soulmates') : bond >= 50 ? tf('默契伙伴', 'Trusted Partner') : bond >= 20 ? tf('熟悉的朋友', 'Familiar Friend') : tf('初次见面', 'First Meeting')

  return (
    <section className="grow">
      <div className="grow-head">
        <h3>{tf('养成', 'Growth')}</h3>
        <span className="bond">{tf('羁绊', 'Bond')} {bond} · {bondTitle}</span>
      </div>

      <div className="exp-row">
        <span>EXP {exp} / {expForLevel(level)}</span>
        <div className="exp-bar"><div style={{ width: `${Math.min(100, (exp / expForLevel(level)) * 100)}%` }} /></div>
        <span>Lv.{level}</span>
      </div>

      <div className="grow-actions">
        <button className="ghost-btn" onClick={feed}>{tf('每日投喂', 'Daily Feed')}</button>
        {msg && <span className="grow-msg">{msg}</span>}
      </div>

      <div className="tasks">
        <h4>{tf('本周训练任务', 'This Week’s Training')}</h4>
        {tasks.map((t) => (
          <div key={t.key} className={`task ${done.includes(t.key) ? 'done' : ''}`}>
            <span className="task-label">{tf(...t.label)}<em>{tf(...t.hint)}</em></span>
            <span className="task-xp">+{t.xp} XP</span>
            <button onClick={() => complete(t)} disabled={done.includes(t.key)}>
              {done.includes(t.key) ? tf('已完成', 'Done') : tf('完成', 'Complete')}
            </button>
          </div>
        ))}
      </div>
      <p className="grow-note">{tf('真实版本中，XP 由仓库 commit / PR / release 自动结算（每日同步）。', 'In the real product, XP settles automatically from repo commits / PRs / releases (synced daily).')}</p>
    </section>
  )
}
