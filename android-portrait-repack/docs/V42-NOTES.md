# v42：DIY 控制台可打开 / 音量弹层可收回 / 开屏不再露出手机 UI / 性能优化

## 1. 点 DIY 啥都没出来

两个原因：

1. **开屏期间点的是开屏页**，App 还没初始化，点 DIY 当然没反应——现在开屏期间直接隐藏 DIY/搜索/「…」/头像。
2. 进 App 后点 DIY，面板其实被 App 自己的样式藏了：`body.simple-mode #fx-panel { display:none!important }`，而手机壳一直带 `simple-mode` 类。

修复：

- `body.phone-shell #fx-panel{display:block!important}`
- `#fx-panel.peek/.show` 固定在右下（`right:12px; bottom:120px`，最大高度按屏幕算），z-index 8600
- 沉浸式（播放页）里仍然不显示

真机验证：首页点 DIY → 视觉控制台面板正常弹出（视觉预设列表可见）。

## 2. 音量弹层再点不收回

宿主自己的 `toggleVolumePanel` 在手机上关闭不稳定。现在改成我们接管：

- 捕获阶段拦 `#volume-btn` 的点击，自己 toggle 容器上的 `mr-open`
- CSS：`mr-open` 显示弹层，否则强制隐藏
- 点弹层外面自动收起

验证：点开 opacity 1 → 再点 opacity 0。

## 3. 开屏露出搜索框/「…」/DIY

开屏页（`body.splash-active`）强制隐藏：搜索框、「…」按钮、账号头像、DIY 按钮、播放页附加行。

![开屏（干净）](mineradio-portrait/verify/repack-splash.png)

## 4. 卡顿优化

- 轮询周期 800ms → **1500ms**
- `layoutPhoneBar()`：先比较子节点顺序，一致就完全跳过 appendChild（原来每轮 14 次 append 引发重排）
- `hideFab()`：缓存位置 key，底栏位置不变就跳过（原来每轮读 rect + 写 8 个 inline style）
- `updatePlayerPage()`：不用每轮 `getComputedStyle`（强制重排），改用 class 判定 + `__mrForcePlayer` 标记
- 减少每轮的 DOM 查询/搬运，只在状态变化时操作

## 产物

`dist/Mineradio-portrait-repack.apk`（v42，同签名覆盖安装）
