# v55：首页底栏偶发不显示的兜底修复

## 现象

首页底部播放栏偶发消失。

## 原因

v52 加的转场动画里，进入播放页时底栏会跑 `mrBarOutDown`（向下滑出、`both` 填充）。如果这次转场被中途打断（例如切歌、快速返回、App 自己改状态），动画的结束态（`translateY(90%) + opacity:0`）可能被保留下来，而首页已经恢复 → 底栏就“消失”了。

## 修复

新增 2 秒一次的轻量兜底 `ensureBarVisible()`：

- 只在首页状态（非播放页、非转场中）检查
- 如果底栏当前没有正在运行的动画，但 `opacity < 0.85` 或 `transform ≠ none`
- 就强制 `opacity:1 / transform:none / visibility:visible`

不会影响正常的滑入/滑出动画（有动画在跑时直接跳过）。

## 验证

- 冷启动进首页：底栏 `opacity=1`、`display=flex`、y=735、歌曲信息行存在
- 首页点「NEXT UP」→ 播放页 → 返回：底栏恢复正常显示（`opacity=1`）

## 产物

`dist/Mineradio-portrait-repack.apk`（v55，83 MB，同签名覆盖安装）
