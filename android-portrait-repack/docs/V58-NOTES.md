# v58：歌单缓存 / 去「已退出全沉浸模式」/ 修复 DIY 跳动、上下反向、歌曲条收缩、底栏闪烁

## 1. 打开歌单总在加载 → 加本地缓存

App 所有原生请求都走 `window.__mrBridgeRequest`（歌单/推荐/热歌等是网络请求，没有本地缓存）。

修复：在 `index.html` 的 `<head>` 里加一段**早期脚本**，一旦 `__mrBridgeRequest` 可用（50ms 轮询）就包装它：

- 命中 `playlist / cloudlist / shelf / daily / recommend / hot / listen` 的请求（GET/POST 均可）
- 响应体（<2MB）按 `URL + body 哈希 + method` 存 localStorage
- **TTL 15 分钟**，命中就直接返回，不再发网络请求

另外 fetch 层也做了一层 `/api/*` 缓存（TTL 6h）作为兜底。

实测：打开歌单后生成了 `mr-bridge-cache:` 缓存项。

> 注意：清空缓存或超过 15 分钟后的第一次打开仍需拉一次，之后都是本地命中。

## 2. 「已退出全沉浸模式」提示

`showToast` 过滤条件扩展为 `/Home|沉浸/`，这类提示不再弹出。

## 3. 切界面时 DIY 先压在 4 键上再跳开

原因：DIY 按钮位置依赖底栏 rect，转场中 rect 在变，而重算发生在下一次轮询 → 先按旧位置显示、后跳一下。

修复：

- `#fx-fab` 增加 `bottom/right/transform` 的 0.34s 过渡
- `updatePlayerPage()` 切换 class 后**立即**调用 `hideFab()` 重算位置（不再等轮询）
- 进入播放页时先做 260ms 收缩动画，再切沉浸式与布局，避免宿主瞬间改状态导致位置突变

## 4. 播放页上下方向反了

拖动时 `userPhi` 的符号取反：现在往上滑 → 视角往上（原来相反）。

## 5. 歌曲条是直接消失，不是收缩

原因：之前 `setImmersiveMode(true)` 在点击瞬间就调用，宿主会立刻改底栏状态，把我们的收缩动画“掐掉”。

修复：进入播放页先加 `mr-player-entering` 跑 260ms：

- 底栏 `mrBarOutDown` 向下滑出
- 歌曲信息行 `mrTrackFold` 向下折叠淡出
- 首页/搜索同步淡出

260ms 后才调用沉浸式 + 切布局，于是能看到完整的“歌曲条收缩消失”。

## 6. 底栏闪一下

同样是沉浸式切换时机太早导致的双重状态变化；延迟到动画结束后再切，闪烁消失。

## 7. 更丝滑

- 渲染像素比 1.5 → **1.25**（3D 画布渲染压力更低）
- 底栏已去掉 `backdrop-filter` 模糊
- 所有转场仅使用 `transform/opacity`，走合成层

## 产物

`dist/Mineradio-portrait-repack.apk`（v58，83 MB，同签名覆盖安装）
