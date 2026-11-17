# v19：首页搜索框常显

## 原因

App 的搜索框是桌面式「半隐藏」设计：默认 `opacity:0`、`top:-76px`，只有鼠标悬停到屏幕顶部（或触屏点一下顶部 88px 区域）时才会加 `peek` 类显形。

手机上看起来就是「不点它就不显示」。

## 修复

手机壳下强制常显（播放页除外，播放页保持隐藏）：

```css
body.phone-shell:not(.mr-player-page) #search-area{opacity:1!important;pointer-events:auto!important;}
```

面板打开时仍然隐藏搜索框（沿用 `:has(#playlist-panel.show|.peek)` 规则）。

## 验证

- 首页：搜索框可见（透明度 1、peek 状态）
- 播放页：搜索框仍然隐藏
- 歌单面板打开：搜索框隐藏

## 产物

`dist/Mineradio-portrait-repack.apk`（v19，同签名覆盖安装）
