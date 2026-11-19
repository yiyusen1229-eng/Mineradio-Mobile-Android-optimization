# V104 搜索问题修复（search-dev）

> 用户反馈：「很多歌明明有，但我一输入就搜索框显示没有找到相关歌曲。」
> 结论：**搜索层本身能拿到结果，是被三层缓存 + 酷狗串行预算 + 空态语义一起压成了空**。
> 本轮（v104）在 v104-net 删掉 v88 缓存层（P1）之后，重写搜索渐进策略 + 空包策略 + 失败语义。

## 1. 真机现象（改前）

设备：OnePlus 24031PN0DC / Android 16 / WebView 157，包名 `Mineradio.timing`，跨柏林→国内网络（RTT ~350ms）。

| 时间点（输入后） | 五月天（改前，v88 旧缓存有毒） | 夜に駆ける/告白气球/残酷な天使（P1 后、清缓存） |
|---|---|---|
| 0.3s | 上一轮结果/「正在搜索」 | 「正在搜索」 |
| 1s~4s | 无变化 | 无变化 |
| 6.5~8s | **「没有找到相关歌曲」，playlist=0** | 无变化 |
| 13s~15s | 「没有找到相关歌曲」 | 仍是 0 条（`firstResultMs=null`） |

对照：直接打接口（带 `mrrerun` 绕过缓存）网易云 `五月天` 677ms/18 首，酷狗热词常 12s 超时。
即「歌一定有」，但 UI 显示没有。

## 2. 根因（三条独立问题叠加）

### 2.1 v88 localStorage 缓存层把「超时哨兵」当结果缓存了 6 小时（由 v104-net P1 删除）

- 旧 `patchApiCache()`（改前 mr-phone.js 约 4086-4129 行，localStorage `mr-api-cache:<url>`，TTL 6h）**不区分 JSON 内容**，`res.clone().json()` 后直接落盘。
- v94 缓存层（`installApiFetchCache`）在搜索超过 12s（`SEARCH_TIMEOUT=12000`）时会返回
  `{ok:false, error:'MR_SEARCH_TIMEOUT', songs:[]}` 哨兵。哨兵只要经过 v88 层一次，就被写成
  `mr-api-cache:/api/search?keywords=五月天...`，之后同一关键词 **2~4ms 秒回空包**。
- 真机 dump：259 条 `mr-api-cache:` 里 109 条是搜索，多条是上述哨兵；`林俊杰`/`Aimer`/`告白气球` 均被污染。
- 这直接解释了用户说的「**一输入就**显示没有找到」——因为命中旧缓存只要几毫秒，连「正在搜索」都一闪而过。

### 2.2 v94 缓存层也把 `songs:[]` 空包缓存了 20 分钟

- mr-phone.js `installApiFetchCache()` 原来只过滤 `MR_SEARCH_TIMEOUT` 哨兵，不过滤 `songs:[]` 的真空包；
- 一旦某次搜索（因为酷狗慢/网络抖）拿到空包，20 分钟内同关键词都命中空包——即使网络早已恢复。

### 2.3 渐进搜索「酷狗串行 + 6.5s×2」+ 空态语义错误

- 旧 `patchProgressiveSearch()`：先 `await` 酷狗 6.5s；空包再带 `mrrerun` 重试 6.5s；再串行等其它平台 6s。
  冷缓存时**最长 19s 空白**；且如果其它平台也判空，就直接返回 `songs:[]`。
- 宿主 `doSearch()`（`05-playback/07-search.js:1326-1333`）对 `songs.length===0` 只有一个分支：
  `searchProviderNotice || '没有找到相关歌曲'`。补丁层从不区分「超时/网络失败」和「真没有」，
  于是所有失败都显示成误导性的「没有找到相关歌曲」。

## 3. 改法（只改 `patch-layer/web/mr-phone/{mr-phone.js,phone.css}`）

### 3.1 搜索空包：不写、不读、不缓存（mr-phone.js）

新增 `mrSearchPayloadSongs(data)` / `mrSearchPayloadEmpty(data)`（兼容 `songs`、`tracks`、
`value.songs`、`result.songs`、`data.songs` 五种形状）。在 `installApiFetchCache()` 里：

- `kind==='search'` 时空包/错误包 → **永不写 mem/IndexedDB**；
- 内存或 IDB 命中空包 → **视为未命中并清掉**，重新请求；
- `normalizeCacheKey()` 把 `mrrerun` 也归一化掉；带 `mrrerun` 的请求**只跳过读缓存**，
  成功结果仍写回归一化 key——这样 cache-buster 重取既能绕过旧空包，又能让下一次搜索命中新结果。

### 3.2 渐进搜索重写（`patchProgressiveSearch`）

| 阶段 | 行为 |
|---|---|
| 第一轮 | 6 个平台（netease/qq/kugou/qishui/bodian/ytm）**同时**发；酷狗 3.8s 预算，其它 10.5s；**谁先有 songs 先渲染**（首屏 ≤4s，健康网络实测 0.3~0.6s） |
| 4s 仍未出歌 | 不判空：DOM 换成「网络较慢，仍在搜索 “q”… + 点此重试」，**继续等第一轮在途请求**到 11.2s（跨网实测网易云 `夜に駆ける` 偶发 11.6s 才回；低于缓存层 12s 哨兵） |
| 后台补齐 | 首屏用到的平台之外的平台继续在后台拉，`mrMergeBackgroundSearch` 增量 append（复用 v94，不重排、不闪烁） |
| 自动重试 | 只有**快速失败**（全部平台在 2.6s 内返回错误/空包，典型是旧空包缓存残留）才带 `mrrerun` 自动重试一次（4s） |
| 空态判定 | 只有「所有平台都**正常**返回空」→ 显示宿主原生「没有找到相关歌曲」；任何超时/错误/空包 → `outcome.failed=true`，`searchProviderNotice='网络较慢，点此重试'` |
| 翻页 | `previousPages` 存在时仍走宿主原逻辑（首屏已出，翻页慢不影响） |

`window.__mrSearchOutcome` 记录 `{q, key, t0, anySongs, failed, autoRetried, doneMs}`；
`window.__mrSearchBust` 由重试按钮写入，渐进搜索消费一次（全平台带 `mrrerun`）。

### 3.3 失败语义 / 可重试（`patchSearchFailSemantics` + phone.css）

- 包装 `window.doSearch`：完成后若 `outcome.failed`，把宿主的 `.search-empty` 换成
  `网络较慢，没能加载到歌曲 / 点此重试（+ 已自动重试过一次）`；点击按钮 → `__mrSearchBust=Date.now()` 重搜；
- 慢网络中间态 `.mr-search-slow`（4s 提示）同样可点重试；
- `phone.css` 末尾新增 v104 段（与 4UI 风格对齐的 12px 圆角深色玻璃按钮，40px 高、13.5px 字）。

### 3.4 保持不动的既有行为

- v94 酷狗优先的「缓存命中仍秒回」、`appendsNextSearchResults` 增量补齐不闪烁 → 保留；
- v95 起播期歌词延迟（`mrWaitPlayStarted`）、v102 面板预热 → 未触碰；
- 音/译注音段、SPLASH 段 → 未触碰；
- v88 缓存层删除与旧键迁移 → v104-net P1，本轮只依赖不重复改。

## 4. 改前 / 改后数据（真机，CDP `_tmp/work/srch-bench.js`）

改前（P1 装机后的包，`srch-before-8kw.json`）：

| 关键词 | firstResultMs | 结果数 | 备注 |
|---|---|---|---|
| 五月天 | 337 | 26 | 缓存/native 热 |
| 林俊杰 | 226 | 12 | |
| Aimer | 232 | 12 | |
| 周杰伦 | 220 | 12 | |
| 千本桜 | **6860** | 10 | 酷狗 6.5s 预算打满 |
| 夜に駆ける | **null（15s+）** | **0** | 空白 |
| 告白气球 | **null（15s+）** | **0** | 空白 |
| 残酷な天使 | **null（15s+）** | **0** | 空白 |

改后（本轮 APK，清 v94 mem+IndexedDB 后首搜，`srch-after2-8kw.json`）：

| 关键词 | firstResultMs | 结果数 | providerPages |
|---|---|---|---|
| 五月天 | 334 | 18 | 全 6 平台 |
| 林俊杰 | 306 | 18 | 全 6 平台 |
| Aimer | 503 | 18 | 5 平台 |
| 周杰伦 | 502 | 18 | 5 平台 |
| 千本桜 | 520 | 10 | kugou |
| 夜に駆ける | 519 | 18 | qishui+bodian |
| 告白气球 | 503 | 18 | netease+kugou+qishui+bodian |
| 残酷な天使 | 526 | 12 | qishui |

改后二次搜索（走 v94 缓存，`srch-after2-cache-8kw.json`）：301/303/504/449/502/464/441/506ms，全部有结果。

> 注意：改后数值是「同一网络时段、同一 native 进程」下测得；跨网波动极大
> （同一关键词 0.3s ~ 11.6s 都出现过）。**判定标准**：有歌必出结果 + 无「没有找到相关歌曲」误报，
> 而不是死磕固定毫秒数。

## 5. 坑 / 注意事项

1. **`mrrerun` 不要放进「丢弃参数」白名单后仍读缓存**：正确姿势是「归一化 key（保证写回可复用）+
   请求带 mrrerun 时跳过读」，两者同时做。
2. **apiJson 的 `timeoutMs` 只 abort 请求，不会取消底层 native 请求**：被放弃的请求仍可能在
   11~12s 后返回并被 v94 缓存（这是「下次搜索突然变快」的原因之一，可接受但别依赖）。
3. **不要用 `innerHTML.indexOf('search-empty')` 判断空态**：宿主的「继续滚动加载」哨兵本身带
   `search-empty search-load-more` class。判断真空态要取
   `#search-results .search-empty:not(.search-load-more)` 且 `.search-result` 数量为 0。
4. **v88 的 fake Response 没有 `Headers.forEach`**：一旦 `r.headers.forEach` 报错，说明命中的是
   v88 那层（已在 P1 删除）；用 `r.headers.get()` 相对安全。
5. **慢网络别报复性重试**：6 平台 × 2 轮并发在 native 桥排队时会互相拖慢，只对「快速失败」自动重试。
6. 清缓存要三处一起清：`__mrApiCacheState.mem`、IndexedDB `mr-api-cache-v2`
   （注意旧连接会 block delete，脚本里要兜底）、localStorage `mr-api-cache:*`（P1 迁移会清）。
7. 跨网下「网易云 677ms」只是理想值；本机实测同一关键词冷请求 1.1s ~ 11.6s 波动，
   所以第一轮预算设到 11.2s，但首屏仍按「谁先回谁先渲染」抢时间。

## 6. 复现 / 验收脚本（`_tmp/work/`）

- `srch-bench.js`：8 关键词基准，走真实用户路径（`input` 事件 → 宿主 180ms debounce → doSearch），
  100ms 轮询首条结果/空态/重试 UI；`node srch-bench.js out.json "关键词1,关键词2" --clear`
- `srch-before-8kw.json` / `srch-after-8kw.json` / `srch-after2-8kw.json` / `srch-after2-cache-8kw.json`：三次对比数据
- `srch-cache-dump.js`：v94 mem+IDB 中搜索缓存条目（关键词/结果数/年龄）
- `srch-installed-src.js`：从运行中的页面 dump `window.fetchMusicSearchResults` 源码，确认装机包版本
- `srch-provider-latency.js` / `srch-fail-diagnose.js` / `srch-netease-long.js`：单平台时延诊断
- `srch-clear-and-test.js`：清三层缓存后首搜时序（0.3/1/2/4/8/13s DOM 快照）

## 7. 遗留

- 回归 `_tmp/verify2/regress-v78.js` 23/23 ×2 待手机窗口（motion-dev 用完后补跑）。
- 宿主的「继续滚动加载更多」在首屏只拿到单平台时仍可用，多平台后台补齐后 `remoteHasMore` 由
  `mrMergeBackgroundSearch` 更新（与原 v94 行为一致）。
- 搜索接口本身跨网时延波动大（0.3s~11.6s），后续若要再压，可考虑在 WiFi/移动网切换时重新预热
  `mrWarmConnections`，或对高频关键词做「结果数>0 才缓存」的短 TTL（已满足：空包不缓存）。
