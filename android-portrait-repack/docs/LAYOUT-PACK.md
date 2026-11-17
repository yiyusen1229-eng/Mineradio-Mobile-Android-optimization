# v8：队列面板 / 播放条 / 搜索浮层 / 视觉引导 修复

## 修了什么

| 页面 | 问题 | 处理 |
|---|---|---|
| 歌单 / 队列 | 面板 398px 宽、比屏幕宽；header 与列表重叠；「随机」被切；列表区是浮层 | 面板固定为屏幕内整块（`top:10px` / `bottom:150px` / 左右 8px），圆角 18、不透明背景；header 改普通流；tabs 一行四个（字号 12）；列表 `flex:1 + overflow-y:auto` |
| 播放条 | 桌面三栏 grid（310+344+230px）在 391px 宽下互相重叠：歌曲行压在播放键上 | `#bottom-bar` 复位 `transform`（否则 `left/right` 会被 `translateX(-50%)` 拉到屏幕外），改纵向 flex：进度条 → 歌曲行（封面/标题/歌手）→ 控制行；隐藏不可用的 actions 按钮 |
| 搜索浮层 | 结果列表半透明，首页内容透出来；列表不到底 | `#search-area` 左右 8px；`.has-results` 时结果块不透明、`height:calc(100dvh-220px)`、内部滚动 |
| 视觉引导（新手 6 步） | 卡片半透明，后面的首页卡片/时间透出来，看起来像文字重叠 | 卡片背景改不透明深色；遮罩加深到 72%；隐藏高亮环（位置按桌面坐标算的，手机上指错） |
| DIY 浮动按钮 | 压住首页卡片 | 隐藏浮动按钮，改从右上「…」菜单进（新增「DIY」项） |
| 右上「…」 | 搜索/队列/登录/引导打开时压在弹层上 | 用 `:has()` 在这几种状态自动隐藏 |

## 真机验证（Xiaomi 14 Ultra，391×870）

- 歌单/队列：面板铺满、tabs 一行、列表可滚动、与播放条不重叠
- 播放中：封面粒子背景 + 歌词 + 播放条（进度 / 歌曲行 / 控制行）三段清晰，无重叠
- 搜索：不透明结果面板，可滚动
- 开屏：Mineradio 拼字正常
- 首页：右上「…」菜单 = 首页 / 登录 / DIY

截图：`verify/repack-queue.png`、`verify/repack-playing.png`、`verify/repack-search.png`、`verify/repack-home.png`

## 产物

`dist/Mineradio-portrait-repack.apk`（v8，同签名覆盖安装，数据保留）
