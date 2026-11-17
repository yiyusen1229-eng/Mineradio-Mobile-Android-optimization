# v26：右上角显示账号头像 + 「…」不再压搜索框

## 1. 右上角显示账号（和平板一样）

App 的原生账号按钮 `#user-btn`（`.top-account-pill`，内含头像、昵称、SVIP）在手机上被包在 `#top-right` 里，而 `#top-right` 在手机布局中是 `display:none`，所以桌面端才看得到。

处理：

- 把 `#user-btn` 节点搬到 `body`，固定到右上角（`right:8px; top: 安全区`）
- 手机宽度不够，按你说**只显示头像**：隐藏 `.top-account-name` / `.top-account-vip`，头像 34×34 放进 44×44 的圆角框（U 形框保留）
- 用内联 `!important` 强制定位和尺寸（宿主对 `#user-btn` 有 `display:none` 规则）
- 轮询里 `ensureAccountButton()` 会保证它始终挂在 body 上（宿主重渲染后也能找回）

## 2. 「…」不再压住搜索框

- 搜索框右侧留白从 64px 加到 **108px**
- 「…」按钮从 `right:12px` 移到 **`right:60px`**，正好在搜索框和头像之间
- 三段布局：搜索框(8–284) → 「…」(284–332) → 头像(340–384)，互不重叠

## 验证

- 首页右上角显示当前登录账号头像（森文字），点它仍是 App 原生账号面板
- 搜索框、「…」、头像三者不再重叠
- 播放页仍显示账号头像；歌单面板打开时隐藏

## 产物

`dist/Mineradio-portrait-repack.apk`（v26，同签名覆盖安装）
