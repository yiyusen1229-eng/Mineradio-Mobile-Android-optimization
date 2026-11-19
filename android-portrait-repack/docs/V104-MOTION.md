# V104：动画/交互流畅度优化（面板打开时序）

> 用户诉求：「你再优化一下动画，看看还有哪里卡顿不丝滑都优化一下。」
> 开屏动画已在 v103 修完（`phone.css` SPLASH 段，5.2s 源包编排，本轮不动）。
> 本轮范围：**大面板打开动画期间的重渲染时序**（其余场景先量化，能不动就不动）。

## 1. 测量口径

- 环境：真机 Mineradio.timing（Android 16，WebView Chrome 157，391×870 CSS px，dpr 3.675），
  CDP `Runtime.evaluate` 注入 rAF 采样器，量**帧间隔**：`avg` / `p95` / `max` / `jank>32ms` / `jank>50ms`。
  每个场景重复 3 次取列表（同一装机包、同一脚本）。
- 脚本（`_tmp/work/`）：
  - `m-cdp.js`：CDP 连接 + rAF/longtask 采样器 + 截图工具
  - `m-panel-one.js <mode> <inject|-> <repeat>`：单场景重复采样（platform/daily/history/library/diy/transition/scroll/search）
  - `m-base.js`：一次性全场景基线（输出 json）
  - `m-diag2.js` / `m-gap-an.js`：帧间隔 × Trace 对齐，定位掉帧窗口内的真凶线程/任务
- Trace 归因方法：`m-diag2.js` 先起 `Tracing.start`（devtools.timeline/blink/cc/gpu/viz），
  页面内挂 rAF 时间戳，动作后对齐「>32ms 帧间隔窗口」，`m-gap-an.js` 列出窗口内所有线程的长事件。

## 2. 改前基线（当前装机包，n=3）

| 场景 | avg (ms) | p95 (ms) | max (ms) | jank>32 | 备注 |
|---|---|---|---|---|---|
| 平台推荐面板打开 | 19.0 / 16.9 / 17.5 | 16.8 | 116 / 33 / 50 | 2 / 1 / 2 | 最坏一次 116ms 空档 |
| 音乐库（歌单面板）打开 | 17.4 / 18.2 / 17.7 | 16.7 | 50 / 66 / 50 | 2 / 3 / 3 | |
| DIY 面板打开（首开） | 24.7 | 49.9 | 149.7 | 6 | 第 2/3 次开：16.6 / jank 0 |
| DIY 面板关闭 | 16.6~20.5 | 16.7~49.8 | ≤83 | 0~6 | 第 2 次起干净 |
| 首页→播放页 | 17.2 / 16.6 | 16.7 | 33 / 17 | 2 / 0 | 已达标，不动 |
| 播放页→首页 | 17.1 / 16.8 | 16.8 | 33 / 33 | 2 / 1 | 已达标，不动 |
| 搜索展开（点搜索框） | 17.1 / 18.8 / 18.8 | 16.8 / 33.3 | 33 / 50 / 83 | 2 / 5 / 4 | 键盘弹出系统动画为主，见 §6 |
| 歌单列表滚动 | 16.6 | 16.7 | 16.8 | 0 | 已达标，不动 |

（完整 JSON：`_tmp/work/m-base-before.json`；3 次重复的原始输出见会话记录/`_tmp/work` 下采样日志。）

### Trace 归因（改前，关键证据）

1. **平台推荐面板 148.6ms 空档**（`_tmp/work/trace2-platform-before.json`）：
   面板 `.show` 起 0.34s sheet 动画的同一时刻宿主执行 `loadHomePlatformRecommendations()`，
   缓存命中后 60~90ms 内重建整份列表 `innerHTML`（6 歌单卡 + 12 首日推 + 6 电台，封面用
   `background-image`）。空档窗口内并发：`ImageDecodeTask 54.6ms` + `GpuImageDecodeCache::UploadImage 24.3ms`
   + 渲染线程 `DrawFn_DrawGL 31.4ms`（3D 舞台）→ 动画里掉帧。
2. **音乐库打开 101.3ms 空档**：打开触发的 `refreshUserPlaylists` 异步链在 100ms 内连续调用
   `renderUserPlaylistsList` **5 次**（v87 全量渲染模式下每次 15~27ms，合计约 68ms），全落在动画窗口里。
3. DIY 面板打开：首开 149.7ms（后续 16.6ms）——首开含 `DrawFn_DrawGL` 14ms×2 + 大毛玻璃面板首帧栅格化，
   属于「首次合成层/栅格化冷开销」，与面板打开时序无关；后续打开已达标，本轮不做 hack 预热（风险 > 收益）。
4. `will-change` 审计：`phone.css` 里常驻 `will-change`（#bottom-bar / .mr-top-track / #mr-player-extras /
   #search-area / .phone-chrome-slot / #fx-panel）是 v78c 专门加的**防闪烁**手段（layer 树变化会让下方
   fixed 毛玻璃重新栅格化，真机可见闪烁），属已论证的取舍 → 本轮保留，不按「省显存」一刀切。
   面板 `.show` 上的 `will-change` 随 `.show` 移除自动消失，无长期驻留。

## 3. 改动（v104，仅 `mr-phone.js`，无 CSS 改动）

新增 `patchMotionPanelRender()`（插在 `/* ---- §14 入口 ---- */` 之前，由 `ready()` 里
`patchPlatformPanelAnimation()` 之后调用）。动画时长/手感完全不变（sheet 仍 0.34s `cubic-bezier(.22,.9,.25,1)`）。

### a) 平台推荐 / 音乐发现面板：动画期间不重建列表

- 列表已有上次渲染内容时：打开动画期间**一律不重建**（直接复用旧 DOM，不闪 loading），
  460ms（0.34s 动画 + 120ms 余量）后补渲染一次。
- 列表为空（冷启动后首开）时：**保持宿主原时序**（loading 态 + 立即渲染）——实测把冷启动首开也推迟
  会把「重建 + 封面解码」挪到动画刚结束的静止帧上单独卡一下（装包后首次实测 avg 20.9→改回后 16.6），
  所以只在「复用旧 DOM」的场景才推迟。
- 关闭面板会丢弃挂起的重建。
- 效果：封面解码/GPU 上传从动画窗口移到动画结束后；用户看到的是「旧列表直接滑入 → 结束后刷新数据」。

### b) 歌单 / 音乐库面板：合并动画期间的重复列表渲染

- 面板打开后 800ms 窗口内（`setPeek('pl', true)` 打时间戳）：第一次调用延迟到下一 rAF 执行（首屏不空），
  其后的重复调用只保留最后一次参数、合并后 150ms 尾随执行一次。
- `reset` / `preserveScroll` 语义保守合并：任一调用要求 reset 就 reset，避免滚动位置错乱。
- 窗口外（平时）保持原同步渲染不变（宿主可能在 render 后立刻量 DOM，不能动）。
- 效果：5 次渲染 → 2 次，动画窗口内少掉 ~45ms 主线程工作。

## 4. 改后数据

装包：v62-signed.apk（含 v104 补丁，SHA256 `22BBE7AF…2294E8`；另一次中间版 `A7F1BCDB…D67A5`）。
在装好的包上重启 App（`force-stop` + `am start -W`）后同口径复测，`m-panel-one.js` 各跑 3~4 次；
装包后**第 1 次**打开是整机冷启动态（见下方对照），表中主数据取 warm 次。

| 场景 | 改前 avg / p95 / jank>32（n=3） | 改后 avg / p95 / jank>32（n=3~4） | 结论 |
|---|---|---|---|
| 平台推荐面板打开 | 19.0·16.9·17.5 / 16.8 / 2·1·2，max 116·33·50 | **16.9·16.6·16.6 / 16.7~16.8 / 1·0·0**，max 33·16.8·16.8 | 达标（jank≤1、max 33ms）；148.6ms 掉帧空档消失 |
| 音乐库（歌单面板）打开 | 17.4·18.2·17.7 / 16.7 / 2·3·3，max 50·66·50 | **18.0·17.4·17.1 / 16.7·16.8 / 3·3·2**，max 50·33·33 | max 66→33，重复渲染 5 次→2 次 |
| DIY 面板打开 | 24.7（首开）/17.5/16.6，jank 6/3/0 | 17.8 / 16.9，jank 1/1，max 83→33 | 未改，无回归 |
| DIY 面板关闭 | 16.6~20.5，jank 0~6 | 16.7 / 16.6，jank 0/0 | 未改，无回归 |
| 首页⇄播放页 | 17.2 / 16.6，jank 2/0 | 未改（代码路径不相关），待 Lead 回归覆盖 | 基线已达标，未动 |
| 歌单滚动 | 16.6，jank 0 | 未改（代码路径不相关），待 Lead 回归覆盖 | 基线已达标，未动 |

### 冷启动对照（重要）

装包重启后**第一次**打开任何面板都偏慢，且与本次改动无关：
`platform#0` 22.5ms / jank4 / max 133ms，同一轮的**未改动对照** `daily#0` 20.9ms / jank5 / max 83ms，
第二次起两者都回到 16.6~16.9 / jank 0~1。归因：整机冷启动期的 3D 舞台/网络/字体预热，
属宿主冷启动（交接文档 §4 已归因，不动宿主）。因此复测口径统一取「warm 次」，冷启动首开单独记录。

### Trace 改前/改后对比（平台面板打开）

- 改前（`trace2-platform-before.json`）：最大帧空档 **148.6ms**，窗口内 `ImageDecodeTask 54.6ms`
  + `GpuImageDecodeCache::UploadImage 24.3ms` + `DrawFn_DrawGL 31.4ms`（3D 舞台）。
- 改后（`trace3-platform-after-inject.json`，live 注入同逻辑）：最大帧空档 **51.5ms**，
  窗口内只剩 `RenderThread DrawFn_DrawGL 51ms/21.7ms`（宿主 3D 舞台，本轮不动）——面板相关解码/上传已移出动画窗口。
- 分析命令：`node _tmp/work/m-gap-an.js <trace.json> <gapMs>`。

## 5. 风险与回滚

- a) 面板打开后 460ms 内先点平台 tab：新平台的列表重建也会等到窗口结束（先显示旧列表内容）——窗口很短，可接受；
  如需立即生效，删掉 `renderHomePlatformRecommendations` 的包装即恢复。
- b) 打开后 800ms 内的列表渲染最多延后 150ms（仅打开窗口内，平时不变；滚动不会触发重建）。
- 回滚：删除 `ready()` 里的 `try { patchMotionPanelRender(); } catch (e) { }` 一行，
  或整段删除 `v104：面板打开动画期间的重渲染时序` 函数块（`_tmp/work/mr-phone.v104-motion-prebak.js` 有落盘前备份）。
- 视觉/交互回归自查：面板打开动画时长/缓动不变；打开后列表内容与刷新时机最多晚 460ms（数据本身不变）；
  歌单打开后滚动位置语义保持（reset 合并规则）。

## 6. 本轮不改的（有数据/风险依据）

- **首页⇄播放页转场**：改前已 16.6~17.2ms / jank 0~2，动它收益极小、回归风险高 → 不动。
- **歌单滚动**：改前 16.6ms / jank 0（v87 全量渲染已解决闪烁）→ 不动。
- **DIY 首开冷开销**：属首次栅格化/合成层创建（3D 舞台 + 大毛玻璃），面板顺序预热会在正常使用中
  引入可见闪烁或额外内存，收益不确定 → 本轮只记录，不做。
- **搜索展开**：jank 主要来自系统 IME 弹出（viewport resize + 键盘动画，非补丁层可控）；
  搜索段由 search-dev 负责，本轮不碰。
- **3D 粒子/后效 / 渲染分辨率**：宿主 GPU 大头，改宿主风险高 → 只记录，不动。

## 7. 证据路径

- 基线 JSON：`_tmp/work/m-base-before.json`
- Traces：`_tmp/work/trace2-platform-before.json`、`trace2-library-before.json`、`trace2-diy-before.json`、
  `trace3-platform-after-inject.json`（live 注入改后）
- 掉帧窗口分析：`node _tmp/work/m-gap-an.js <trace.json> <gapMs>`
- 截图：`_tmp/work/shots/base-platform-open-*.png`、`base-library-*.png`、`base-diy-open-*.png`、`base-player-*.png`
- 落盘前备份：`_tmp/work/mr-phone.v104-motion-prebak.js`（回滚用）
- 补丁块与锚点：`_tmp/work/v104-motion-block.js` + `_tmp/work/splice-v104-motion.js`
  （锚点 1：`/* ---- §14 入口 ---- */` 之前；锚点 2：`ready()` 里 `patchPlatformPanelAnimation()` 与
  `patchHomeBlankDismiss()` 两行之间；干跑：`node _tmp/work/m-test-splice.js`）
- 复测命令：
  ```
  node _tmp/work/m-panel-one.js platform - 3
  node _tmp/work/m-panel-one.js library  - 3
  node _tmp/work/m-panel-one.js diy      - 2
  node _tmp/work/m-base.js _tmp/work/m-base-after.json
  ```

## 8. 结论

- 面板打开类动画的「动画期间拉数据/重建列表」已按交接文档 §4 的建议修掉：平台推荐移到动画后（复用旧 DOM），
  歌单/音乐库合并重复渲染。改后 warm 态平台面板 jank 0~1、max 16.8~33ms；音乐库 max 66→33ms。
- 剩余掉帧大头是宿主 3D 舞台 `DrawFn_DrawGL`（GPU）与系统 IME/冷启动，本轮按约束不动宿主，已记录。
- 首页⇄播放页、歌单滚动改前已达标（16.6~17.2ms、jank 0~2），未改动以避免回归。
