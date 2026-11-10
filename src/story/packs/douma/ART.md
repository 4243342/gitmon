{
  "_readme": "斗码苍穹的立绘清单。characters.json 里每个角色的 art/face 指向这里的文件名；文件放在同目录 art/ 下。阶段化角色在 stages 字段里声明「哪个阶段用哪张图」。缺图时界面回落到「色块 + 名字」的文字 chip，不会报错。",
  "_spec": {
    "art": "舞台立绘：透明背景 PNG，建议 512×768，人物全身或半身，脚底留一点余量。",
    "face": "头像：正方形 PNG，建议 256×256，人物面部居中，用于角色牌和说话人铭牌。省略时复用 art。",
    "stage": "阶段命名：<角色>_<阶段>.png 与 <角色>_<阶段>_face.png。阶段键目前用 early（早期/前期）。同一个角色在不同剧情阶段是不同形象，所以文件名必须带阶段后缀 —— packStageArtUrl 按 stages 里声明的文件名去取，命名不对就取不到。"
  },
  "_note": "白底素材用 scripts/art-clean.py 抠成透明 PNG（边缘屏障法，能保住白发纯白高光不被当成背景）。",
  "characters": {
    "pet": {
      "name": "主角",
      "stages": {
        "early": {
          "art": "hero_early.png",
          "face": "hero_early_face.png"
        }
      },
      "note": "主角是阶段化角色：早期阶段是他的人形态（蓝发男）。顶层不声明 art/face —— 舞台默认画玩家自己的仓库精灵，到了人形态阶段才切到包立绘。"
    },
    "scout": {
      "name": "药老",
      "art": "scout.png",
      "face": "scout.png",
      "note": "药老：半卷焚决的留人。三年前把口诀交到主角手上的人。"
    },
    "soul": {
      "name": "魂殿",
      "art": "soul.png",
      "face": "soul.png",
      "note": "魂殿：专抄作业的组织。面具、罩袍、无面孔。"
    },
    "boss": {
      "name": "云岚宗",
      "stages": {
        "early": {
          "art": "boss_early.png",
          "face": "boss_early_face.png"
        }
      },
      "note": "云岚宗是阶段化角色：前期阶段是白发青衣的女修，后期才现出宗主真身。顶层不声明 art/face。"
    }
  }
}
