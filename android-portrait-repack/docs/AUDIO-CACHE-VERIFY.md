# Mineradio 竖屏版 · 音频缓存验证报告

> 验证对象：本仓库 v80 重打包 APK（`portrait-v80`）
> 设备：OnePlus 24031PN0DC / Android 16 / 1440×3200 / WebView 157
> 方法：CDP + adb 真机实测；宿主缓存 API 逐首探测；断网冷启动实测
> 日期：2026-11-18

---

## 0. 结论（先看这里）

**音频缓存不是"没做"，而是宿主 + 原生层已经完整实现并在工作。** 之前交接文档里
「音频缓存不存在」的判断是**过时/错误**的，本报告更正。

关键实测（本版 APK）：

| 场景 | 结果 |
|---|---|
| 缓存命中后冷启动播放 | **0.31 ~ 2.47s** 出声（含 App 冷启动），音频 **0 个网络请求** |
| 断网（Wi-Fi+数据全关，ping 不可达）冷启动播放已缓存歌 | **0.31s** 起播，本地流正常 |
| 未缓存歌首次播放 | **8.3s** 起播（慢在平台取播放地址），播完自动后台缓存 |
| 重启后同歌 | 命中本地缓存，`127.0.0.1` 本地流，0 请求 |
| 当前缓存占用 | 22 个文件 / **229 MB**（单曲 2~34MB） |

---

## 1. 实现结构

### 1.1 宿主 JS：`js/modules/05-playback/12a-audio-cache.js`（APK 内 `assets/public/js/...`）

- 开关：`localStorage['mineradio-audio-cache-v1'] = {"enabled":true}`（默认开启）
- `mrAudioCacheLookup(provider, song)`：**先查缓存再取地址**；命中直接返回本地流 URL，
  连 `/api/<平台>/song/url` 都不发（"零请求起播"的来源）
- `mrAudioCacheWarm(provider, song, remoteUrl)`：没命中时照常联网播放，**播放开始后在后台下载**缓存，
  失败静默、不阻塞播放
- `mrAudioCacheQueueNextSongs()`：播放开始 3s 后预取**下 3 首**（`MR_AUDIO_PREFETCH_LOOKAHEAD = 3`），
  同时预载封面（走 WebView 图片缓存）
- `mrAudioCacheStats()`：`{enabled, hits, misses, pending}`
- 支持平台：`netease / qq / kugou / qishui / bodian`；`ytm / spotify` 不走通用缓存
  （ytm 有自家 32MB 预下载、spotify 受保护音频）
- 缓存键：`mr:<provider>:<稳定歌曲 id>`（kugou 用 hash、qq 用 mid、其它用 id），
  与直链里的 expire/sign 无关 → **重启后仍然有效**

### 1.2 原生：`com.mineradio.android.LocalAudioServer`（`smali_classes10`）

- 本地 HTTP 服务：`http://127.0.0.1:<port>/downloaded-audio/<hash>`
  - 端口每次启动变化（实测 36671 → 45207 → 38217 → 45371），文件名是稳定 hash，跨启动命中正常
  - 支持 Range 流式读取（`streamDownloadedAudio`）
- 缓存目录：`files/downloaded-audio/`（App 内部存储，**不在 cache/ 下**，不会被系统清理，卸载才丢）
- 容量常量（反编译确认）：
  - `DOWNLOADED_AUDIO_MAX_BYTES = 0x6000000` = **96 MB**（单文件上限）
  - `DOWNLOADED_AUDIO_TOTAL_MAX_BYTES = 0x100000000` = **4 GB**（总量上限）
  - `pruneDownloadedAudio` = 超限 LRU 淘汰
- 插件方法（`window.Capacitor.Plugins.FoliaNative`）：
  `getCachedAudio / registerCachedAudio / registerDownloadedAudio / localAudioServerPort /
   scanLocalAudio / pickAudioFiles / pickAudioFolder / registerRemoteAudio / prepareAudioFocus / deleteImportedAudio`
  —— 注意：**没有 clear/stats 方法**，缓存只能靠 4GB LRU 自动管理

### 1.3 与手机层补丁的关系

`patch-layer` **不参与**音频缓存，也不依赖它：

- v78 删掉的 `ensureAudioCacheEnabled()` 只是往同一个 localStorage 键写 `{enabled:true}`，
  宿主自己会读这个键；实测当前 `enabled = true`
- 缓存命中/预取/落盘全部由宿主 + 原生完成，和 `mr-phone.js` 无关

---

## 2. 实测数据

### 2.1 缓存命中（热态）

```
state: {title:"Answer", provider:"kugou", src:"http://127.0.0.1:34141/downloaded-audio/ke41b3...",
        local:true, hits:2, misses:0}
```

### 2.2 冷启动 + 点播放（已缓存歌）

```
force-stop → am start → 点播放
latencyMs = 2465  （含冷启动/首页渲染；音频 src 在 ~2.3s 时已是本机 127.0.0.1 流）
after: {src:"http://127.0.0.1:45207/downloaded-audio/k1eda30...", local:true, hits:1, misses:0}
非本机网络请求：0（没有任何音频/取址请求）
```

### 2.3 断网冷启动（强证据）

```
adb shell svc wifi disable && adb shell svc data disable
ping 8.8.8.8 → 不可达（Active default network: none）
force-stop → start → 点播放
latencyMs = 306
after: {src:"http://127.0.0.1:45371/downloaded-audio/k1eda30...", local:true, hits:1}
仅封面图请求失败（静默降级，不影响播放）
```

### 2.4 未缓存歌首次播放 + 自动缓存

```
点「下一首」到 sharefs.kugou.com 直链歌（未缓存）
latencyMs = 8293      ← 慢在取播放地址（平台接口）
15s 后：files 20 → 22（当前歌 warm + 预取下一首）；misses +1；当前播放 src 仍是远端（正常）
之后 force-stop → 重启 → 同一首 src 已是 127.0.0.1 本地流，hits+1
```

### 2.5 队列覆盖率（用宿主 `mrAudioCacheLookup` 逐首探测 24 首）

```
total=24, cached=14 (58%), uncached=10
```

与「播过一次就缓存」的机制一致；没播过的不会凭空有缓存。

### 2.6 占用

```
files/downloaded-audio: 22 个文件 / 229 MB
（mp3 2~6MB、m4a 4~34MB、flac 32MB；4GB LRU 上限还远）
```

---

## 3. 发现的问题 / 风险（本次未改代码）

1. **首次播放仍然慢**：未缓存歌要等平台取址（实测 8.3s；宿主注释提到汽水接口 5~20s）。
   预取只发生在「播放开始 3 秒后」，所以**第一首/没播过的歌**无法秒开。
2. **没有缓存管理 UI**：宿主只有 localStorage 开关，fx 控制台没有「缓存大小/清理」入口；
   原生插件也没有 clear/stats 方法 —— 现状只能靠 4GB LRU 自动淘汰。
3. **缓存占 `files/`**：不会随系统清缓存消失，长期接近 4GB 才触发淘汰。
4. **平台覆盖**：`ytm / spotify` 不走这套缓存。
5. **开关风险**：若 `mineradio-audio-cache-v1` 被写成 `{"enabled":false}`（旧补丁/手改），
   整套缓存会停用；当前实测为 true。

---

## 4. 可选增强（供下一版决策）

| 方案 | 收益 | 代价 |
|---|---|---|
| A. 批量预缓存队列/歌单（复用 `mrAudioCacheWarm`） | 整张歌单可离线听 | 占空间/流量；4GB 上限下约 150~300 首 |
| B. 缓存管理 UI（占用/清理/开关） | 用户可控 | 原生没有 clear/stats，需要改 dex 加方法（超出 patch-layer 范围） |
| C. 首播提速（选歌/入队时预取地址） | 第一次播放也能快 | 提前取址会占流量；冷门歌可能白取 |
| D. 保持现状 | 重听/连播场景已覆盖 | 首播慢、无 UI |

---

## 5. 复现 / 工具

- `_tmp/verify2/cache-api-test.js coverage` —— 用宿主 API 逐首探测缓存覆盖
- `_tmp/verify2/tap-next.js` —— 真实点「下一首」，测起播耗时/请求/warm 落盘
- `_tmp/verify2/cold-tap.js online|offline` —— 冷启动 + 点播放测起播（offline 需先关 Wi-Fi/数据）
- `_tmp/verify2/cache-verify.js state|play` —— 单次状态/播放采样
- 目录：`adb shell run-as Mineradio.timing ls -la files/downloaded-audio`
- 常量：`_tmp/decode-base/smali_classes10/com/mineradio/android/LocalAudioServer.smali`
- 原始数据：`_tmp/verify2/out/{cache-verify,cache-api,tap-next,cold-tap}-*.json`
