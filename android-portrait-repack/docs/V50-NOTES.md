# v50：底栏半透明 + DIY 按钮上移

## 1. 底栏半透明

宿主对 `#bottom-bar` 有多层渐变背景规则（`body.immersive-mode #bottom-bar.visible` 等），CSS 加 `!important` 也被覆盖，所以改成**内联样式强制**：

- `background: rgba(8,14,16,.38)`（播放页）/ `.42`（首页）
- `background-image: none`
- `backdrop-filter: blur(18px) saturate(1.1)`（毛玻璃）
- 边框、阴影同步调轻

验证：计算样式 `backgroundColor = rgba(8, 14, 16, 0.38)`，blur 生效。

## 2. DIY 按钮上移

播放页里 DIY（视觉控制台）按钮原来距附加四键只有 8px，挤在一起。现在它的定位偏移从 58px 提高到 **86px**：

- DIY 按钮底部 y≈699
- 附加四键顶部 y≈725
- 间距 **26px**

首页不受影响（仍是底栏上方 12px）。

## 产物

`dist/Mineradio-portrait-repack.apk`（v50，83 MB，同签名覆盖安装）
