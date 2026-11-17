# v52：歌曲条收缩动画 / 暂停不再卡 1 秒 / 去 Home 提示 / 去掉昂贵模糊

## 1. 底部歌曲条收缩动画（转入播放页）

原来“转入播放页”是直接切布局，歌曲条瞬移，看不出收缩。现在拆成两段：

1. 点击后 240ms 内：`body.mr-player-entering`
   - 底栏整体向下滑出：`mrBarOutDown`（translateY 90% + 淡出）
   - 歌曲信息行单独向下折叠：`mrTrackFold`（translateY 34px + 淡出）
2. 240ms 后切到播放页布局：
   - 底栏（只剩控件）向上滑入：`mrBarUp`
   - 顶部歌曲信息条 `mrTopIn`、右侧四键 `mrRightIn` 同时滑入

切回首页：顶部条/四键先退出 → 切回布局 → 底栏带歌曲条从下方滑上来（`mr-just-home` + `mrBarUp`）。

## 2. 点暂停卡 1 秒才变播放键

原因：App 暂停走的是音频**淡出**（0.42s 淡出 + 处理时间）。

修复：启动时调用 App 自己的 `setAudioFadeSetting('out', 0, true)` 把淡出设为 0。

真机实测：点暂停后播放键图标 **15ms** 内切换（之前约 1s）。

## 3. 删除「已关闭 Home」提示

拦截 `showToast`，过滤包含 `Home / 回到首页 / 已关闭 / 已回到` 的提示，不再出现。

验证：调用 `showToast('已关闭 Home')` 不会弹提示。

## 4. 卡顿优化（关键）

底栏之前用了 `backdrop-filter: blur(18px)` —— 在 Android WebView 上，把**动态 3D 画布**做背景模糊非常贵，会明显掉帧。

处理：

- 去掉底栏 `backdrop-filter`（设为 `none`），改用较实的半透明背景（首页 0.62 / 播放页 0.58，保证可读）
- 轮询 1500ms → **2000ms**；提示监听 300ms → 500ms
- 渲染像素比限制在 1.5 以内（`renderer.setPixelRatio`）
- 布局函数继续带状态缓存，不变就不动 DOM

## 产物

`dist/Mineradio-portrait-repack.apk`（v52，83 MB，同签名覆盖安装）
