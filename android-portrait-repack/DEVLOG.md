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
| v77 | ① 播放页点左半边仍会「弹出歌单」（v76 只拦了 click/dblclick，真正来源是宿主 `window` 捕获阶段的 `touchstart`：左缘 104px 内一点就 `setPeek(playlist-panel,true,'pl')`，还有合成 mousemove 走桌面 hover 判定）；② v76 顺手把「双击回正」也拦掉了；③ DIY 视觉控制台压到底栏（宿主旧规则 `#fx-panel.peek{bottom:120px;max-height:100vh-240px}` 特异性压过 V70 的 `#fx-panel`），位置/尺寸也不对；④ 播放页（`body.immersive-mode`）宿主把 `#fx-fab` 钉成 `pointer-events:none`、`#fx-panel` 钉 `visibility:hidden`，点 DIY 完全没反应；⑤ 点 DIY 有时开不了（宿主 auto-peek 会乱加 `.peek`，旧逻辑拿宿主 class 判断开合） | ① 舞台覆盖层 `touchstart` 改非 passive 并 `preventDefault()`：WebView 不再合成 mousedown/mousemove/mouseup/click，宿主点击/悬停链路全部静默（touch/pointer 照常，拖拽旋转不受影响）；同时包裹 `isPlaylistEdgeTrigger` 在播放页返回 false。② 手机层自己识别双击（340ms 内两次轻点、位移<10px）→ 调宿主 `recenterCamera()`，`dblclick` 不再屏蔽。③ 面板几何改挂在手机层自持的 `body.mr-diy-open` 上：`right:12px` + `width:min(80vw,460px)` + `top:31vh` + `bottom:底栏上沿-14px`（391×870 实测 66.4/269.9/379.8/710.7，绿框目标 65/269/379/711），标签栏 6 项等分收缩、副标题允许折行。④ `hideFab()` 内联 `pointer-events:auto!important`，开态内联 `visibility/opacity/pointer-events`。⑤ 开合只认 `window.__mrDiyOpen`（+`body.mr-diy-open`），不再读宿主 class |
| v78 | ① 打开 DIY 面板「闪一下」（关态 `display:none` → 开态内联 `!important display:block/opacity:1`，display 切换不触发 transition → 面板第一帧满不透明硬切，WebView 还会先上低分辨率栅格）；② patch-layer 经 v10→v77 多轮「文件末尾追加」叠出大量被完全覆盖的重复 CSS 与死代码（`phone.css` 2978 行里 717 行可整块删）；③ mr-phone.js 有 2 个 0 调用死函数、2 个恒空转补丁、5 组定时器 + 46 处监听、音量/词两个逐行重复的弹层实现；④ APK 里残留官方桌面版的未引用素材（含 5.85 MB 疑似死模型 `hand_landmarker.task`） | ① 关态不再切 display：常驻 `display:block`，用 `opacity/visibility/pointer-events` + 与开态同 top/bottom/height 的盒子，`transition` 实现淡入+滑入（transition 优先级高于 !important）；JS 不再写内联 opacity/visibility。② 按审计删 717 行 / 24.6 KB（−22%）：重复块 + 被后续同选择器覆盖的旧规则 + 整段无 JS 使用的 `.phone-landscape` @media；保留 V62 转场/V77 几何/安全区/断点。③ 删死函数与空转补丁；4 个常驻 interval + 1 个按需轮询 → 单个 500ms 调度器（唤醒 3.6→2 次/s）；`hideFab` 的 2.5s `getBoundingClientRect`+CSS 变量写 → ResizeObserver；`ensureStructure` 改 MutationObserver 置脏触发；`styleLoginModal` 改打开时写一次；音量/词弹层合并为 `bindPlayerPopovers`；文件头加模块地图分区。④ 新增 `assets-skip-list.json`（42 条 A 级零引用素材）+ `repack_assets.py` 支持裁剪：APK 82,972,716 → 75,910,975 B（−7.06 MB / −8.5%）。真机回归 23/23 PASS、0 异常、0 404；详见 `docs/V78-NOTES.md`（v78c 修正见下一行） |
| v80-verify | 交接文档长期记录「音频缓存不存在（最高优先级待做）」 | 实测推翻该判断：宿主 `05-playback/12a-audio-cache.js` + 原生 `LocalAudioServer`（`files/downloaded-audio/` + 127.0.0.1 本地流 + 96MB/文件、4GB 总 LRU）已完整实现。真机验证：缓存命中冷启动 0.31~2.47s 出声且音频 0 请求；关 Wi-Fi+数据断网冷启动 0.31s 起播；未缓存歌首播 8.3s（平台取址慢）后自动缓存并跨重启生效；队列 24 首中 14 首已缓存；当前 22 文件/229MB。报告 `docs/AUDIO-CACHE-VERIFY.md`，并更正交接文档 §5.1 |
| v83 | ① 其它手机实测底栏 UI 显示不全（被系统手势条/三键导航压住）；② 播放页切回首页时歌曲信息条落位「缩一下/闪一下」 | ① WebView 里 `env(safe-area-inset-bottom)` 实测为 0，底栏只留 8px 就贴到系统条下面。新增 `--mr-sys-bottom: max(env(safe-area-inset-bottom,0px), 22px)`，底栏 bottom 改成 `8px + var(--mr-sys-bottom)`（实测底栏下沿距屏幕底 30px）；所有锚在底栏上方的元素（DIY 面板收/开态、歌单面板、首页内容、popover 150px/118px 锚点）同步加 `--mr-sys-bottom`，否则会压住底栏。② 两个原因：回程动画只做 translate，宽度从顶部 316 收到底栏 350 是落位换 DOM 时瞬间跳；且飞行前 `mr-track-bg-on` 被去掉 → 行半透明飞过首页文字＝闪。改为 FLIP 期间用 rAF 同步写 inline `width/height`（WAAPI 的 width 会被 CSS `!important` 盖掉），目标取 `#controls` 真实矩形；飞行期间保留行背景；`mr-track-away` 不提前去掉（会让底栏 138→89 再弹回）。逐帧验证：宽度 316→350 连续、底栏恒高 138、无半透明帧；回归 23/23 PASS |
| v82 | ① 播放页「词」和「音量」两个弹层可以同时展开、互相重叠；② 点「词→搜索歌词」后，在线歌词搜索弹窗不显示/被歌词校准弹层盖住、结果行右侧被切；③ 手机端首页每日卡片的「选择/更换 MP4、移除视频」媒体按钮没了（桌面端有） | ① `togglePopover` 改为 `togglePopover('vol'|'lyr')` + `closeOtherPopover()`：开一个先关另一个；② 包装宿主 `openLyricOnlineSearch`：先收 4UI 弹层/DIY 面板；`#lyric-online-modal` 的 z-index 从 260 提到 9800（原来被 9600 的弹层压住），手机端面板改为「留边满宽 + 可滚动 + 结果行 minmax(0,1fr) auto auto」，键盘弹出时面板自动缩到可视区（实测内高 533 时面板 56~524，行内「应用」不再被切）；③ 删掉对 `#home-dashboard-video-choose/-clear` 的 `display:none`，补手机排版（32px 高、12px 字号、自动换行），实测按钮恢复、点击弹出系统文件选择器（com.android.photopicker）可选 MP4。回归 23/23 PASS |
| v81 | 其它手机实测：顶部**搜索框与三点（⋯）按钮重叠**，且两者不等高（搜索框 58px、按钮 44px）。根因：两个元素是两套独立定位——`#search-area` 的 right 用 `clamp(52px,14vw,72px)`，窄屏（CSS 宽 <~395）时 52px < 按钮 44 + 右边距 12 = 56px，搜索框右缘压进按钮 1.4~4px；按钮尺寸被一条写死 `44px!important` 的旧规则覆盖，`#search-box` 被宿主 `#search-box{height:58px}` 覆盖 | `phone.css` 末尾加 v81 块：两点统一用 `--phone-chrome-height:48px`（按钮旧规则里写死的 44px 改成变量、圆角 16）；`#search-area{right:calc(clamp(68px,15vw,76px)+env(safe-area-inset-right))}`（= 48 按钮 + 12 边距 + 8 间距）；`#search-box{height:var(--phone-chrome-height)!important}`；`.phone-chrome-slot{top:calc(6px + safe-area)}` 与搜索框顶对齐。真机 391 宽：搜索框 48×315 @ (8,52)、按钮 48×48 @ (331,52)，**gap=8、等高、顶对齐**；320~720 十档视口全部 gap≥8 无重叠；回归 23/23 PASS、自适应矩阵无溢出 |
| v80 | DIY 面板**弹出来有滑入动画，收起来却是瞬间消失**（opacity 立即归 0），一开一关不对称、很生硬 | 关面板改成两段式：先给 body/panel 加 `.mr-diy-closing`，由 CSS 播 200ms「淡出 + 下滑 14px + 缩到 99%」，再由 `finishDiyClose()` 清状态；动画期间保留 `body.mr-diy-open`，中途再点 DIY 会 `cancelDiyClose()` 顺滑回弹。真机 screencast 逐帧：面板区域亮度 19.7→26.0→27.4→28.6→29.7→31.3（约 5 帧连续收拢），顶部搜索框/头像亮度全程恒定（无闪帧）；回归 23/23 PASS |
| v79 | ① 首页打开 DIY 面板后再点面板，会变成「之前的废案」（旧版几何：120px 贴底 / 630px 高 / 全宽抽屉），播放页没有；② 软件内提示条（网易云换源 / 酷狗降级）又压住顶部歌曲信息条；③ 点面板里的搜索框弹键盘后，面板缩成一小块（像旧版） | ① 两层根因：v78c 给 phone.css 插入规则时多打了一个 `}`，CSS 解析器把后面的「关态几何规则」整条丢掉；同时 phone.css 里还留着 4 条旧面板几何（V62 底部抽屉、V62 `.peek/.show{bottom:120px}`、V70、旧 console sheet 的 `right:0`）。宿主 auto-peek 一加 `.peek`，可见性/几何就退回旧规则 → 旧外观。删除多余 `}`、删 4 条旧几何、关态规则补 `.peek/.show/.pinned` 变体强制隐藏；开态几何恢复 66.4/269.9/379.8/710.7。② v78 把 `#source-fallback-stack` 引用缓存成 null（该节点是宿主**第一次弹提示才创建**的），之后永远拿不到 → 提示条停在宿主默认 top:72px，压住歌曲条。改为引用失效即重查、位置随 `.mr-top-track` 变化重设、并包 `showSourceFallbackNotice` 立即定位；真机：播放页 stack top=109（track bottom 101 + 8），不重叠。③ 输入框聚焦弹键盘时 vh 变小 → 面板按 31vh/底栏算出来只有 222px 高。加 `panelKbFit()`：键盘期把面板钉成 visTop+8、高=可视高-16，键盘收起立即清内联恢复；真机 8/517 ↔ 270/441 |
| v78c | ① 首页点 DIY 时顶部搜索框/头像闪 1~2 帧（用户复测）；② 播放页双击回正后视角锁死在正面，拖拽/缩放都无效 | ① screencast 逐帧定位：面板整层 opacity 动画期间形成「半透明鬼影」压住首页，同时下方 fixed 玻璃元素被重新栅格化掉亮度 → 改为「只滑入、不动 opacity」（面板 will-change:transform 常驻合成层，opacity 0/1 瞬时切换），并给 `#search-area` / `.phone-chrome-slot` 也挂 `will-change:transform` 常驻层；真机复测打开全程顶部区域亮度零抖动。② 宿主 `recenterCamera()` 会置 `orbit.centerLocked=true`（相机目标固定 baselineTheta，userTheta/userPhi/userRadius 全部失效）；宿主自己的 mousemove 拖拽里会调 `unlockCenteredView()`，我们走 touch 链路绕过了它 → 手机层在 touchmove 首次判定为拖拽时补调 `unlockCenteredView()` + 清 `recentering`，双指缩放同样解锁。真机：回正后 θ -0.003 → swipe → -0.716，`centerLocked=false` |

## 经验 / 坑

- **不要 zip 替换 assets**：会破坏 dex/FileProvider，必须完整 apktool 回编译。
- **不要用 MutationObserver 监听宿主 class**：宿主每帧改 class 会造成死循环（曾 109% CPU）。**但 `childList` 监听 `#controls/#bottom-bar` 子节点重建是安全且推荐的**（v78 用它把 `ensureStructure` 从轮询改成事件驱动）。
- **宿主对 `#bottom-bar` 有多层渐变规则**：CSS !important 会被覆盖，需内联样式强制。
- **转场动画与宿主状态要错开**：`setImmersiveMode` 会瞬改底栏，动画必须放在它之前，否则动画被掐断。
- **Android WebView 的 backdrop-filter 很贵**：尤其叠加动态 3D canvas 时，必须去掉。
- **音频缓存**：实测**没有实现**——补丁里 `ensureAudioCacheEnabled()` 只往 localStorage 写 `mineradio-audio-cache-v1` 标记，全工程无人读取；原生侧也无 `getCachedAudio/registerCachedAudio`。所以同一首歌关掉 App 再放仍要重新联网加载。下一步方案：Service Worker + Cache Storage（按「平台+歌曲 id/文件 hash」做 key、支持 Range、LRU 上限），详见交接文档。
- **v77 坑：宿主 `window` 捕获阶段的 touchstart 拦不住**。同节点同阶段按注册顺序执行，宿主脚本先加载，后注册的监听器无法 stopImmediatePropagation 掉它。解法是「取消默认行为」：覆盖层 `touchstart` 用 `{passive:false}` + `preventDefault()` → 浏览器不再合成 `mousedown/mousemove/mouseup/click`，宿主那套鼠标/click 逻辑自然收不到；touch/pointer 事件照常派发。实测（`window` 捕获日志）：轻点后只剩 pointerdown/touchstart/pointerup/touchend。
- **v77 坑：宿主 DOM 状态不能当作手机层的「开/关」判断**。`#fx-panel` 的 `.peek/.show` 会被宿主 hover/auto-peek 随时加减（合成 mousemove 在 DIY 键位置就会触发 `setPeek(fp,true,'fx')`），用 class 判断会得到「刚打开就以为开着」→ 再点变成关闭。开合只认 `window.__mrDiyOpen`，几何/可见性挂在 `body.mr-diy-open` 上。
- **v77 坑：`body.immersive-mode` 会钉死 DIY 相关元素**：`#fx-fab{pointer-events:none}`、`#fx-panel{opacity:0;visibility:hidden;pointer-events:none}`，且都是 `!important`。手机层必须用**内联 important** 才能覆盖（`hideFab()` 补 `pointer-events:auto`；开面板时补 `visibility/opacity/pointer-events`）。
- **v77 坑：CSS 特异性**：`body.phone-shell #fx-panel.peek`（1 id + 2 class）比 `body.phone-shell #fx-panel`（1 id + 1 class）高一档，旧规则会把 V70 的位置/最大高改回去（表现为面板 120px 贴底、压住底栏）。改面板几何必须用平级或更高的选择器。
- **v78 坑：`display:none` ↔ `block` 不会触发 CSS transition**。想在 WebView 上做「不闪」的开场，必须让元素常驻 `display:block`，只在 opacity/transform/visibility 上过渡；且过渡期间不要用内联 `!important` 写终态（transition 的级联优先级最高，内联 important 会把过渡变成硬切）。panel 的盒子（top/bottom/height）关态/开态要一致，否则会有一帧布局跳变。
- **v78c 坑：大面板不要用「整层 opacity 动画」开场**。半透明过渡会让面板变成「鬼影」压在首页上，同时 panel layer 的加入会改变 layer 树，把下方 `position:fixed` 的玻璃元素（搜索框/头像）重新栅格化，真机 screencast 实测掉 1~2 帧亮度（用户看到的就是「搜索框和头像闪一下」）。改成 transform-only 滑动 + 面板 `will-change:transform` 常驻层，并给 `#search-area`/`.phone-chrome-slot` 也挂 `will-change:transform`，顶部亮度全程零抖动。
- **v83 坑：`env(safe-area-inset-bottom)` 在这个 WebView 里是 0**（即便 meta 有 `viewport-fit=cover`）。底栏/浮层贴底时一定要给「至少 22px」的兜底，并且这个兜底要作为一个变量（`--mr-sys-bottom`）被所有锚定元素共用，否则抬了底栏、面板/歌单还按老公式定位就会互相压。
- **v83 坑：WAAPI 的 `width/height` 关键帧会被 CSS 的 `!important` 盖掉**（important 声明优先于动画）。要动画宽高只能自己 rAF 写 inline important；且第一帧要同步写一次，否则会先按 CSS 宽度闪一帧。
- **v83 坑：FLIP 的「目标矩形」必须量真实入栏后的 rect**，占位 slot 的尺寸和行不一样（260 vs 350）；另外别为了量尺寸提前去掉 `mr-track-away`——底栏会先塌到 89px，落位时再弹回 138px，又是一次闪。
- **v82 坑：兜底逻辑不要和「打开动作」互相打**。看门狗里「弹层开着就收起来」的兜底最初写成 `closeOtherPopover('')`，而它内部会在 `!keepKey` 时把刚打开的在线歌词模态也关掉 → 模态一闪就没（有 class 无 show）。兜底只应关它该关的那一类（`closeAllPopovers` 只动两个 4UI 弹层），模态的开关由模态自己管。
- **v82 坑：宿主弹层的 z-index 是按桌面排的**。`#lyric-online-modal` 只有 260，手机层 4UI 弹层是 9600、DIY 面板 8600、搜索区 9000，任何宿主模态都会被我方浮层盖住。再遇到「弹窗打不开/被挡住」，先查宿主浮层 z-index，并在 phone.css 里显式抬高（9800），同时把它的固定宽高改成手机可用的留边/可滚动布局。
- **v81 坑：同一行里的两个元素不要各自算位置**。`#search-area`（宿主 flex 容器）和三点按钮 slot（我们 `position:fixed`）是两套独立定位，靠 `right:clamp(...)` 手工留位，窄屏必然打架。今后这类「搜索框 + 右侧按钮」必须用同一个变量算右偏移（按钮宽 + 间距 + 安全区），并留出余量；另外小心旧规则里写死的 `44px!important`——它会被后面的新规则以为已经统一，实际还在生效（`getComputedStyle` 量出来 44 而不是变量值）。
- **v80 坑：关面板不能只删 class**。我们的开态/关态都是 class 驱动，直接 `body.classList.remove('mr-diy-open')` 会让关态 CSS 立刻生效（opacity 0），动画根本没机会跑。要做收起动画必须「两段式」：先加 closing class 播 transition，定时器结束后再删开态 class；并且要处理打断（动画中再点 DIY 时清定时器 + 移除 closing，面板从当前状态平滑回弹，不会跳）。
- **v79 坑：CSS 手工插入规则一定要检查花括号配平**。多一个 `}` 在 Chrome 里不一定会立刻报错，但可能让紧随其后的整条规则被丢弃（v78c 就因此丢了「关态几何」规则，表现为面板在关态/宿主 class 组合下退回旧几何）。改完 CSS 一定要：① `{`/`}` 计数相等；② 真机用 `CSS.getMatchedStylesForNode` 或 `getComputedStyle` 验证关键属性来自哪条规则。
- **v79 坑：一个元素不要留多套几何**。phone.css 里 `#fx-panel` 曾有 5 套历史几何（V62 底部抽屉 / V62 peek 120px / V70 / console sheet right:0 / V77）。只要宿主加一个 class 命中某套旧规则，用户就会看到「点一下变回旧版」。改版时要把旧几何**整条删掉**，而不是只在末尾追加覆盖。
- **v79 坑：宿主提示条容器是懒创建的**。`#source-fallback-stack` 第一次 `showSourceFallbackNotice()` 时才 `document.createElement` 并 append 到 body；任何「启动时缓存节点引用」的写法都会拿到 null 且永不更新。节点缓存要带 `isConnected` 失效重查。
- **v78c 坑：双击回正后镜头「锁死」是宿主的 `orbit.centerLocked`**。`recenterCamera()` 会置 `centerLocked=true`，updateCamera 里相机目标变成 `baselineTheta`，`userTheta/userPhi/userRadius` 全部被忽略；宿主自己的 mousemove 拖拽会调 `unlockCenteredView()`，手机层的 touch 拖拽必须自己补这一步（否则拖了等于没拖）。同理双指缩放也要解锁。
- **v78 坑：CSS 会「版本叠加」**。phone.css 是 v10→v77 不断在文件末尾追加形成的，22% 的行是被后续同选择器规则完全覆盖的死规则（还有 v46 合并三份 mobile CSS 留下的整段同源重复）。用「选择器 + 声明是否被后续精确覆盖」做保守审计后可以整块删；删前先 `git status`、删后跑 10 组视口矩阵 + 面板矩阵。
- **v78 坑：APK 体积要按「压缩后」算账**。repack 用 `compresslevel=6` 重压全包，原始大小的 1.5 MB 可能压缩后只有 300 KB；真正大头是 `assets/materials`(33.7%)、`assets/fonts`(20.3%)、`lib/`(14.5%)，web 素材只占 14.1%。裁剪实现放在 `assets-skip-list.json` + `repack_assets.py`（build.ps1 五步不变，日志打印 `trimmed=` 并断言 0 残留）。

## 未完成 / 可继续

1. **音频缓存：已实现，不需要重写**（2026-11-18 验证，详见 `docs/AUDIO-CACHE-VERIFY.md`）。宿主 `12a-audio-cache.js` + 原生 `LocalAudioServer` 已提供「播前查本地 → 后台 warm → 预取下 3 首 → 4GB LRU」，真机实测缓存命中冷启动 0.31~2.47s、音频 0 网络请求、断网冷启动 0.31s 起播。剩余可选增强：批量预缓存队列/歌单、缓存管理 UI（原生需加 clear/stats 方法）、首播提速（提前取址，费流量）。
2. **字号下限**：仍有约 58 个 <10px 的小标签（KG、卡片副标题等），建议用 `--mr-font-xs` 系列统一 clamp 到 12px 下限。
3. **软键盘**：弹层按窗口高定位，未监听 `visualViewport.resize`，键盘弹起时极端情况可能被遮挡。
4. **720px 以上宽度**：宿主自身的桌面布局规则（`min-width:721px`）与手机层硬覆盖并存；本版靠底栏/面板变量化保证可用，平板专属首页两栏仍是宿主桌面几何，若要"平板原生感"需单独设计。
5. **横屏**：手机层那套 `.phone-landscape` 规则已在 v78 整块删除（无 JS 添加该 class，属死代码），当前横屏走 `orientation:landscape` 查询；若要完整横屏布局，需要新写一套基于真查询的规则。
6. 3D 粒子在 WebView 上仍可能掉帧，可加「性能模式」开关（降粒子/关后效）。
7. **再压体积（v78 审计结论）**：`assets/materials` 28 MB 需要「内置场景/Particle 预设 → 材质」映射才能判定哪些 `.tex` 未被引用；`folia-visualizer` 的预设图 WebP 化约可再省 2 MB；`NotoSansCJK` 子集化风险高（可能缺字），不建议盲目做。