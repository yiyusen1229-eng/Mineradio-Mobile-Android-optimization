# v54：首页点「接下来播放」进入播放页不再和首页重叠

## 原因

之前从播放页返回首页的兜底逻辑里，给 `#empty-home` 设置了**内联** `opacity: 1 !important`，而且没有清除。

后来在首页点「NEXT UP 接下来播放」（App 自己的切歌逻辑直接进入播放页）时：

- `body` 变成 `mr-player-page`
- 但首页带着那条内联 `opacity:1 !important`，一直保持可见
- 结果：播放页 UI 和首页同时显示，重叠

## 修复

1. `updatePlayerPage()` 判定进入播放页时，主动清掉 `#empty-home` 上的内联 `opacity / pointer-events`
2. 退出播放页的兜底内联样式，1.2 秒后自动移除，不再残留
3. CSS 兜底：`body.phone-shell.mr-player-page #empty-home{opacity:0!important;pointer-events:none!important}`

## 验证（真机 v54）

首页点「NEXT UP」→ 2.5s 后：

- `empty-home-active` 已移除、`mr-player-page` 生效
- `#empty-home` 计算 opacity = **0**，内联样式为空
- 首页内容完全隐藏，只剩播放页界面，无重叠

## 产物

`dist/Mineradio-portrait-repack.apk`（v54，83 MB，同签名覆盖安装）
