# v10：播放条顺序 / 返回键 / 歌单关闭 / 双指缩放

## 1. 播放条顺序

原来：进度条在播放条最上面（歌曲行上面）。现在按桌面版顺序重排：

**歌曲行（封面/标题/歌手） → 进度条 → 控制行**

实现：`reorderProgressBar()` 把 `#progress-bar` 从 `#bottom-bar` 移到 `#controls` 里，插在 `.actions`（歌曲行）和 `.transport`（控制行）之间；轮询里会再校正一次，防止宿主重建。

## 2. 返回键不再直接退出

宿主 `MainActivity$1` 的返回逻辑：先问 `FoliaCorePlugin.emitBackPressed()`，有 JS 监听就交给 JS，否则退出 App。原版页面没注册监听 → 一按返回就退出。

我们注册了 `FoliaNative.addListener('backButton', ...)`：

- 有浮层（引导 / 歌单面板 / 登录 / FX 面板 / 搜索结果）→ 先关浮层
- 首页再按返回 → 不再退出（避免误触）

## 3. 歌单面板可关闭

- 头部新增 **✕** 按钮（`#mr-panel-close`）
- 面板内**下滑 >70px** 关闭
- 返回键关闭
- 「…」菜单新增「歌单」项，主动打开

## 4. 双指缩放（歌词/封面粒子背景）

桌面版滚轮通过 `orbit.userRadius` 缩放 3D 场景；手机端原来没手势。现在：

- 双指 `touchstart/touchmove` 计算两指距离比，等比修改 `window.orbit.userRadius`（限制 `minRadius`~`maxRadius`），效果与桌面滚轮一致
- `viewport` 加 `maximum-scale=1.0, user-scalable=no`，避免浏览器自身的整页缩放抢手势
- 真机验证：合成双指事件后 `orbit.userRadius` 6.6 → 2.64

## 已知未处理

- **冷启动仍会后台拉取歌单**（App 本身没有落盘缓存，桌面端也是启动后向平台请求；移动网络下会看到“正在后台载入歌单”）。要做秒开需要给平台请求加 localStorage/IndexedDB 缓存层，属于新功能，可下一轮做。
- 左边缘滑动仍会打开歌单面板（宿主自带手势）；现在至少能一键/返回关闭。如果不想要这个手势，可以再禁掉。

## 产物

`dist/Mineradio-portrait-repack.apk`（v10，同签名覆盖安装）
