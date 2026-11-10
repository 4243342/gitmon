// 剧本包 · 斗码苍穹（三年之约主线）
//
// 语汇：开源项目被拟作宗门，star 是香火，fork 是分家，release 是境界。
//
// 斗破苍穹骨架 —— 三年之约：
//   三年前主角被宗门名册除名，与云岚宗立下三年之期：约期满时上云岚宗山门，
//   在名碑上刻下自己的名字。谁的名字留在碑上，往后三年的规矩就由谁定。
//   药老留下半卷焚决 —— 口诀不是秘籍，得有人照着复现一遍才炼得成；
//   魂殿是专抄作业的组织，也正是主角必须把东西摊开的原因。
//
// 结构约定与默认包一致（运行时按标签解析）：
//   # scene: <id> / # bg: <key> / # cast: a,b / # keys: a,b
//   # battle: minion|boss / # win: <knot> / # lose: <knot> / # ending
//   # stage: <阶段键>  这一屏用哪个阶段的角色形象（对应 characters.json 的 stages）
//
// 阶段约定（见同目录 STORY.md §3）：
//   主角是阶段化角色 —— 早期是人形态（蓝发男），云岚宗前期是白发青衣的女修。
//   三年之约这条主线里始终是「早期 / 前期」，所以每屏都声明 early；
//   写后期剧情时把 stage 改成 late，角色表里加 stages.late 即可，路线不用动。
//
// 变量契约与运行时 KNOWN_VARS 对齐：chapter / chapter_count / trust / deaths / route / ending_id
//   trust = 三年里愿意认主角这一套、肯替他站台的分量（公开复现攒出来的）
//   route = insider（有内应替他作证）/ solo（独自赴约，没人同行）

EXTERNAL say(key)

VAR chapter_count = 3
VAR chapter = 0
VAR trust = 0
VAR deaths = 0
VAR route = "solo"
VAR pet_name = "主角"
VAR boss_name = "宿敌"
VAR ending_id = ""

// 开章：旁白独占屏幕中央，成品音频 + 逐字显现。
// 这一屏不是对话，是「片头解说」—— 所以走 # opening 标签，
// 界面渲染成居中的解说字幕而不是底部对话框。
-> opening

=== opening ===
# scene: opening
# stage: early
# bg: void
# cast: narrator
# keys: narrator.opening
# opening: opening.mp3
{say("narrator.opening")}
+ [继续]
    -> origin_a

// 第二段旁白：主角身世 —— 从空前绝后的码术天才到码量跌到 P3。
// 同样是解说屏（# narration），自带成品配音：
//   台词改了就跑 scripts/tts-narration.py douma narrator.origin_a narrator.origin_b 重录。
// 拆成两屏讲：一屏说他当年多强，一屏说他怎么跌下来。
// 一屏塞完 154 字会排到 8 行、撑破解说屏，而且一口气念完没有停顿、没有重量。
// 这一段放在过场之前：先讲清「他是谁、怎么跌下来的」，
// 再让他从卡片形象变成人形态醒来 —— 顺序反了就没了「原来是他」的重量。
=== origin_a ===
# scene: origin_a
# stage: early
# bg: void
# cast: narrator
# keys: narrator.origin_a
# narration: narrator_origin_a.m4a
{say("narrator.origin_a")}
+ [继续]
    -> origin_b

=== origin_b ===
# scene: origin_b
# stage: early
# bg: void
# cast: narrator
# keys: narrator.origin_b
# narration: narrator_origin_b.m4a
{say("narrator.origin_b")}
+ [继续]
    -> awaken

// 过场：主角由卡片形象变成光团 → 画面变暗 → 醒来变成人形态。
// 这一屏没有台词，走 # transform 标签 —— 界面渲染成一段动画，
// 动画播完自动进正片。素材由 meta.transforms.awaken 声明。
=== awaken ===
# scene: awaken
# stage: early
# bg: void
# cast: pet
# transform: awaken
+ [醒来]
    -> prologue

// 序章：约期已到，把当年的除名通知连同战书一起寄回去
=== prologue ===
# scene: prologue
# stage: early
# bg: dawn
# cast: pet,narrator
# keys: narrator.hook,pet.oath
{say("narrator.hook")}
{say("pet.oath")}
+ [先递上战书，把这三年应下来]
    ~ trust += 1
    -> growth_loop
+ [在战书上再添一句：规矩由我来定]
    ~ trust += 2
    -> growth_loop

// 成长章：chapter_count - 1 章，每章一屏 + 一场杂兵战
=== growth_loop ===
{chapter >= chapter_count - 1: -> finale_route}
{chapter == 1: -> soul_scene}
-> growth_gate

// 药老与焚决：不是秘籍，是半卷口诀 —— 要炼成，得有人照着复现一遍
=== growth_gate ===
# scene: growth_gate
# stage: early
# bg: alley
# cast: pet,scout
# keys: scout.hook,scout.offer
{say("scout.hook")}
{say("scout.offer")}
+ [把最要紧的那一段也交出去]
    ~ trust += 1
    -> gate_battle
+ [全交出去，一段不留]
    ~ trust += 2
    -> gate_battle
+ [谁也不给，自己闷头炼]
    {trust > 0:
        ~ trust -= 1
    }
    ~ route = "solo"
    -> gate_battle

// 魂殿：专抄作业的组织。它们越抄，看懂焚决的人就越多
=== soul_scene ===
# scene: soul_gate
# stage: early
# bg: alley
# cast: pet,soul,scout
# keys: soul.taunt,scout.warn,pet.resolve
{say("soul.taunt")}
{say("scout.warn")}
{say("pet.resolve")}
+ [连夜把实现开源，让追我的人变成读我的人]
    ~ trust += 2
    -> growth_gate
+ [先藏起来，换个地方炼]
    ~ trust += 1
    -> growth_gate

=== gate_battle ===
# battle: minion
# win: gate_win
# lose: gate_lose
-> DONE

=== gate_win ===
~ chapter += 1
-> growth_loop

=== gate_lose ===
~ deaths += 1
{trust > 0:
    ~ trust -= 1
}
# scene: gate_lose
# stage: early
# bg: alchemy
# cast: pet,scout
# keys: scout.lose
{say("scout.lose")}
+ [再来一次]
    -> gate_battle
+ [先撤，回去重炼]
    ~ trust += 1
    -> growth_loop

// 终章分流：分量够重就有人替你作证，否则一个人赴约
=== finale_route ===
{trust >= 7:
    ~ route = "insider"
    -> finale_insider
- else:
    ~ route = "solo"
    -> finale_solo
}

=== finale_insider ===
# scene: finale_insider
# stage: early
# bg: sect
# cast: pet,scout
# keys: scout.ally
{say("scout.ally")}
+ [踏上石阶，把三年之约了结]
    -> vow_scene

=== finale_solo ===
# scene: finale_solo
# stage: early
# bg: sect
# cast: pet,narrator
# keys: narrator.solo
{say("narrator.solo")}
+ [一个人走上石阶]
    -> vow_scene

// 立约：名碑就在阶前，规矩由谁定，看这一战
=== vow_scene ===
# scene: vow_scene
# stage: early
# bg: sect
# cast: pet,boss
# keys: boss.hook,boss.challenge
{say("boss.hook")}
{say("boss.challenge")}
+ [不必多言，拔剑]
    -> boss_battle
+ [三年之期已到，请把名碑让出来]
    ~ trust += 1
    -> boss_battle

=== boss_battle ===
# battle: boss
# win: boss_win
# lose: boss_lose
-> DONE

=== boss_win ===
-> ending_check

=== boss_lose ===
~ deaths += 1
# scene: boss_lose
# stage: early
# bg: sect
# cast: pet,boss
# keys: boss.glory
{say("boss.glory")}
+ [再战]
    -> boss_battle
+ [认输，收兵]
    {trust >= 2:
        ~ trust -= 2
    }
    -> ending_check

// 结局匹配：按顺序取第一条命中的，最后一条兜底
=== ending_check ===
{trust >= 7 && deaths == 0:
    ~ ending_id = "ending_flame"
- else:
    {deaths >= 2:
        ~ ending_id = "ending_withered"
    - else:
        {trust <= 1:
            ~ ending_id = "ending_lone"
        - else:
            ~ ending_id = "ending_steady"
        }
    }
}
-> ending

=== ending ===
# scene: ending
# stage: early
# ending
# bg: dawn
# cast: pet,narrator
# keys: narrator.ending_a,narrator.ending_b
{say("narrator.ending_a")}
{say("narrator.ending_b")}
-> END
