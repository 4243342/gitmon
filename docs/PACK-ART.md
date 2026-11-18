# 模型典藏卡盒与六档包装

## 对应关系

卡片与卡包对外只使用以下六档，顺序从低到高固定。模型名是包装角色主题，不覆盖实际评测模型 `aiModel` / `aiBinding`。

| 品质 | 名称 | 包装角色 | 包装主色 | 材质 |
| --- | --- | --- | --- | --- |
| N | 普卡 | MiMo | 奶白、橘橙、炭黑 | 哑光 |
| R | 稀有 | DeepSeek | 深海蓝、冰蓝、白 | 缎面 |
| SR | 面闪 | Grok | 黑、酒红、暖金 | 画面全息 |
| UR | 金闪 | Gemini | 蓝紫、金 | 金箔 |
| SE | 银碎 | GPT | 珍珠白、银、浅紫 | 银色碎闪 |
| PSE | 镜碎 | Claude Code | 铜橙、暖白、墨色 | 彩虹镜碎 |

`src/cardQuality.js` 是六档顺序和名称的共同来源；`src/packDesign.js` 是角色图片与包装配色的共同来源。整盒预览、静态包装和可撕包装都使用这份定义。

每 5 张卡组成一包。`packDesign(pets)` 通过 `cardFoil(pet).key` 找到包内最高品质，不能使用为了旧动画兼容而压缩成四档的 `effect`。例如 N、UR、SE、R、PSE 混装时，卡包是 **PSE / Claude Code**。

未完成评估的卡保留 `pending`；整包都未评估时，显示“— / 待评估”，N 只作暂时的包装主题，不伪报为已确认普卡。部分卡待评估时，页面说明当前采用已确认的最高品质。

## 评分与旧存档

- 本地原有 0、40、60、80 分门槛保留，新增 90 分 SE、97 分 PSE。
- 历史 SSR 兼容为 UR。旧卡不会因保存的分数较高自动晋升，种子、成长、已有战斗数值不重写。
- 云卡继续使用原本已经存在的 N/R/SR/UR/SE/PSE `rarity` 结果作为对外品质，不改变公开 Star/Fork 认可度算法。
- 云端八档 `qualityRating` 留作源码证据、选图和内部缓存元数据。界面独立显示数值“源码评分”，不再把八档名作为第二套品质。
- UR、SE、PSE 沿用原 SSR 的个体值下限和后端战斗倍率，包装细分不额外改变战斗平衡。

## 卡盒与开包

`PackDisplayBox.jsx` 按需导入 Three.js 引擎 `src/threePack/displayBox.js`。场景包含打开的硬质盒盖、金属边、铰链、锁扣、内衬、六个卡槽、立绘包装、铭牌、棚拍灯光和接触阴影。每页最多 6 包；外部选中任意包时切换到其所在页。

轻触盒内包装会选中并抬起它，摘要中的“取出开包”进入原有拆包舞台。键盘和读屏可使用 HTML 按钮。减少动态效果时直接切换位置；WebGL 不可用时显示静态盒预览，开包按钮和下方列表仍可用。

开包沿用任意位置、任意方向的真实拖动轨迹。角色图在印刷坐标内参与裁切，撕下的箔片保留对应图案。开完以后空包装仍在盒中，卡片在独立区域陈列。

## 角色来源与署名

这六张包装立绘是基于网上已有拟人设定生成的同人重绘，**不是模型厂商的官方人形宣传图**。没有把作者原始位图直接复制为发布素材。

来源档案：[shuaizenge/ai-girls](https://github.com/shuaizenge/ai-girls)，本次使用档案提交 `dcd69f5f4f2dff1a9c0031e82deb49e0fe949c76` 的 `catalog.json` 与 `NOTICE.md`。图像核对也参考了[蓝色大肥鱼角色立绘页](https://fisharchive.cc/characters)。

| 发布资产 | 角色设计参考与出处 | 已查到的来源使用条件 |
| --- | --- | --- |
| `src/assets/pack-avatars/mimo.webp` | 甶丶，[《娘化mimo》](https://www.bilibili.com/opus/1242097128919007239)；参考银白双马尾、橙黑机能服、兔耳与白兔 | 档案记录投稿为 CC BY-NC，版本号未注明；保留署名和非商业条件，不自行改标为 4.0 |
| `src/assets/pack-avatars/deepseek.webp` | 原型：上善无形；女仆二次设计：ZipZipPipe，[《AI娘化》p0](https://www.pixiv.net/artworks/148186519)；蓝发、鲸鳍与鲸尾 | CC BY-NC-SA 4.0；本项目该角色重绘沿用署名、非商业、相同方式共享条件；[作者说明](https://www.bilibili.com/video/BV1tE9XBbErS/) |
| `src/assets/pack-avatars/grok.webp` | ZipZipPipe，[《AI娘化》p7](https://www.pixiv.net/artworks/148186519)；金发双马尾、黑红哥特服与 X 形斧饰 | 档案记录作者允许分享与再创作，未核实统一标准许可证；不标作官方 Ani 原图 |
| `src/assets/pack-avatars/gemini.webp` | ZipZipPipe，[《AI娘化》p4](https://www.pixiv.net/artworks/148186519)；蓝紫猫系与四芒星 | 档案记录作者允许分享与再创作，未核实统一标准许可证 |
| `src/assets/pack-avatars/gpt.webp` | ZipZipPipe，[《AI娘化》p3](https://www.pixiv.net/artworks/148186519)；银白龙角、翼、尾与长裙 | 档案记录作者允许分享与再创作，未核实统一标准许可证 |
| `src/assets/pack-avatars/claude-code.webp` | ZipZipPipe，[《AI娘化》p2](https://www.pixiv.net/artworks/148186519)；橘发、日芒饰物、米白黑服装，改绘编码手册与小型橙色蟹状挂饰 | 档案记录作者允许分享与再创作，未核实统一标准许可证；未嵌入官方 Clawd 位图 |

ZipZipPipe 的分享与再创作说明来源为[《“亿万”身家的她们》简介](https://www.bilibili.com/video/BV1bARXBYEZz/)。上述说明不把第三方角色、名称、商标统一授权为 MIT 或 CC0。角色设计参考所附条件不因生成重绘而被删除。

生成使用 `image_gen`，每位角色单独生成透明底全身立绘；MiMo 另做一次透明边缘清理。提示词存于 `docs/pack-avatar-prompts.json`。发布图片保留原始像素尺寸和 alpha，仅编码为 WebP（quality 90）以减小加载体积，总计约 2.4 MB。

## 验证

- `npm run test:quality`：六档、评分边界、混包最高档、待评估、旧 SSR、读写同步、LLM 和战斗展示。
- `npm run test:tear`：任意位置/方向、反向剥离、回退、触边阈值和确定性轨迹。
- `npm run build`：前端集成与全部资源打包。
- 后端相关 pytest：六档序列化、LLM、同步、云卡展示与剧情兼容。

开发环境中的 Chromium 因系统 socket 限制不能启动，因此本轮没有完成真实 WebGL、桌面或触摸设备的视觉验收。已完成角色 alpha/成品图检查、组件 SSR、Canvas 文案检查和相机投影检查；这些检查不替代实机交互验收。
