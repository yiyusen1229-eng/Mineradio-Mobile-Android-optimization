# v7：开屏字重叠 / 系统字体缩放

## 开屏 “Mineradio” 重叠的两个原因

### 1. 根因：系统字体缩放被 WebView 放大了 1.45 倍

手机系统字体大小设置是 **1.45**（`settings get system font_scale` = 1.45），
Android WebView 默认把系统 font_scale 应用到网页文字：

- 页面里 `font-size:16px` 的元素 `getComputedStyle` 实际是 **23.2px**
- 开屏字 `clamp(52px, 8.8vw, 112px)` 被放大到 **88px**
- 而 “Mine” / “radio” 两段字的最终位移是 `clamp(66px,10.8vw,130px)`，
  字号一大、位移跟不上，就出现重叠

**修复（改 smali）**：`com.mineradio.android.MainActivity` 里 WebView 设置块加一行
`WebSettings.setTextZoom(100)`，让 App 不跟随系统字体缩放。
验证：系统 font_scale 仍为 1.45 时，页面 16px 元素计算值回到 16px。

### 2. 开屏拼字偏移写死像素

原版两段字用 `clamp(66px, 10.8vw, 130px)` 这类像素偏移拼成 “Mineradio”，
字缩到 52px 后偏移相对字宽过大 → 中间出现 12px 空隙 / 或重叠。

**修复（CSS）**：`#splash-wordmark` 两段字改为 **em 偏移**（随字号等比，`-1.096em` / `+1.25em`），
并停掉原 5.2s 拼字动画、只做 0.5s 淡入；`radio` 的渐变背景固定到 `100% 0` 终态。

## 顺带修复的坑

- **不能用 MutationObserver 补 class**：宿主开屏动画会逐帧重写 `html/body` 的 class，
  监听后立刻补类会来回拉锯，把 WebView 渲染进程 CPU 打到 109%，页面假死（CDP 也连不上）。
  改成 800ms 低频轮询，只在缺类时补一次。
- 开屏 / 登录 / 首页统一在 100% 字号下重新验证（此前所有尺寸都是按 1.45 倍调出来的）。

## 真机验证（font_scale 保持 1.45）

- 开屏：`Mineradio` 连成一词、无重叠、无缝隙，渐变正常
- 首页：单列卡片 + 右上「…」+ 底部播放条
- 登录：平台列表 / MR 卡 / 二维码抽屉滚动正常，按钮完整

截图：`verify/repack-splash.png`、`verify/repack-home.png`、`verify/repack-login.png`

## 产物

`dist/Mineradio-portrait-repack.apk`（112.9 MB，v7，同签名覆盖安装）
