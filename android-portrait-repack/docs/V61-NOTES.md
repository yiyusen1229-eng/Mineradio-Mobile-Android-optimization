# v61：底栏纯过渡滑入滑出 / 播放页拦截舞台手势 / 暂停不再被双触发

## 1. 底栏滑入滑出改为纯 transition

之前是 keyframe 动画 + 切布局，动画和尺寸变化叠加，看起来一卡一卡。

现在统一成**纯 CSS transition**（`transform 0.34s + opacity 0.30s`，cubic-bezier(.22,.9,.25,1)）：

- 进入 `mr-player-entering`：底栏 `translateY(112%) + opacity 0`（过渡下滑）
- 切到播放页后移除该 class：底栏从下方平滑滑回
- 退出 `mr-return-home`：同样过渡下滑，切回首页后滑回
- 同时歌曲信息行 `max-height` 平滑收到 0

没有 keyframe 的 0%/42%/100% 跳变，动画和布局切换不再互相打架。

## 2. 播放页左半边点击 / 双击仍触发相机

原因：App 的 pointer/click/dblclick 监听挂在 `document`/`window` 上，我们的覆盖层只挡住了 canvas，事件冒泡仍会到宿主监听器。

修复：舞台覆盖层 `#mr-stage-overlay` 对以下事件统一 `stopPropagation`：

`pointerdown / mousedown / touchstart / touchend / click / dblclick`

（多指触摸放行，不影响捏合缩放。）

实测：在播放页左半边双击后，`orbit.userTheta=0`、`userRadius=8.4`、`userPhi=0.18` 全部不变 —— 不再触发定比例缩放、也不再触发双击回正。

## 3. 暂停键自动恢复播放

原因：之前 v52 加的 `bindInstantPause()`（捕获点击后直接 `audio.pause()` 并阻止宿主事件）会和 App 自己的播放/暂停切换叠加，某些状态下变成「暂停→宿主再切回播放」。

而暂停延迟的根本原因（淡出 0.42s）已经在 v52 用 `setAudioFadeSetting('out', 0, true)` 解决了，所以这个自定义暂停处理器已经多余。

v61 已删除它：暂停完全交给 App，淡出为 0 → 立即暂停，不会自动恢复。

## 4. 卡顿相关

- 转场进行中跳过所有布局轮询（不与动画抢主线程）
- 渲染像素比 1.0
- 底栏无 blur
- 动画只用 transform/opacity

## 产物

`dist/Mineradio-portrait-repack.apk`（v61，83 MB，同签名覆盖安装）
