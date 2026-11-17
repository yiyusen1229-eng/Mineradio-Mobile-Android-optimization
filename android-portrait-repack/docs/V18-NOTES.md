# v18：播放页顶部歌曲信息 / 控件不再被隐藏 / 点舞台不再乱缩放

## 1. 顶部歌曲信息不见了

原因：进入沉浸式后 App 给 `body` 加 `controls-hidden` 之类状态，CSS 会把 `.control-track` 设成 `display:none`——歌曲行虽然搬到了顶部，但内容被宿主隐藏了。

修复：播放页强制显示

```css
body.mr-player-page .mr-top-track .control-track{display:flex!important;}
body.mr-player-page .mr-top-track #control-cover{width:42px;height:42px;border-radius:9px;}
```

## 2. 点一下 UI 就全消失

原因：沉浸式模式自带“controls 自动隐藏”（980ms 后给底栏加 `soft-hidden`，opacity 0），点一下又切换显隐。

修复：播放页强制底栏可见

```css
body.mr-player-page #bottom-bar,
body.mr-player-page #bottom-bar.soft-hidden,
body.mr-player-page #bottom-bar.controls-hidden{opacity:1!important;pointer-events:auto!important;visibility:visible!important;}
```

顶栏同样强制 `opacity/visibility`，不会再被隐藏。

## 3. 点左半边强制缩放/改角度，滑和缩放又变回去

原因：舞台画布上有 App 的点击/双击相机逻辑（点左半边重置相机、点右半边还原），和手机操作冲突。

修复：播放页拦截画布上的点击/双击/单指触摸（`pointerdown/click/dblclick/touchstart` capture 阶段 `stopPropagation`），单指不再触发相机；**双指不拦**，双指缩放仍然生效（`orbit.userRadius` 会保持，实测不反弹）。

## 4. 底部只留控件

播放页隐藏音量键，只保留 上一首/播放/下一首 + 进度条；顶部为原生歌曲信息行。

## 真机验证

- 进播放页 3 秒后：顶部歌曲信息可见、底栏可见（不再自动淡出）
- 点左半屏：UI 不消失、`orbit.userRadius` 保持 6.6 不变
- 双指缩放：半径改变后 2.5s 仍保持
- 返回键：回首页正常

## 产物

`dist/Mineradio-portrait-repack.apk`（v18，同签名覆盖安装）
