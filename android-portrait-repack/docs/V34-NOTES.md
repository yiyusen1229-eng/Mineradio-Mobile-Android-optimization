# v34：把「词/音量」这些原本连着功能的整套控件搬上去

## 问题

v30 只把按钮（`#lyrics-toggle-btn`、`#volume-btn`）单个搬到播放条上方，**它们的功能弹层没跟着走**：

- 歌词校准弹层 `#lyric-timing-popover` 在 `#lyric-timing-control` 里
- 音量弹层 `.volume-popover` 在 `#volume-control` 里

按钮被搬走后，弹层还留在原来的、被隐藏的 `modes` 集群里 → 点了按钮弹层不可见/位置错乱。

## 修复

改成**整块搬 `#bottom-bar #controls > .control-cluster.modes`** 到播放条上方的 `#mr-player-extras`：

- `#lyric-timing-control`（词按钮 + 歌词校准弹层 -0.1/0/+0.1、自动匹配歌词、搜索歌词）
- `#volume-control`（音量按钮 + 音量/淡入/淡出弹层）
- `#controls-hide-btn`、`#immersive-btn`
- 退出播放页时整块搬回原位并保持隐藏

### 手机端补充

- 「词」在桌面是靠 **hover** 显示歌词校准弹层的，触屏没有 hover → 增加点击监听：点「词」时给容器加 `.mr-open`，强制显示弹层（同时保留原生的开/关歌词行为）
- 点空白处关闭弹层
- 音量弹层原本会超出屏幕右侧 → 弹层统一固定到右下（`right:12px; bottom:150px`），保证完整可见

## 验证（真机 v34）

- 播放页点「词」→ 弹出**歌词校准**面板（-0.1 / 0 / +0.1、自动匹配歌词、搜索歌词），完整可见
- 播放页点「音量」→ 弹出**音量/淡入/淡出**面板（100%、0.46s、0.42s），完整可见
- 「收藏」→ 立即变 liked 状态
- 「自动混音」→ 对应反馈正常
- 底栏 7 键、进度条两侧时间、拖动旋转均正常

## 产物

`dist/Mineradio-portrait-repack.apk`（v34，同签名覆盖安装）
