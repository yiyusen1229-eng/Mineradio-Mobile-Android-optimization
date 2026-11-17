# v45：应用内提示条不再和顶部歌曲信息重叠

## 原因

提示条现在是 **卡片堆栈** 结构，不是老的 `#source-fallback-notice`：

- 容器：`#source-fallback-stack`（fixed、`top:72px`、`right/left:24px`、`z-index:202`）
- 卡片：`.source-fallback-card`（`show` 类做动画）

72px 的位置正好压在播放页顶部歌曲信息行（y 62–104）上，所以看着是重叠。

## 修复

300ms 守护轮询（只监听这一个容器，开销很小）：

- 一旦 `#source-fallback-stack` 里有卡片出现：
  - `position:fixed; top = 顶部歌曲信息底部 + 8px; left/right:12px; width:auto; z-index:9600`
  - 即提示条出现在歌曲信息**下方**，完整可见
- 卡片清空后自动清掉这些内联样式，恢复 App 原行为
- 老的单元素 `#source-fallback-notice` 也一并按同样规则处理（兼容）

## 验证（真机 v45）

- 播放页触发音源提示：提示条 `y=120`，歌曲信息行底部 `104` → 不重叠
- 提示条宽度 368、左右各 12px、z-index 9600
- 关闭（× / 自动消失）后内联样式清除

## 产物

`dist/Mineradio-portrait-repack.apk`（v45，同签名覆盖安装）
