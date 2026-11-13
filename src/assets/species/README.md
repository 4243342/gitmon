# 种族立绘素材目录

把图放进 `src/assets/species/<种族>/<属性>.png` 就会自动生效（不用改代码）。

```
species/
  beast/      beast-thunder.png → thunder.png   ← 兽型 · 雷
  bird/
  element/
  dragon/
  flying/
  phantom/
  fairy/
```

命名规则：

| 文件名 | 作用 |
| --- | --- |
| `thunder.png` | 兽型 · 雷，9 个阶段通用 |
| `thunder-s2.png` | 兽型 · 雷 · 初生体（Lv.10，可选，覆盖通用图） |
| `thunder-s6.png` | 兽型 · 雷 · 完全体（Lv.300，可选） |
| `thunder-s7.png` | 兽型 · 雷 · **人形态**（Lv.500，可选） |
| `thunder-s8.png` / `-s9.png` | 人形态·觉醒（Lv.800）/ 人形态·神话（Lv.999） |

阶段表：`-s2` Lv.10 · `-s3` Lv.50 · `-s4` Lv.100 · `-s5` Lv.200 · `-s6` Lv.300 · `-s7` Lv.500 人形态 · `-s8` Lv.800 · `-s9` Lv.999。没给阶段图就逐级往下降，最后用通用图。

- 支持 `.png` / `.webp`，背景必须透明
- 建议 512×512（最大 1024），正面偏 3/4 视角，主体占画面 80%，脚底贴底部约 8%
- 完整清单与画风要求见 [`docs/ASSETS.md`](../../../docs/ASSETS.md)
- 查还缺哪些：`npm run art:check`
