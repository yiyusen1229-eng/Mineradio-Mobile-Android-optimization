# v59：转场收缩重做 + 音频缓存确认 + 转场期间减负

## 1. 底栏歌曲条：改成真正的“收进去”

之前是整条底栏做 keyframe 下滑，歌曲行只是位移+淡出，而且切换布局时底栏高度从 128 突变成 86 → 看起来“一下扩展/收缩”。

现在：

- 歌曲信息行 `actions` 用 **`max-height: 120px → 0`** 的过渡收起（配 opacity/位移），是真的把高度收掉
- 进入播放页时底栏同时下滑淡出，260ms 后切布局
- 播放页底栏改为**纯淡入**（`mrFadeBar`），不再用会改变尺寸的缩放动画，避免高度跳变被看到
- 回首页同理反向

## 2. 转场期间跳过布局计算（减负）

轮询里如果处于 `mr-player-entering` / `mr-return-home`（转场中），直接跳过所有布局/样式计算，避免和动画抢主线程造成掉帧。

## 3. 音频缓存

App 其实自带全平台音频缓存模块（`12a-audio-cache.js`，原生 `FoliaNative.getCachedAudio/registerCachedAudio`，按“平台+歌曲 id”落盘，LRU 清理）。

检查结果：

- 原生缓存 API 存在（`getCachedAudio` 等）
- 运行时状态 `enabled: true`，且已有命中记录（hits > 0）

已额外强制写入 `mineradio-audio-cache-v1 = {enabled:true}`，避免设置丢失。

> 注意：**每首歌第一次播放**仍要下载；之后（含重启 App）应直接读本地。如果某首歌“重放还要加载”，多半是它换了音源（平台/id 变了 → 缓存 key 不同）。

## 4. 固定资源

- 字体、材质、模型、shader 都在 APK 本地 assets 里，不联网
- `phone.css`、`mr-phone.js` 也是本地
- 会走网络的只有：封面图、歌词、歌单数据、音频本身

## 5. 渲染压力

渲染像素比再降到 **1.0**（`renderer.setPixelRatio`），进一步减轻 GPU/主线程压力。

## 局限

剩下的“不够丝滑”大概率来自 App 本身的 3D 粒子/封面渲染循环（原版在桌面端也吃性能）。如果需要，我可以再加一个「性能模式」：降低粒子数量/关闭部分后处理，换取明显更稳的帧率。

## 产物

`dist/Mineradio-portrait-repack.apk`（v59，83 MB，同签名覆盖安装）
