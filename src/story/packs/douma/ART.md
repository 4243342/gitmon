{
  "_readme": "斗码苍穹的立绘清单。characters.json 里每个角色的 art/face 指向这里的文件名；文件放在同目录 art/ 下。缺图时界面回落到「色块 + 名字」的文字 chip，不会报错。",
  "_spec": {
    "art": "舞台立绘：透明背景 PNG，建议 512×768，人物全身或半身，脚底留一点余量。",
    "face": "头像：正方形 PNG，建议 256×256，人物面部居中，用于角色牌和说话人铭牌。省略时复用 art。"
  },
  "characters": {
    "pet": {
      "name": "主角",
      "art": "pet.png",
      "face": "pet.png",
      "note": "主角在舞台上默认画玩家自己的仓库精灵。有包立绘时改用包立绘。"
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
      "art": "boss.png",
      "face": "boss.png",
      "note": "云岚宗掌权者。三年前寄出除名通知的人，站在名碑旁。"
    }
  }
}
