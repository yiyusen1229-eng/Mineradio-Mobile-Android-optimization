# V104-NET：网络再优化（起播 / 歌词 / 封面 / 连接复用）

- 日期：2026-11-19
- 负责人：net-dev（task-5）
- 仓库：`E:\IDM下载目录\DSH工作产生文件\Mineradio-paused`
- 改动文件：`android-portrait-repack/patch-layer/web/mr-phone/mr-phone.js`（只动网络/缓存段）
- 真机：`bdaae556`（Mineradio.timing），网络柏林→国内 ~350ms RTT
- APK：
  - v104a（仅 P1，拆 v88 缓存层）`_tmp/build-v62/v104a-p1-signed.apk`，SHA256 `9E0CAFFD…A8C0`
  - v104b（P1+P2+P3，当前工作树）`_tmp/build-v62/v104b-p2p3-signed.apk`，
    SHA256 `9C36E29BA5753E12D21111F2C50AC4442868CE44B778A20327C0DEB5B5765A10`（75,968,319 B）
- 证据目录：`_tmp/work/v104-*`（脚本 + JSON）

---

## 0. TL;DR

| # | 改动 | 类别 | 收益（真机） | 风险 |
|---|------|------|--------------|------|
| P1 | 删除 v88 `patchApiCache`（localStorage `/api` 缓存，TTL 6h、失败/空包也缓存）+ 启动迁移清理旧键 | 正确性 | 搜索超时哨兵不再被缓存 6h → 「明明有歌却搜不到」的另一半根因；省 652KB localStorage | 低（旧缓存本就是脏数据） |
| P2 | 网络计时真实化（原 t0 取在 await 之后 → 全部记 0ms）、歌词/取址分 kind TTL、失败包不入缓存 + 短负缓存、同 URL 并发合并、CDN 过期地址作废、下一首歌词/封面预取 | 性能+正确性 | 见第 4 节数据 | 中低（已做失败兜底与 TTL 回落） |

---

## 1. 测点与工具

真机上页面是「APK assets 里的宿主 + `mr-phone.js` 补丁层」，`/api/*` 由 `android-shim/10-api-router.js`
在 `window.fetch` 层拦下，再走原生桥（Capacitor `FoliaBridge.request`）去打各平台真实接口。
所以浏览器到 `https://localhost` 的耗时≈JS 开销，真实网络耗时全在原生桥里，必须用页面内计时而不是 DevTools。

测点：
1. `/api/{平台}/song/url`（起播取址）：单次耗时、缓存命中；
2. 起播：点播放/下一首 → `audio.playing` 事件；
3. 换歌：下一首 → playing（含取址缓存命中/未命中）；
4. 歌词：`/api/lyric` 耗时 + `setOriginalLyricsState` 应用时间；
5. 封面：`__mrLoadCoverObjectUrl`（原生桥取字节→dataURI）耗时；
6. 连接复用/并发：连续 3 条、并发 3 条、同 URL 并发 2 条的唯一 URL 请求（`mrrerun` 破缓存）；
7. 缓存健康：`localStorage` 里 `mr-api-cache:` 旧键数量、`__mrLegacyApiCachePurged`、`__mrNetSummary()`。

工具（`_tmp/work/`）：
- `v104-net-measure.js`：CDP 测量器（`state` / `conn` / `play` / `all` 四个阶段，输出 JSON）；
- `v104-verify-p1.js`：P1 迁移/缓存层健康校验；
- `v104-legacy-cache-inv.js`：旧 v88 缓存清单（改前证据）；
- `patch-v104-net-p1.py` / `patch-v104-net-p2.py`：精确替换块脚本（可 `--check` / `--apply` / 回滚）；
- 前置：`adb shell pidof Mineradio.timing` → `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`。

---

## 2. 改前证据（真机 dump，2026-11-19 01:30）

`localStorage` 共 323 键，其中 **259 条是 v88 的 `mr-api-cache:`（652,466 字节）**，按 kind 分布：

| kind | 条数 |
|------|------|
| search | 109 |
| other | 66 |
| status | 51 |
| lyric | 17 |
| songurl | 13 |
| playlist | 3 |

其中被 **v94 明确拒绝缓存的搜索超时哨兵**（`{ok:false, error:'MR_SEARCH_TIMEOUT', songs:[]}`）被 v88 层按 6h TTL 存了下来，样例（写入时距今）：

| key | 年龄 | 内容 |
|-----|------|------|
| `mr-api-cache:/api/qq/search?keywords=YOASOBI&limit=12&offset=0` | 2338s | `MR_SEARCH_TIMEOUT` songs:0 |
| `mr-api-cache:/api/search?keywords=告白气球&limit=18&offset=0` | 1309s | 同上 |
| `mr-api-cache:/api/search?keywords=五月天&limit=18&offset=0` | 1270s | 同上 |
| `mr-api-cache:/api/search?keywords=林俊杰&limit=18&offset=0` | 1263s | 同上 |
| `mr-api-cache:/api/qishui/search?keywords=Aimer&limit=12&offset=0` | 1255s | 同上 |
| `mr-api-cache:/api/bodian/search?keywords=Aimer...` | 1255s | 同上 |

失败链条（与 Lead 的 dump / 搜索现象一致）：
1. 酷狗慢/超时 → v94 12s 硬超时生成哨兵 `{error:'MR_SEARCH_TIMEOUT'}`；
2. v94 自己 `isSentinelPayload()` 拒绝缓存，但 **v88 层（内层）照样写 localStorage，TTL 6h**；
3. 之后同关键词请求：v94 未命中 → 落到内层 v88 → **2~4ms 返回 fake Response 哨兵（无 `X-MR-Cache` 头）** → 宿主渲染「没有找到相关歌曲」。

---

## 3. 改法

### P1（已落盘，v104a）

- 整段删除 `patchApiCache()`（原 4086-4129 行）与启动调用点（原 4701 行）；
- 新增 `mrMigrateApiCacheV104()`：启动时一次性删除 localStorage 里所有 `mr-api-cache:` 前缀键，
  写版本标记 `mr-api-cache-migrate-v104`（避免每次扫）；可重复调用（幂等）；
- 唯一 `/api` 缓存层 = v94 `__mrApiCacheState`（mem + IndexedDB `mr-api-cache-v2`，TTL 20min）；
- **不动** `kind==='search'` 的空包/TTL 判定（search-dev 负责）；
- `MR_LS_PRUNE_KEYS` 里的 `mr-api-cache:` 项保留（降级回旧版再升级时的残留兜底）。
- 备份：`mr-phone.js.bak-v104net-p1`。

### P2（补丁脚本已备，v104b）

1. **计时真实化**：原 `__mrNetT0b` 在 `await fetch` 之后才取 → 面板所有请求记 0ms；
   改为进入 `fetch` 即 `tReq`，区分 `mem / db / neg / net / err / timeout` 记录，并统计
   `hits{mem,db,neg,like}`、`dedupe`、`negStore`；面板显示真实平均耗时（按 kind）。
2. **`classify()` 补 `lyric`**（原来歌词全归 `other`，无法按 kind 定 TTL/统计）。
3. **失败包不入缓存**：`song/url` 无 `url`（如 `url_unavailable`）、歌词空包不再进 mem/IndexedDB
   （原来会被当正常结果缓存 20min）；改存短负缓存（取址 90s / 空歌词 120s），
   宿主 fallback 重试命中负缓存可省一次完整往返，90s 后自动放开避免「平台恢复后仍拿旧失败」。
4. **分 kind 落盘 TTL**：song/url 6min（CDN 签名地址会过期；内存仍 10min）、歌词/其它 20min。
5. **同 URL 并发请求合并**（songurl/lyric）：下一首预解析与用户立刻点播放会同时打同一条取址，合并成一次真实往返。
6. **过期地址作废**：audio 播放 `error` 且 `currentSrc` 命中缓存里的 `d.url` → 删 mem/IDB/负缓存，
   防止拿同一过期 CDN 地址反复起播失败。
7. **下一首歌词/封面预取**（playing 后 2.3s / 2.8s，给起播让路）：
   - 歌词：用宿主 `lyricEndpointForSong(next)` 同源 URL 预取 → 走缓存层，切歌时 0ms 命中；
   - 封面：`__mrLoadCoverObjectUrl(songCoverSrc(next,400))` 预取 → shim 内 24 条 dataURI 缓存，切歌秒显。
8. **机器可读统计**：`window.__mrNetSummary()`（真机验证/回归脚本不用解析面板 DOM）。

P2 未做/放弃：
- `/api/plugins/list` 每 5s 轮询：宿主 `modules/12-plugin-runtime.js` 的
  `setInterval(pollLoginPluginStatus, 5000)`，补丁层无法安全摘除；但它走 normalized key
  命中 mem 缓存（~0ms、无网络，20min 才真打一次），不划算动。
- 连接预热保留原状（3.2s/3.8s 各一次轻搜索）——是否调整取决于第 4 节「连接复用/并发」实测。

### P3（可选，已落盘，v104b）

冷启动空闲期预取「当前曲」播放地址（宿主 `resolveAlbumGaplessPlaybackData(current)`）：
启动后 4.5s / 9s 各一次（同一首只打一次），满足「页面可见、队列已恢复、非本地歌、
当前没在播、用户不在起播（`mrPlayPending.at==0`）」才打；与宿主解析并发时由 P2 的
同 URL in-flight 合并兜底。收益：冷启动后点播放，取址 0ms（缓存命中），只剩音频下载。
验证：`window.__mrNetStats.bootPrefetch = {key, ms, ok, reason}`。

---

## 4. 改前 / 改后数据（真机实测，2026-11-19 01:56-02:05）

> 口径：同一台真机 `bdaae556`、同一网络（柏林→国内 ~350ms RTT）、最终集成包
> （P1+P2+P3+搜索+动画面板，SHA256 9C36E29B…5A10）。原始 JSON：
> `_tmp/work/v104-state-after-final.json`、`_tmp/work/v104-conn-after-final.json`、
> `_tmp/work/v104-play-after-final.json`。
> 「改前」数字：v94/v95 历史基线（本任务开工时实测线索）+ P1 纯删缓存层等价；本次窗口只
> 拿到最终包，未装 v104a 实体对比（Lead 明确不做来回重装，风险不值当）。

### 4.1 连接复用 / 并发（改后，`conn` 阶段）

| 项 | 改后（最终包） | 结论 |
|----|----------------|------|
| 同 host 连续请求 #1（本次会话首个请求） | **6258ms** | 冷连接 + 服务端冷启动 |
| #2 | **545ms** | 连接复用生效 |
| #3 | **499ms** | 稳定 ~0.5s |
| 并发 3 条不同 URL（同 host） | 454 / 976 / 1393ms，wall **1394ms** | 呈 +~450-520ms 阶梯 → **原生桥基本串行**，并发不省时间、会排队 |
| 同 URL 并发 2 条（P2 去重） | **448 / 448ms**，wall 448ms | 只发 1 次真实往返，P2 `inflight` 合并生效（改前会各打一次） |

**收益**：连接复用确认存在（冷→热 6258→~500ms，约 11.5×）；因此 v94 的 3.2s/3.8s 连接预热
思路有效，但因原生桥串行，预热请求若与用户首操作重叠会互相排队——v105 建议：预热改到
「首操作之后」或按需触发，且不要并发发两条。

### 4.2 起播 / 换歌 / 歌词 / 封面（改后，`play` 阶段 + 网络面板 byKind）

| 项 | 改后 | 说明 |
|----|------|------|
| 起播（冷，清缓存后点播放） | 未直接计时 | 播放器是 `new Audio()` 未挂 DOM，document 捕获不到 `playing`；需直接用 `window.audio` 监听（v105 建议补） |
| 换歌（下一首，P2 预取后） | **2132ms**（1 次可观测样本：click→`window.audio.currentTime>0`） | 期间还并发跑了 kugou/qq login status（8.5s/15.2s）与 beatmap 请求，未拖慢出声 |
| 歌词应用（切歌后） | **30~48ms**（5 次样本） | P2 下一首歌词预取命中；改前冷 `/api/lyric` 单次 ~1.9s |
| 歌词请求真实网络耗时 | 14 次网络 avg **1509ms**（Lead 复核）+ 本次 state 记录 `searchMs` 224~250ms | P2 计时已真实（改前面板记 0ms） |
| song/url 单条网络耗时 | **5801ms**（P3 冷启预取用例；返回无 url 的失败） | 失败路径会跑满预算；P2 已把失败包改为 90s 短负缓存、不进正式缓存 |
| 封面（切歌） | 未直接计时 | 同上（audio 不可探测导致事件链时序无法拼接）；P2 已加下一首封面预取 |

已知遗留（不阻塞发布，记入 v105）：
1) 播放器 `new Audio()` 未挂 DOM → v95/P2 的 `playMs` 面板计时在真机不触发（本次证实）；
   后续应在 `window.audio` 上直接挂 `playing` 事件。
2) 原生桥串行：`/api` 请求并发无收益（3 条 wall = 逐条累加），预取必须错峰；P3 冷启预取
   本次实际耗时 5.8s 且失败（ok=false），会占用串行通道 → **v105 建议默认关闭 P3 或改为
   「打开播放页时才预取」**，本次保留是因为失败/成功都不会阻塞 UI 且脚本可一键回滚。
3) 搜索后台平台仍有 12s 级超时（state 里 search timeout=76、avgNet 11543ms）——属
   search-dev 域；首条结果已 112~610ms（Lead 验）。

### 4.3 缓存健康（改后，`state` 阶段）

| 项 | 改前 | 改后 |
|----|------|------|
| localStorage `mr-api-cache:` 键 | 259（652KB，含 109 条搜索、多条哨兵） | **0** |
| 迁移标记 | 无 | `mr-api-cache-migrate-v104=1` |
| v88 `patchApiCache` / `__mrApiCache` | 存在 | **已删（false）** |
| `__mrNetSummary()` | 不存在 | 存在，字段正常（hits mem 67 / db 43、dedupe、negStore、byKind avgNetMs） |
| 面板请求耗时 | 全 0ms（失真） | 真实 ms（本次 songurl avgNetMs 5801 为首个真值） |
| 搜索哨兵落 localStorage | 会（6h） | 不会（P1 删层 + search-dev 空包不缓存） |

---

## 5. 回归与风险

| 风险 | 说明 | 兜底 |
|------|------|------|
| song/url 缓存过期 | 6min 落盘 TTL + audio error 作废 | 失败后宿主 fallback 重新解析 |
| 负缓存误伤 | 只对「有响应但无 url / 空歌词」生效，90s/120s 后放开 | 平台恢复后自动重试 |
| 并发合并 | 只合并 songurl/lyric 同 URL 在途请求；复用同一 Promise + `clone()` | 任一失败即整体失败，宿主本来有 fallback |
| 预取抢带宽 | 只在 playing 后 2.3/2.8s 打，且切歌点击会重置 | 起播期不预取 |
| 拆 v88 后旧数据 | 迁移清空旧键（652KB） | 首启多一次全量网络，之后正常 |
| 搜索回归 | 只删缓存层，未动搜索策略 | 回归 23/23 由 Lead 跑 |

---

## 6. 复现命令

```powershell
# 装机
$w='E:\IDM下载目录\DSH工作产生文件'
& "$w\_tmp\tools\platform-tools\adb.exe" install -r "$w\_tmp\build-v62\v62-signed.apk"
# CDP 转发
$pid_= & "$w\_tmp\tools\platform-tools\adb.exe" shell pidof Mineradio.timing
& "$w\_tmp\tools\platform-tools\adb.exe" forward tcp:9222 localabstract:webview_devtools_remote_$pid_
# 测量
& "E:\AI\DSH\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" `
  "$w\_tmp\work\v104-net-measure.js" all "$w\_tmp\work\v104-measure-after.json"
```
