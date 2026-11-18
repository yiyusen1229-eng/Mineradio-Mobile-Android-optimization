# 开发日志（DEVLOG）

Mineradio 竖屏重打包的关键迭代记录。详细版见 `docs/V*-NOTES.md`。

## 背景

官方 Mineradio timing 2.2.2 是横屏 Capacitor 应用，直接装到手机上：横屏、状态栏异常、底栏/搜索/面板布局按桌面设计，手机不可用。
选择 **重打包官方 APK**（而不是自写 UI），保留原有功能按键与视觉素材。

## 关键里程碑

| 版本 | 问题 | 修复 |
|---|---|---|
| v10 | 横屏 + 状态栏缺失 | Manifest 竖屏；原生全屏 flag 移除；状态栏白色图标 |
| v11-v14 | 开屏 wordmark 重叠、登录页布局挤压 | `setTextZoom(100)` + 开屏 CSS 偏移；登录弹窗居中/可滚动 |
| v16 | 底栏 transform 偏移、点击穿透 | `transform:none`、z-index 修正 |
| v19 | 搜索框/面板在手机上的定位错误 | 重排搜索、歌单面板居中 |
| v25-v28 | 播放页信息条、底部播放条 | 把歌曲信息行移到顶部、进度条两侧加时间 |
| v30-v34 | 返回按钮、边缘手势误触 | 自建返回处理；禁止左边缘打开歌单 |
| v37-v39 | 状态栏、通知条、DIY 面板 | 原生补丁 + 提示条定位 + DIY 恢复 |
| v42-v45 | 头像/右上角菜单、开屏遮挡 | 头像按钮、开屏隐藏 UI；APK 体积分析 |
| v46 | 体积/代码臃肿 | 合并 3 个 mobile CSS → `phone.css`；CSS 从 JS 抽出；`.so` 压缩（Manifest extractNativeLibs=true + Deflate）；112.9MB → 83.0MB |
| v47 | 首页↔播放页切换生硬 | CSS 转场：搜索上滑淡出、首页下滑淡出、底栏收起、顶部条滑入、四键右侧滑入；返回反向 |
| v48-v50 | DIY 与四键拥挤；底栏不透明 | DIY 上移 26px 间距；底栏半透明（内联覆盖宿主渐变） |
| v52 | 暂停延迟 1 秒、底栏闪烁 | `setAudioFadeSetting('out',0)`；去掉 backdrop-filter 模糊（WebView 上很贵）；轮询降频 |
| v54 | 点「NEXT UP」进入播放页与首页重叠 | 清除返回时残留的内联 opacity；CSS 兜底 |
| v55 | 首页底栏偶发消失 | 转场被打断时动画结束态残留；加 `ensureBarVisible()` 兜底 |
| v58 | 歌单每次打开都加载 | 早期包装 `__mrBridgeRequest` 缓存响应（15min）+ fetch 缓存 |
| v59 | 歌曲条切换时“扩展/收缩”跳变 | 歌曲行改用 `max-height` 过渡；播放页底栏改纯淡入，去掉尺寸动画 |
| v61 | 播放页左半边点击/双击触发相机；暂停被双触发 | 舞台覆盖层阻止事件冒泡（pointer/touch/click/dblclick）；移除多余的 `bindInstantPause` |
| v62 | 首页⇄播放页转场不丝滑、返回首页生硬（底栏高度瞬跳 50px、两段反向运动、首页晚 700ms、2s 轮询引发布局抖动） | 底栏恒高三段（顶部槽位/进度行/控制行）+ 歌曲行 WAAPI FLIP + 单一 360ms 事件驱动转场 + 旁路宿主底栏状态机 + 宿主重活移出动画窗口。详见 `docs/V62-NOTES.md` |
| v63 | v62 真机复测：空白处点击/从歌单起播时自动进播放页的入口丢失（会卡在「舞台+底栏」）；「…→首页」调未定义函数；进度行时间 2.5s 才跳一次 | `dismissHomePage` 包装 + audio `playing` 事件驱动进播放页；补 `gotoHome()`；`timeupdate` 刷新进度时间；`bindTrackEnter` 加状态守卫。真机逐帧：底栏恒高、退出首页 32ms 开始淡入、无 >32ms 帧。详见 `docs/V63-NOTES.md` |

## 经验 / 坑

- **不要 zip 替换 assets**：会破坏 dex/FileProvider，必须完整 apktool 回编译。
- **不要用 MutationObserver 监听宿主 class**：宿主每帧改 class 会造成死循环（曾 109% CPU）。用 2s 轮询。
- **宿主对 `#bottom-bar` 有多层渐变规则**：CSS !important 会被覆盖，需内联样式强制。
- **转场动画与宿主状态要错开**：`setImmersiveMode` 会瞬改底栏，动画必须放在它之前，否则动画被掐断。
- **Android WebView 的 backdrop-filter 很贵**：尤其叠加动态 3D canvas 时，必须去掉。
- **音频缓存**：原生 `FoliaNative.getCachedAudio/registerCachedAudio` 已存在，按「平台+歌曲 id」落盘；暂停淡出 0 才能即时切换图标。

## 未完成 / 可继续

- 打开歌单首次仍需网络（缓存 15 分钟后过期）；可考虑更长 TTL 或预取。
- 3D 粒子在 WebView 上仍可能掉帧，可加「性能模式」开关（降粒子/关后效）。
- 转场动画在低端机上仍可能受主线程影响，可进一步把布局计算移到 `requestIdleCallback`。