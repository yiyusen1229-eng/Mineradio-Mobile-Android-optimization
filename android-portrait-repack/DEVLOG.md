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
| v64–v65 | 播放页 4 键按钮组少一个（音量键被 `#bottom-bar #volume-btn` 旧规则命中）、位置与弹层错位、进/出方式变了；二次点「词」不收起 | 4UI 恢复 v61 的 body 级 fixed 定位（贴底栏上沿、右侧滑入滑出）、弹层改按按钮 rect 相对定位（正上方 8px、二次点击必收起）、音量键兜底、DIY 球抬到 4UI 上方不遮挡 |
| v66 | DIY 键点了没反应；搜索弹出后背后多一块墨绿/黑色底框 | DIY → 先补 diyPlayerMode 再 `toggleFxPanel()`；`#search-stack` 外层暗底置透明、搜索面板底框去掉 |
| v67–v69 | 只适配过 390×844，小屏/大屏/横屏/平板会破版（底栏固定 132px、固定 64px 右侧列、面板 150px 死值） | 响应式变量（`--mr-row-h`/`--mr-ctrl-size`/`--mr-bar-pad-x`/`--mr-transport-gap` 用 clamp）+ ≤360/≥600/横屏断点 + safe-area 左右 + hideFab 去 inline 死值 + 浮层按 `--mr-bar-h` 定位；用 CDP `Emulation` 在真机 WebView 上跑 10 组视口矩阵（320~800 宽、横竖屏）全部无溢出/底栏完整 |
| v70–v76 | DIY 依赖「DIY 玩家模式」开关（显示已切回简约模式才能开、开模式反而开不了；返回键关面板还会退模式）；面板不是从 DIY 键弹出；菜单里的 DIY 模式入口多余；DIY 图标不对；舞台左半边点击仍有响应；搜索起播后浮层挡着像卡死 | DIY 键=视觉控制台直开直关（去掉玩家模式概念与菜单入口）、面板从 DIY 位置弹出并按手机尺寸自适应、图标换回原包滑块 SVG、z-index 提到面板之上再点可收回、面板自持开态（宿主 auto-hide 不再自动收起）；舞台 click/dblclick/mouseup/contextmenu 在捕获阶段全屏蔽（保留拖拽旋转）；起播进播放页前先收搜索/歌单/控制台浮层，返回键顺序改为「浮层优先」 |

## 经验 / 坑

- **不要 zip 替换 assets**：会破坏 dex/FileProvider，必须完整 apktool 回编译。
- **不要用 MutationObserver 监听宿主 class**：宿主每帧改 class 会造成死循环（曾 109% CPU）。用 2s 轮询。
- **宿主对 `#bottom-bar` 有多层渐变规则**：CSS !important 会被覆盖，需内联样式强制。
- **转场动画与宿主状态要错开**：`setImmersiveMode` 会瞬改底栏，动画必须放在它之前，否则动画被掐断。
- **Android WebView 的 backdrop-filter 很贵**：尤其叠加动态 3D canvas 时，必须去掉。
- **音频缓存**：实测**没有实现**——补丁里 `ensureAudioCacheEnabled()` 只往 localStorage 写 `mineradio-audio-cache-v1` 标记，全工程无人读取；原生侧也无 `getCachedAudio/registerCachedAudio`。所以同一首歌关掉 App 再放仍要重新联网加载。下一步方案：Service Worker + Cache Storage（按「平台+歌曲 id/文件 hash」做 key、支持 Range、LRU 上限），详见交接文档。

## 未完成 / 可继续

1. **音频缓存（最高优先级）**：Service Worker 拦截音频请求 → Cache Storage（key 用「平台+歌曲 id/文件 hash」忽略会变的 token，支持 Range），实现"第二次播放/重启后播放秒开"；再加 LRU 上限与 DIY 面板里的"清理缓存/缓存大小"。验收：装 App→播一次→杀进程重开→再播同一首，应 0 网络请求。
2. **字号下限**：仍有约 58 个 <10px 的小标签（KG、卡片副标题等），建议用 `--mr-font-xs` 系列统一 clamp 到 12px 下限。
3. **软键盘**：弹层按窗口高定位，未监听 `visualViewport.resize`，键盘弹起时极端情况可能被遮挡。
4. **720px 以上宽度**：宿主自身的桌面布局规则（`min-width:721px`）与手机层硬覆盖并存；本版靠底栏/面板变量化保证可用，平板专属首页两栏仍是宿主桌面几何，若要"平板原生感"需单独设计。
5. **横屏**：手机层有一整套 `.phone-landscape` 规则但**没有任何 JS 添加该 class**（死代码），当前横屏走新加的 `orientation:landscape` 查询；若要完整横屏布局，可把 1915–2229 的 class 门换成真查询。
6. 3D 粒子在 WebView 上仍可能掉帧，可加「性能模式」开关（降粒子/关后效）。