# v14：播放页返回键修复

## 问题

返回键在播放页没反应。

## 原因

`closeTopOverlay()` 里为播放页留了一个分支：

```js
if (document.body.classList.contains('mr-player-page')) {
  try { if (window.MrKugou) window.MrKugou.home(); } catch (e) { }
  return true;
}
```

这是 v11 自创 UI 时留下的。v12 撤掉自创 UI 时把 `MrKugou` 删了，但分支还在——于是返回键被“消费”掉了（`return true`），却什么也没做，看起来就是按返回没反应。

## 修复

播放页分支改成调用 App 自己的 `goHome()`：

```js
if (document.body.classList.contains('mr-player-page')) {
  try { if (typeof goHome === 'function') goHome(); } catch (e) { }
  return true;
}
```

## 真机验证（v14）

- 播放页按返回 → 回到首页（`#empty-home` opacity 0 → 1，歌曲行回到底栏），App 存活
- 首页再按返回 → 不退出 App（仍保持之前的防误退逻辑）
- 歌单/登录/搜索浮层打开时 → 返回键优先关闭浮层

## 产物

`dist/Mineradio-portrait-repack.apk`（v14，同签名覆盖安装）
