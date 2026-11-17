# v25：应用内提示不再被压住 + 手机状态栏恢复

## 1. 应用内提示（音源切换 / toast）被压在 UI 下面

原因有两层：

1. **沉浸式把提示整体隐藏了**：`index.css` 里 `body.immersive-mode #toast,#source-fallback-notice,#cuefield-feedback{opacity:0!important;visibility:hidden!important}`，播放页（沉浸式）里这些提示其实是被藏掉的。
2. 提示的 z-index 只有 200/201，低于顶部歌曲信息（8400）和底部控件，露出来时也会被压在下面。

修复（播放页）：

```css
body.mr-player-page #toast.show,body.immersive-mode #toast.show{opacity:1!important;visibility:visible!important;}
body.mr-player-page #source-fallback-notice.show,...{opacity:1!important;visibility:visible!important;}
body.mr-player-page #toast{top:calc(126px + env(safe-area-inset-top,0px))!important;z-index:9600!important;}
body.mr-player-page #source-fallback-notice{top:calc(126px + ...)!important;left:12px!important;right:12px!important;width:auto!important;z-index:9600!important;}
```

效果：提示显示在顶部歌曲信息**下面**、舞台上面，不再跟歌曲行/控件重叠。

## 2. 手机状态栏不显示

原因：APK 的 `MainActivity.applyFullscreen()` 直接干了三件事——

- `setSystemUiVisibility(0x1706)`（IMMERSIVE_STICKY + FULLSCREEN + HIDE_NAVIGATION）
- `addFlags(FLAG_FULLSCREEN)`
- `setDecorFitsSystemWindows(false)` + `insetsController.hide(statusBars|navigationBars)`

所以状态栏是原生隐藏的，CSS 改不动。

修复（smali 三处 + 资源）：

1. `MainActivity.smali`：`const/16 v2,0x1706` → `0x0`；`FLAG_FULLSCREEN` addFlags 改成 `0x0`（空操作）
2. `setDecorFitsSystemWindows(false)` → `(true)`，让内容排在状态栏下方
3. `WindowInsetsController.hide()` → `show()`，并补 `setSystemBarsAppearance(0, 0x18)` 让状态栏图标为白色
4. `res/values/styles.xml` 与 `res/values-v28/styles.xml`：`android:windowFullscreen` 全部改 `false`
5. `capacitor.config.json`：`StatusBar.overlaysWebView=false`、`style=DARK`

结果：状态栏恢复（时间/信号/电量白色图标），网页内容从状态栏下方开始，不再被遮。

## 真机验证

- 首页/播放页顶部均显示系统状态栏（7:26、4G、WiFi、26%）
- 播放页 toast「测试提示：音源已切换」显示在顶部歌曲信息下面，不被遮挡
- 顶部歌曲信息、底部控件、返回键均正常

## 产物

`dist/Mineradio-portrait-repack.apk`（v25，同签名覆盖安装）
