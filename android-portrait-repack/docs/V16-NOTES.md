# v16：主页点歌曲信息进播放页 / 面板居中 / 详情头不再吸顶

## 1. 主页点击底栏歌曲信息 → 进入播放页

- 在底栏上拦截点击（`.control-track / #control-cover / #control-title`），仅在首页（`#empty-home` opacity > 0.35）时生效
- 进入播放页用 App 原生沉浸式：`setImmersiveMode(true)`；同时把首页 opacity 置 0 兜底
- 进入后：顶部显示原生歌曲信息行，底栏只剩进度 + 控件（v13 已实现）

## 2. 播放页返回键 → 回首页（修复）

v14 的返回只调了 `goHome()`，但播放页是 App 的沉浸式模式（`body.immersive-mode`），只 goHome 不会退出沉浸式。

现在 `exitPlayerPage()`：
1. `setImmersiveMode(false)` 退出沉浸式
2. 清掉首页内联 opacity
3. `goHome()`，160ms 后再补一次
4. 420ms 后若首页仍不可见，强制 `body.empty-home-active` + opacity 1 兜底

真机验证：播放页按返回 → 首页可见、歌曲行回底栏、App 存活。

## 3. 歌单框居中

- 面板恢复左右各 8px（`left/right:8px`，去掉了会因宿主 transform 失效的居中写法）
- **打开面板时隐藏搜索框**（`body:has(#playlist-panel.show|.peek)`），之前搜索框在后面露出一条，看起来像面板没居中
- 面板内 sticky / 工具栏宽度 100%、左右对称

## 4. 歌单详情头不再吸顶

`.pl-detail-sticky` 原来 `position:sticky; top:126px`，打开歌单下滑时一直钉在顶部挡住列表。改为 `position:static; top:auto`，现在会跟着列表一起滚走。

## 产物

`dist/Mineradio-portrait-repack.apk`（v16，同签名覆盖安装）
