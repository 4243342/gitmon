# AI 高级竞技场（双通道）设计文档

日期：2026-11-09
状态：已与用户对齐（入口=首页双通道；战斗=AI 回合制模拟；结算=结构化报告+导出）

## 1. 需求

- AI 高级模式（advanced）开启后，首页竞技场入口 `.arena-entry` 变为**双通道**：
  ①常规竞技场（现有规则引擎回合制，不变）；②高级竞技场（新）。
- 高级竞技场**选择页与常规基本一样**（复用 mode-grid 三种模式：在线对手／同类型／随机宠物），
  但战斗逻辑改为 **AI 对比两个项目的水平**：不再走 `battleTurn()` 规则引擎，
  而是把双方项目画像交给用户配置的 LLM，由模型逐回合推演「水平对比交锋」。
- 比较单位是**两个项目**（1v1）：在线=输入对方仓库；同类型/随机=从池中挑一个对手项目。
- 结算页提供一份**审计报告**（结构化）：结论、维度对比、证据引用、风险与建议，
  支持导出 Markdown（复制 / 下载）。

## 2. 入口（App.jsx）

- `.arena-entry` 在 `advanced === true` 时渲染两个按钮：
  - 「进入竞技场」→ `setBattleChannel('classic')`（现行为）
  - 「AI 高级竞技场」→ `setBattleChannel('ai')`，仅 advanced 时可见
- 新 state：`battleChannel`（'classic' | 'ai'），随 `<Battle channel={...}>` 传入。
- 顶栏 nav「竞技场」tab 保持 classic。

## 3. 战斗流程（Battle.jsx，channel==='ai'）

- phase 复用：mode → select → fight → result。
- **mode**：ModePicker 照旧三张卡；标题副文案改为说明「AI 对比项目水平、结算出审计报告」。
- **select**：Setup 照旧（在线=扫对方仓库；同类型/随机=选难度）。
  高级通道强制 1v1（cap=1，只比两个项目）；难度仍然下发给模型（easy/normal/hard 影响措辞与倾向）。
- **start()**（ai 分支）：
  1. 用现有逻辑选好敌方（online→opponent；same/random→pickXxxTeam 取 1 只）。
  2. `createBattle()` 照旧建 state（拿单位、精灵、血条面板的展示数据）。
  3. 进入 fight 后不挂自动 `battleTurn` 循环，改为调用 `battleWithLLM()`：
     发送双方画像（姓名、平台、等级、品质、六维、属性、stars、summary/evidence 有则带上）
     + 难度 + llmConfig。
  4. 模型返回 `rounds[]`：`{ turn, actor('player'|'enemy'), move, text, hpPlayer, hpEnemy }`
     与 `winner('player'|'enemy')`。前端逐条回放：
     - 复用 flash/sfx/banner/log/伤害飘字演出；
     - HP 用模型给的 hpPlayer/hpEnemy 直接 setState 到 state（本地不重算伤害）；
     - 回放节奏：每回合 ~1.4s（fast 模式即时）。
  5. 等待模型期间：场上显示「AI 推演中…」状态条（复用 auto-controls 位置）。
- 模型调用失败：fight 内显示错误条 + 「重试 / 返回换模式」，不进 result。

## 4. 结算与审计报告

- result 页在常规结算卡（评级/EXP/MVP 保留）下方新增 `.audit-report` 面板：
  - **结论**：胜方 + 一句话 verdict
  - **维度对比**：`dims[] = { name, player, enemy, winner, note }`（5 行左右，条形对比）
  - **证据引用**：`evidence[]` 字符串
  - **风险 / 建议**：`risks[]` / `suggestions[]`
  - 导出：**复制 Markdown** 与 **下载 .md** 两个按钮（Markdown 由前端从报告对象拼出）。
- 评级：`battleGrade(winner, rounds, 1, 1)` 复用（胜 S/A/B 公式不变）。
- EXP：AI 通道固定 `300`（胜）/`180`（负），`onReward` 照发。

## 5. 后端（backend/gitmon_api）

- `llm.py` 新增 `battle_simulation(*, player, opponent, difficulty, base_url, api_key, model)`：
  - BATTLE_SYSTEM_PROMPT：游戏图鉴式裁判；要求输出纯 JSON：
    ```
    { "rounds": [{ "turn":1, "actor":"player", "move":"工程量碾压",
                   "text":"…", "hpPlayer":100, "hpEnemy":72 }],
      "winner": "player",
      "report": {
        "verdict":"一句话结论",
        "dims":[{"name":"工程质量","player":82,"enemy":64,"winner":"player","note":"…"}],
        "evidence":["…"], "risks":["…"], "suggestions":["…"] } }
    ```
  - 回合 4–8 条；每回合 hpPlayer/hpEnemy 为对手血量剩余（0–100 百分比，终回必有一方为 0）；
    report.dims 中 player/enemy 为 0–100 分。
  - `normalize_battle(raw)`：范围钳制、缺字段兜底 + warnings、winner 与末回 hp 一致性修正。
  - `chat_completion` 增加可选 `timeout`/`max_tokens` 参数（battle 用 90s / 4000）。
- `llm_api.py` 新增 `POST /api/llm/battle`（BattleRequest：player/opponent 画像 dict、
  difficulty、baseUrl/apiKey/model；画像各限 4KB JSON）。

## 6. 前端客户端（src/llm.js）

- `battleWithLLM({ player, opponent, difficulty, config })` → `POST /api/llm/battle`，
  校验 `data.rounds` 存在，错误翻译复用 `postJSON`。

## 7. 样式（battle-arena.css）

- `.arena-entry.channels`：双按钮横排（窄屏纵排），高级按钮带 `AI` 徽标。
- `.battle-picker` 高级通道标题徽标「AI 对比」。
- `.ai-thinking`：fight 等待条（像素风、跑马灯点）。
- `.audit-report`：px-box 面板；维度对比用双色条（我方/对方各一段）；
  证据/风险/建议为像素对话框式列表；导出按钮 `:active` 下沉沿用。
- 断点 760px：报告面板单列、按钮换行；390px 无横向溢出。

## 8. 验证

- `npm run build` 通过。
- Playwright（本地 Edge）：advanced 开启 → 首页双按钮截图；
  进 AI 竞技场 → 选择页/布阵截图；mock 或真实模型跑一场 → 结算报告截图；
  390px 视口 `scrollWidth == 390` 断言；常规通道回归不受影响。
