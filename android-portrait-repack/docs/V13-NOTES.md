# v13：B 方案 + 底栏/播放页调整

按 B 方案：保持 App 原生 UI（不自创组件），只做你点名的调整。

## 改动

| 需求 | 实现 |
|---|---|
| 删掉底栏从左往右第二个按钮（自动混音 Ⓧ） | `#cuefield-automix-btn` 在手机壳下隐藏 |
| 让播放键居中 | 传输区 `justify-content:center`，剩 5 个按钮（随机/上一首/播放/下一首/队列），播放键居中 |
| 不要再左边缘滑动打开歌单 | 包装 `window.setPeek`：`setPeek('pl', true)` 只有本 UI 主动调用（`__mrAllowPlOpen`）时才放行，宿主边缘手势一律拦掉；歌单只从「…」→ 歌单 打开 |
| 播放页把歌曲信息移到顶部 | 播放页（`#empty-home` 透明度 < 0.35 时判定）把原生的 `.control-cluster.actions`（原封面+歌名+KG 徽标）整个节点搬到 `body` 顶部固定；首页/搜索页再搬回底栏 |
| 播放页底栏只保留控件 | 歌曲行搬走后，底栏只剩进度条 + 控制按钮 |

## 判定与还原

- 播放页判定不再看 `body.empty-home-active`（宿主会异步改），改看 `#empty-home` 的实际 opacity
- 节点搬运保留原元素（事件、封面、标题更新都还是 App 原生逻辑）
- 回到首页时把歌曲行插回 `#controls` 里进度条下面，恢复原底栏

## 真机验证

- 首页：底栏 5 键、播放键居中、无 Ⓧ 按钮
- 播放页：顶部原生歌曲信息行，底部只有进度 + 控件
- 左边缘滑动：不再呼出歌单
- 「…」→ 歌单：正常打开，面板居中、✕ 可关

截图：`verify/repack-home.png`、`verify/repack-player.png`

## 产物

`dist/Mineradio-portrait-repack.apk`（v13，同签名覆盖安装）
