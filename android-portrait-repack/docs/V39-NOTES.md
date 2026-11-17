# v39：词/音量弹层可再次点击收回 + 去掉按钮上方那条线 + DIY 按钮让位

## 1. 弹层再点一次收回

- 之前「词」的点击处理只会一直 `add('mr-open')`，所以只弹不收
- 现在改成 toggle：开 → 关 → 开；音量本身是 App 原生 `toggleVolumePanel`，也验证了 open → 关（`.volume-control.open` 去掉、opacity 0）
- 歌词开关（原 `toggleLyricsPanel()`）行为保留

真机验证：

- 词：open=true → opacity 1；再点 open=false → opacity 0
- 音量：`.volume-control open` → 再点 class 还原、opacity 0

## 2. 按钮上方那条线

来源是 `control-cluster.modes` / `ctrl-btn` 自带的 `border-top: 1px` 和 `::before` 装饰线（桌面 hover 用的连接线）。搬到播放条上方后露出来变成一条横线。

修复：附加行内统一 `border:0`，`::before` 全部 `display:none; content:none`。

## 3. DIY（视觉控制台）按钮压住音量键

v37 把视觉控制台 FAB 放回底栏上方后，播放页里它和附加行的四个键重叠了（截图里 DIY 盖住最右键）。

现在 FAB 在播放页会再抬高 58px，位于附加行上面，不再遮挡：

- 首页：`bottom = 底栏顶 - 12px`
- 播放页：`bottom = 底栏顶 - 58px`

## 产物

`dist/Mineradio-portrait-repack.apk`（v39，同签名覆盖安装）
