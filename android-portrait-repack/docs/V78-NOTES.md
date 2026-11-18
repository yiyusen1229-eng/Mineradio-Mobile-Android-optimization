# V78 笔记：DIY 面板开场闪烁修复 + 精简/去重/体积裁剪

> 目标：① 修掉打开 DIY 视觉控制台时的「闪一下」；② 清理废弃代码/重复实现；③ 轻量化、降复杂度、缩体积。
> 结果：APK 82,972,716 → **75,910,975 B（−7,061,741 B / −8.5%）**；phone.css −717 行 / −24,585 B（−22%）；
> mr-phone.js 删除 2 个死函数 + 2 个空转补丁、4 组重复监听/轮询合并；真机 23 项功能回归全过、0 异常、0 404。

---

## 1. 打开 DIY 面板「闪一下」的根因与修法

**现象**：点 DIY 键，面板瞬间出现并伴随 1 帧糊/跳（不是动画）。

**根因**：
1. 旧实现关态 `#fx-panel{display:none}`，开态用内联 `!important` 直接写 `display:block/opacity:1`。
   `display` 从 none → block **不会触发 CSS transition**，元素在**第一帧就被满不透明画出来**；
   WebView 对新出现的合成层还会先用低分辨率栅格 → 肉眼看就是「闪一下 + 糊一帧」。
2. 宿主 `#fx-panel{right:-460px;bottom:92px;transition:right .55s,opacity .45s,transform .55s}` 与
   手机层 V70 的 `transform:translate(14px,22px) scale(.92)` 在 display 切换时会把 transform 的旧值暴露出来。

**修法**（`phone.css` V78 / `mr-phone.js` `setDiyPanel`）：
- 关态**不再切 display**：`display:block` 常驻，用 `opacity:0 + visibility:hidden + pointer-events:none` 隐藏；
  开态 `opacity:1 + visibility:visible + transform:none`。`transition` 在 CSS 级联里优先级最高（高于 `!important`），
  因此能盖过这些终态声明，得到真正的 160~180ms 淡入 + 10px 上移。
- 关态盒子与开态**同 top/bottom/height**（`top:31vh; bottom=底栏上沿-14px`），只在 transform/opacity 上过渡，
  打开瞬间不会发生布局跳变。
- JS 不再写内联 `opacity/visibility/pointer-events`（只保留 `display:block` 兜底），避免内联 `!important` 把过渡打成硬切。
- 关态兜底：`body.phone-shell:not(.mr-diy-open) #fx-panel{pointer-events:none}`，宿主 auto-peek 抖动也抢不到点击。

**验证**：CDP screencast 逐帧（~40fps）测开场：旧实现 1 帧从「舞台」直接跳到「满不透明面板」；
新实现 3~4 帧亮度线性过渡（panel 区域 mean 28.3 → 30.0 → 20.2 → 18.8 → 15.8），无糊帧、无硬切。

---

## 2. CSS 精简：717 行 / 24.6 KB（−22%）

依据 `_tmp/audit/css-audit.md`（对 sha256 `646ebb80…` 快照逐条给出「删除段 + 覆盖者行号」）：
- **Batch A（零风险，35 段 / 132 行 / 6,940 B）**：同一选择器 + 同一组声明在后面重复出现的前一份；
  以及被后续同特异性规则逐条覆盖的旧 `#bottom-bar` / `#fx-panel` / `#search-area` / `#playlist-panel` / 转场规则。
- **Batch B（低风险，108 条规则 / 585 行 / 17,645 B）**：整段横屏 `.phone-landscape` @media（315 行，无任何 JS 添加该 class，
  DEVLOG v58 已书面确认死代码）；`.folia-home-wall*`、`#web-diy-btn`、`#bridge-extension-notice`、旧 `.login-stage-*`、
  `.daily-review-*` 旧按钮、`#playlist-panel-sub`、旧队列浮层等 31 个 token 在宿主 bundle + 补丁里 0 命中。
- 结果：2,978 行 / 111,896 B → **2,267 行 / 87,642 B**；`{`/`}` 配平、无空规则、无悬空逗号。
- **未动**：V62 转场块（2492–2682）、V77/V78 面板几何、FLIP 守卫、安全区、响应式变量 clamp 断点（报告 §6 有完整清单）。

---

## 3. JS 精简与结构（v78）

| 类型 | 处理 |
|---|---|
| 死函数 | 删 `bindInstantPause`（14 行，0 调用）、`layoutPlayerExtras`（3 行，0 调用） |
| 空转补丁 | 删 `patchBridgeCache`（28 行：`index.html` 早期补丁先置 `__mrBridgeCache=1`，恒早退）、`ensureAudioCacheEnabled`（9 行：写入值等于宿主默认 true，无 UI 能写 false） |
| 定时器 | 4 个常驻 interval（2.0/2.5/0.5/1.5s）+ 1 个按需 250ms 轮询 → **1 个 500ms 调度器**（tick 取模分频）+ 事件驱动：唤醒 3.6→2 次/秒 |
| 底栏高度 | `hideFab` 每 2.5s 的 `getBoundingClientRect` + 全文档 CSS 变量写 → **ResizeObserver** 事件驱动（0.4 次强制布局/秒 → 0） |
| 内联样式 | `styleLoginModal` 每 2.5s 重写 19 条 `!important` → 每次打开只写一次；`layoutPhoneBar` 的 collect-btn 只在需要时写；`keepDiyPanelOpen` 250ms 轮询 → 开面板后一次性 500ms 复查 |
| 结构补丁 | `ensureStructure`+`reorderProgressBar` 由 `MutationObserver(#controls/#bottom-bar)` 置脏触发，稳态零查询；进度时间缓存节点 + 文案 diff |
| 事件合并 | 音量/词两个逐行重复的弹层开关（~70 行）→ `bindPlayerPopovers` 一个实现；document 捕获 click 5→2、pointer/touch 7→3；`#mr-stage-overlay` 6 事件→4；DIY 键 4 事件+1.5s 重绑→2 事件 |
| 小修 | `placePopover` 里 `var barEl` 遮蔽同名函数的隐患改名；`bindTrackEnter` 不再每次点击读 `getComputedStyle(home).opacity`（改用 `empty-home-active` class）；头像角标节点缓存 |
| 结构 | 文件头加「模块地图」，正文按 §1 启动/§2 DIY/§3 舞台/§4 导航/§5 Chrome/§6 转场/§7 宿主钩子/§8 缓存/§9 弹层/§10 通知/§11 底栏/§12 歌单/§13 手势/§14 入口 分区 |

> 说明：宿主 3D 渲染循环占空闲 CPU 大头，patch 侧这些改动的墙钟收益在 `Performance.getMetrics` 里淹没在噪声里，
> 因此以「代码级确定性指标」为准：常驻定时器 4→1、强制布局 0.4→0 次/秒、轮询写样式 ~8→0 次/秒、patch 自身 DOM 查询约 17.5→5 次/秒。

---

## 4. APK 体积裁剪：−7.06 MB（−8.5%）

依据 `_tmp/audit/assets-audit.md`（全量引用闭包 + 运行时资源实测 195 条 + 13 dex/2 so 字符串扫描）：

- **A 级 41 条 web 素材（压缩后 1,192,094 B）**：零引用，如 `vendor/sonic-workshop/preview.gif`(914 KB)、
  `folia-visualizer/assets/visualizer-*.js.bak`(216 KB)、`desktop-lyrics.html`、folia 的 3 个未使用 worker、
  bgutils 的 `.d.ts/.map` 构建残渣、两个 0 字节 cordova 文件等。
- **`assets/hand_landmarker.task`（5,853,781 B）**：全 APK 13 dex + 2 so + 所有 js/json **0 字符串命中**，
  包内也没有 MediaPipe/TFLite 运行时 —— 官方桌面版遗留的手部追踪模型。删除后真机启动/播放/面板/网络全量冒烟通过。
- **实现**：`_tmp/build-v62/assets-skip-list.json`（42 条）+ `repack_assets.py` 支持 skip-list；
  `build.ps1` 五步流程（替换 assets → zipalign → apksigner → verify → digest）保持不变，
  日志会打印 `trimmed=42 (-7045875 B)` 并断言清单条目 0 残留。
- **不能动的**：`assets/materials`（28 MB，WE 场景运行时材质库，`libscenejni.so` 有 41 处引用）、
  `assets/fonts/NotoSansCJK`（15.5 MB，so 引用）、`lib/`（12 MB）、`assets/public/folia-visualizer`（7.6 MB，歌词动画按需 iframe）
  与 `vendor/sonic-workshop`（1.5 MB，音域回响按需 iframe）—— 这些属功能资源，砍功能才能省，不在本次范围。

---

## 5. 真机验证（OnePlus 24031PN0DC / 1440×3200 / dpr 3.675）

- `regress-v78.js`：**23/23 PASS**，0 JS 异常、0 console.error。覆盖：进入/退出播放页（底栏恒高 137.7）、
  舞台左半边轻点（无鼠标事件、不弹歌单、不动镜头）、拖拽旋转、双击回正（theta 0.688→0.003 + toast）、
  DIY 开/几何 66.4/269.9/379.8/710.7/关/再开/点外部关、词与音量弹层各开合两次、返回键、搜索展开、菜单→歌单。
- `adaptive-test.js`：320×568 ~ 800×1280 + 2 组横屏，`overflowX/Y=false`、底栏 inside、无裁切回归。
- `panel-matrix.js`：10 组视口 DIY 面板均 80vw（大屏 460px 封顶）、不压底栏（间隙 6.6~14.4px）、标签栏无溢出。
- `net-check.js`：整页 reload + 打开/切 DIY 标签，HTTP≥400 = 0、loadingFailed = 0（裁剪没有删到运行时资源）。
- 登录弹层（菜单→登录）打开后仍居中/圆角/可滚动（`styleLoginModal` 改一次性写入后验证）。
- 冷启动 `am start -W TotalTime≈1.40s`；覆盖安装保留数据。

---

## 6. 回滚 / 后续

- 回滚代码：`git revert` 本提交即可（patch-layer 两个文件 + DEVLOG）。
- 回滚素材：从 `_tmp/build-v62/assets-skip-list.json` 去掉对应条目重新 build 即可（无需改脚本）。
- 若发现手部追踪相关功能异常（本次静态证据为 0 引用）：把 `assets/hand_landmarker.task` 从 skip-list 移除后重建。
- 下一步（未做，收益/风险见 assets-audit §4.5）：`assets/materials` 场景→材质引用映射（最多可省十几 MB，工程量较大）；
  `folia-visualizer` 预设图 WebP 化（~2 MB）；`NotoSansCJK` 子集化（风险高，可能缺字）。

---

## 7. v78c 补丁（用户真机复测反馈的两个问题）

### 7.1 首页点 DIY 时顶部「搜索框 + 头像」闪 1~2 帧

**定位方法**：CDP `Page.startScreencast` 逐帧抓图（~40fps），对帧内 CSS 区域算亮度：
- 修复前：面板打开瞬间有 1~2 帧 `搜索框 44.7→41.4`、`头像 69.2→44.2`（掉 ~35% 亮度），且面板本身呈现**半透明鬼影**（文字浮在首页内容上）。
- 原因：面板开场用的是**整层 opacity 动画**。过渡中面板本身半透明 → 变成鬼影；同时 panel 加入 layer 树改变了整页合成层结构，下方 `position:fixed` 的玻璃元素（搜索框/头像层）被重新栅格化，出现 1~2 帧掉亮度。
- 修法：
  1. 面板开场改为**只滑入、不改 opacity**（opacity 0/1 瞬时切换，transform `translateY(12px)→none` 0.18~0.20s）；
  2. 面板 `will-change:transform` 常驻合成层（不是临时新建）；
  3. `#search-area`、`.phone-chrome-slot` 也挂 `will-change:transform`，各自常驻合成层，不再被 panel 的 layer 变化牵连。
- 复测：打开全程 `搜索框 44.7`、`头像 69.1` 逐帧恒定，0 抖动；面板首帧即满不透明，无鬼影。

### 7.2 播放页双击回正后视角锁死、无法再调整

**原因**：宿主 `recenterCamera()`（双击回正/镜头回正按钮）会置 `orbit.centerLocked = true`。updateCamera 的分支是：
`if (orbit.centerLocked) targetTheta = orbit.baselineTheta ...`，即相机目标固定为基准位，**`userTheta/userPhi/userRadius` 全部被忽略**。
宿主自己的拖拽逻辑在 mousemove 里会先调 `unlockCenteredView()`（只做 `centerLocked=false`），而手机层走的是 touch 链路（`#mr-stage-overlay`），绕过了那段 mousemove → 拖动只改了 userTheta，画面却锁在正面。

**修法**：`bindStageDrag` 的 touchmove 里，首次判定为拖拽（位移 >10px）时补调 `window.unlockCenteredView()` 并清 `orbit.recentering`；`registerPinchZoom` 的缩放同样解锁（否则半径也不生效）。
**真机验证**：swipe 旋转 → θ -0.714 → 双击回正 → θ -0.003 / toast 视角回正 / `centerLocked=true` → 再 swipe → θ **-0.716**、`centerLocked=false`（画面跟随拖动）。
---

## 8. v79：点一下面板变回「旧废案」+ 提示条压歌曲信息

### 8.1 为什么点一下会变成旧面板

两个原因叠加：

1. **CSS 被一个多余的 `}` 弄坏**：v78c 往 phone.css 插「常驻合成层」规则时多写了一个 `}`，Chrome 的解析器把紧随其后的「关态几何规则」整条丢掉了（`getComputedStyle` 里看不到它，`document.styleSheets` 里也没有）。
2. **phone.css 里还留着 4 套旧面板几何**，只要宿主 auto-peek 给 `#fx-panel` 加上 `.peek`（首页点面板就会触发），就会命中其中一套：
   - V62 底部抽屉：`top:auto;bottom:0;left:0;right:0;width:100%;transform:translateY(110%)`
   - V62 `.peek/.show`：`bottom:120px; max-height:calc(100vh - 240px)` ← 用户截图那套「120px 贴底、630px 高」
   - V70：`right:8px; bottom:bar+8; width:92vw; max-height:64dvh`
   - 旧 console sheet：`.peek/.show/.pinned{right:0!important}`（还会把开态面板推到 right:0）

**修法**：删掉多余的 `}`；4 套旧几何整条删除（不再「末尾追加覆盖」）；关态规则补 `.peek/.show/.pinned` 变体并强制 `opacity:0/visibility:hidden/pointer-events:none`；开态几何保持 V77 的 66.4/269.9/379.8/710.7。验证：开态/关态/关态+强制 .peek.show.pinned 三种状态都取到同一套几何，关态永远不可见。

### 8.2 提示条压住歌曲信息

`#source-fallback-stack` 是宿主**第一次弹提示时才创建**的节点（`ensureSourceFallbackStack()` 里 createElement + append 到 body）。v78 的「节点引用缓存」在启动后第一次 tick 把它缓存成 `null`，之后永远不刷新 → 提示条永远用宿主默认几何 `top:72px; right:24px`，正好压在播放页顶部歌曲信息条上。

**修法**：引用失效（`!el || !el.isConnected`）就重查；位置每次按 `.mr-top-track` 的 bottom+8 重设（不再只设一次），并包装宿主 `showSourceFallbackNotice`，弹提示的同一帧就定位。真机：播放页 stack top=109（track bottom=101），8px 间隙、z-index 9600，不再重叠；首页无 track 时用 126px 兜底。

### 8.3 键盘弹出时面板缩成小块

点面板里的搜索框会弹软键盘，WebView 的布局视口从 870 变成 533，`top:31vh` + 底栏计算出的面板只剩 222px 高。加 `panelKbFit()`（监听 `visualViewport.resize` / `resize` / `focusin`/`focusout` + 500ms 调度器兜底）：键盘期间把面板钉成 `top=visTop+8 / height=可视高-16`，键盘收起立刻清掉内联、恢复 270/441。实测 8/517 ↔ 270/441 往返正常。
---

## 9. v80：DIY 面板收起动画（原来关闭是瞬间消失）

**原因**：开/关都是 class 驱动——`setDiyPanel(false)` 直接 `body.classList.remove('mr-diy-open')`，关态规则里的 `opacity:0` 立即生效，所以没有过渡可播；用户看到的就是「开有滑入、关是硬切」。

**改法（两段式关闭）**：
1. `setDiyPanel(false)` 只标记 `__mrDiyOpen=false` + 加 `body.mr-diy-closing` / `panel.mr-diy-closing`，保留 `mr-diy-open`；
2. CSS `.mr-diy-closing` 规则（特异性 1,3,1，追加在开态规则之后）：`opacity:0; transform:translateY(14px) scale(.99); transition: transform .18s cubic-bezier(.22,.9,.25,1), opacity .15s ease-out`；
3. 200ms 后 `finishDiyClose()` 才清 `mr-diy-open` / `.peek` / closing；
4. 动画中途再点 DIY：`cancelDiyClose()` 清定时器 + 移除 closing，面板从当前过渡状态平滑回弹。

**验证**：screencast 逐帧（~50fps）面板区域亮度 19.7→26.0→27.4→28.6→29.7→31.3（5 帧连续收拢，无硬切），顶部搜索框/头像亮度 44.6/68.9 全程恒定（没有把 v78c/v79 修掉的闪帧带回来）；开/关/再开/动画中打断均正常，回归 23/23 PASS。
---

## 10. v81：顶部搜索框 ⇄ 三点按钮对齐（其它手机实测）

**现象**：换到别的手机后，顶部搜索框右端与「⋯」按钮重叠，且两者高度不一致（搜索框 58px、按钮 44px）。

**根因**（两套独立定位叠加）：
1. `#search-area` 的 `right` 是 `clamp(52px, 14vw, 72px)`；按钮宽 44 + 右边距 12 = 56px。窄屏（CSS 宽 < ~395）时 52 < 56 → 搜索框右缘压进按钮 **1.4~4px**（实测 320~390 全中）。
2. 按钮尺寸被旧规则 `body.phone-shell #phone-chrome-more{width:44px!important;height:44px!important}` 写死；搜索框被宿主 `#search-box{height:58px}` 覆盖。我们媒体查询里的 `--phone-chrome-height:48px` 实际上两边都没生效。

**修法**（`phone.css` 末尾 v81 块 + 改旧规则）：
- 旧 44px 规则改成 `var(--phone-chrome-height, 48px)` + 圆角 16；
- `#search-area{right: calc(clamp(68px, 15vw, 76px) + env(safe-area-inset-right))}`（48 按钮 + 12 边距 + 8 间距）；
- `#search-box{height:var(--phone-chrome-height,48px)!important}`；
- `.phone-chrome-slot{top:calc(6px + env(safe-area-inset-top))}` 与搜索框顶对齐。

**验证**：391×870 真机 → 搜索框 48×315 @ (8,52)、按钮 48×48 @ (331,52)：**gap=8、等高、顶对齐**；CDP 模拟 320/340/360/375/390/400/412/420/432/440/460/480/500/540/600/720 共 16 档视口，全部 `overlap=false`、`gap≥8`、高度恒 48；菜单下拉仍锚在按钮下方（right 对齐）；搜索展开/键盘布局正常；回归 23/23 PASS、10 组自适应矩阵无溢出。
---

## 11. v82：弹层互斥 + 在线歌词搜索显示 + 首页媒体按钮

### 11.1 「词」和「音量」弹层可同时打开、重叠
`bindPlayerPopovers` 里两个 toggle 各管各的。改为 `togglePopover('vol' | 'lyr')`：
打开前先 `closeOtherPopover()` 收起另一个（并把它的 `__mrPopOpen`/`mr-open` 清掉、立即 `hidePopover`，不等 80ms 兜底）。
另外加了看门狗兜底：DIY 面板或在线歌词模态打开时，`closeAllPopovers()` 收起 4UI 弹层。

### 11.2 「搜索歌词」弹窗不显示 / 被歌词校准弹层盖住
- 宿主 `#lyric-online-modal`（`.lyric-online-mask`）的 `z-index` 只有 **260**，而 4UI 弹层是 9600、DIY 面板 8600、搜索区 9000 → 弹窗永远在下面；
- 打开时旧弹层还开着，于是「弹窗被歌词校准弹层压住」；
- 面板是桌面尺寸（`min(680px,92vw)`、`76vh`），窄屏结果行的「应用」按钮会被面板右边切掉。

修法：
1. 包装 `window.openLyricOnlineSearch`：先 `closeAllPopovers()` + 关 DIY 面板，再调宿主原函数；
2. phone.css 里 `body.phone-shell #lyric-online-modal.lyric-online-mask{z-index:9800}`，面板 `width:100%; max-width:min(560px,100%)`，`max-height:calc(100dvh - 20px - safe-top - safe-bottom)`，`grid-template-rows:auto auto auto minmax(0,1fr)`，结果区 `overflow-y:auto`；
3. 结果行改 `grid-template-columns:minmax(0,1fr) auto auto`、缩小标签/按钮尺寸。

实测：391×870 下弹窗 12~380 居中、结果 24 条，行宽 338 不越界；点输入框弹键盘（内高 533）后面板 56~524 自适应，行内「应用」完整可见。

### 11.3 手机端首页「媒体」按钮（选择/更换 MP4、移除视频）
桌面每日卡片有 `#home-dashboard-video-choose`（选择/更换 MP4）、`#home-dashboard-video-clear`（移除视频，宿主按是否有视频切 hidden），但 phone.css 早期把它们和 `.daily-review-btn.ghost` 一起 `display:none` 掉了。
v82 只保留 ghost 的隐藏，恢复两个视频按钮，并按手机排版（32px 高 / 12px 字号 / 换行 / 圆角 12）。实测：首页卡片恢复「换一条 / 选择 MP4 / 展开播放器控制台」（未选视频时「移除视频」按宿主逻辑隐藏），点「选择 MP4」弹出系统文件/视频选择器（com.android.photopicker），可选 MP4；宿主用 IndexedDB 存视频 + 300MB 上限。
---

## 12. v83：底栏系统条安全区 + 返回首页信息条落位闪烁

### 12.1 底栏 UI 在别的手机显示不全
实测（本机 WebView 157）：`env(safe-area-inset-bottom)` **恒为 0**，虽然 meta viewport 有 `viewport-fit=cover`。底栏原本 `bottom: calc(8px + env(...))` → 只离屏幕底 8px，换到手势条高的手机就被盖住一截。
修法：定义 `--mr-sys-bottom: max(env(safe-area-inset-bottom, 0px), 22px)`，底栏 `bottom: calc(8px + var(--mr-sys-bottom))`；并把所有「锚在底栏上方」的定位同步加上它：
- DIY 面板开/关态、横屏态 bottom
- `#playlist-panel` 两处、`#empty-home` 内容底边
- 固定像素锚定的 popover（150px / 118px 两处）

实测：底栏下沿距屏幕底 **30px**（原 8px），DIY 面板底 688.8 / 底栏顶 703（间距 14px，未被压）。

### 12.2 切回首页时歌曲信息条「缩一下/闪一下」
三个原因叠加：
1. 回程 FLIP 只做 `translate`，行在顶部宽 316、入栏后由 `#controls` 撑到 350，落位换 DOM 时宽度瞬间跳变；
2. `dropTrackRow` 一开始去掉了 `mr-track-bg-on` → 飞行途中行没有背景，半透明地掠过首页文字；
3. 早期尝试为了量目标尺寸提前去掉 `mr-track-away` → 底栏高度 138→89 再弹回。

修法：
- FLIP 期间用 rAF 同步写 inline `width/height!important`（WAAPI 的 width/height 关键帧会被 CSS `!important` 盖掉），缓动与 `MR_EASE` 同一条 cubic-bezier；第一帧同步写一次防闪帧；落位/取消时清掉内联。
- 目标矩形取 `#controls` 的真实 rect（=`入栏后行的 rect`），不用占位 slot。
- 飞行期间保留 `mr-track-bg-on`，`mr-track-away` 等落位后再去掉。
- 起飞方向（首页→播放页）同样补宽高插值（350→316）。

逐帧验证（CDP screencast + 每帧量 rect）：宽度 316→350 连续无跳、底栏恒 138、飞行帧不透明；回归 23/23 PASS。
---

## 13. v84：主页 MP4 保存失败（localStorage 配额）+ 落位封面/背景闪

### 13.1 「主页 MP4 保存失败」
复现方式：直接在页面里用合成 File 调宿主 `handleHomeDashboardVideoFile(file)`（跳过系统选择器），捕获 console.warn：

```
[HomeDashboardVideoSave] QuotaExceededError: Failed to execute 'setItem' on 'Storage':
Setting the value of 'mineradio-home-dashboard-video-meta-v1' exceeded the quota.
```

宿主流程图：校验 .mp4 / ≤300MB → `homeDashboardPutVideoBlob()` 写 **IndexedDB**（成功）→ `localStorage.setItem(meta)`（**失败**）→ catch 里提示「主页 MP4 保存失败」。

根因：localStorage 已经吃满 5.24MB（浏览器上限 5MB 左右），其中：
- `mr-api-cache:*` ≈ **3.97MB**
- `mr_chrome_storage__beatmap:*` ≈ 0.80MB
- `mr-bridge-cache:*` ≈ 0.34MB

这些全是可再生的网络缓存，meta 只有几百字节却写不进去。

修法（patch 层，不动宿主）：
1. `--mr-sys-bottom` 同级思路新增 localStorage 保护：启动时若用量 > 3.6MB，删除前缀为 `mr-api-cache:` / `mr-bridge-cache:` / `mr_chrome_storage__beatmap:` 的 key；
2. 包裹 `Storage.prototype.setItem`：遇到 quota 错误先清缓存再重试；仍失败则写入内存兜底表，`getItem` 能读回（本次会话功能不受影响）；`removeItem` 同步清兜底。

实测：启动清理 **3774 个 key，5.24MB → 135KB**；再走 `handleHomeDashboardVideoFile` → toast「主页 MP4 已保存」，meta 落库，按钮从「选择 MP4」变「更换 MP4」。

### 13.2 返回首页时封面缩一下 / 信息条闪一下
逐帧（rAF 60fps）量几何：
- 播放页顶部条：行高 47、封面 **47×47**（`width:var(--mr-row-h)`，本机 `5.4vh≈47px`）
- 首页底栏：行高 47、封面 **44×44**（基础规则写死 44px）
→ 落位换 DOM 的同一帧封面缩 3px（用户说的「封面缩小闪一下」）。

另外飞行时行的背景由 `.mr-top-track::before` 渐变提供，落位去掉 class 后渐变**瞬间**消失 → 亮度硬切（「信息条闪一下」）。

修法：
- 底栏封面也改成 `var(--mr-row-h, 44px)`（两边同源，实测 47↔47 连续）；
- 给底栏里的行补一条同款 `::before`（默认 `opacity:0` + `transition:opacity .2s`），落位去掉 `mr-track-bg-on` 后渐变淡出。

验证：`return-capture` 逐帧 + DOM 采样 → 行元素未被替换（marker 一致）、封面尺寸全程 47、行位置从 (12,54) 平滑到 (21,712)、底栏恒高 138、无空白帧；回归 23/23 PASS、自适应矩阵无溢出。

### 13.3 还没完全确认的一点
「信息条消失」如果指的是**飞行途中底栏那行是空的**（行在顶部，正往底栏飞，约 400ms），这是当前 FLIP 设计本身；需要改成「底栏留占位/交叉淡入」才能消掉。等确认是这种观感再动，避免又改出别的问题。
---

## 14. v85：归位闪烁的真因——底框盖住 DIY 键

用户观察到的现象翻译成布局语言：落位那一下，信息条的背景层把右上角 **DIY 按钮**盖住，随后 DIY 回到上层 → 一帧闪。

验证方法：用 `return-capture` 抓逐帧，测量 DIY 按钮区域（CSS `336..375 × 712..751`）的平均/峰值亮度：

| 时间 | DIY 区域亮度 | 峰值 |
|---|---|---|
| 基线（未开始转场） | 44.5 | 255 |
| 落位前后 700~880ms | **30.7 ~ 40.8**（被压暗） | 176~232 |
| 落位 200ms 后 | 44.5（恢复） | 255 |

两个叠加来源：
1. **飞行中的行背景** `.control-cluster.actions.mr-top-track::before`（渐变）右边界是 `-8px`，行宽 350 且右侧给 DIY 留了 52px，渐变正好铺到 DIY 上；行此时 `z-index:8400`，在 DIY（z-index 6）之上 → DIY 被盖。
2. **v84 新加的底栏行 `::before`**（为了让落位背景淡出）在落位后仍以 `opacity:1` 存在 0.2s 才淡完，而它同样延伸到 DIY 区域。

修法（`phone.css`）：
- 飞行渐变 `inset:-8px -8px -8px -10px` → **`inset:-8px 52px -8px -10px`**（右侧 52px = 行给 DIY 预留的空间），并加 `mask-image:linear-gradient(90deg,#000 0,#000 84%,transparent 100%)` 让右边缘渐隐，避免出现一条硬边；
- **删掉** v84 给 `#bottom-bar .control-cluster.actions` 加的那层 `::before`（保留封面同源尺寸那条）。落位后行本身没有背景，底栏玻璃由 bar 提供，DIY 始终在最上层。

验证：同一段转场逐帧测 DIY 区域亮度 **恒定 44.5~44.6**（全程 255 峰值），不再有压暗段；封面 47↔47、行位置 (12,54)→(21,712) 连续、底栏恒高 138；回归 23/23 PASS。

另外确认用户真机已用 v84 成功保存 `1000112076.mp4`（3.6MB，meta 落库、按钮变「更换 MP4」），说明 localStorage 配额修复在真实选择器路径下也生效。
---

## 15. v86：歌单面板——缓存 / 展开后滚动 / 吸顶

### 15.1 每次打开歌单都要等加载
宿主 `apiJson()` 直接 `fetch`，没有缓存层；旧 v6x 手机层曾在 `mr-phone.js` 里包了 `window.fetch` 做
`mr-api-cache:` 的 localStorage 缓存，v78 重构时当成「废弃代码」删掉了 → 每次冷启动/列表重建都要重新拉
`/api/user/playlists` 等接口。

新增缓存（patch 层，不动宿主）：
- 内存 `Map`（命中即返回）+ IndexedDB `mr-api-cache-v1/kv` 持久化，TTL 20 分钟，超过 400 条按时间淘汰；
- 只缓存同源 `GET /api/*`（排除 mp3/封面/二进制）；
- 命中时返回 `new Response(JSON.stringify(data), {headers:{'X-MR-Cache':'1'}})`，宿主 `res.json()` 无感；
- **关键坑**：宿主 `00-state/00-runtime-log.js` 会在手机层脚本之后再次替换 `window.fetch`（日志包装），
  把我们第一次包的覆盖掉了。所以安装函数做成可重入：保存 `state.wrapped`，看门狗每 tick 检查
  `window.fetch === state.wrapped`，不等就重新包到最外层。

实测：同一接口第一次 75ms、第二次 **1ms 且 `x-mr-cache:1`**；IndexedDB 记录数随请求增长。

### 15.2 展开歌单滚到底看不到其它歌单
`#pl-list`（内部滚动容器）被设为 `overflow:auto`，但宿主虚拟列表（`renderUserPlaylistsList`）是用
`panel.getBoundingClientRect()` / `panel.scrollTop` / `panel.clientHeight` 算可见窗口的 → 滚动发生在
内层，窗口永远停在顶部；展开的 detail 由 inline `height:5562px` 撑开，滚到底只看到空白
`playlist-virtual-spacer`，其后的其它歌单永不渲染。

改法（phone.css）：面板自己滚、内部容器不滚：
- `#playlist-panel{overflow-y:auto}`；
- `#pl-pane/#queue-pane/#podcast-pane/#local-pane{flex:0 0 auto;height:auto;overflow:visible}`；
- `#pl-list/#queue-list/#podcast-list/#local-songs-list{flex:0 0 auto;height:auto;overflow:visible}`；
- `.pl-inline-detail{display:block;overflow:visible}` 但**不能改 height**（宿主用 inline height 预留整段高度，
  改掉会让 sticky 容器塌陷、虚拟行算错位置——这是个坑，已经踩过一次）。

实测：展开「我喜欢（297 首）」→ 面板 scrollHeight 6690，滚到 6060 时 `我的2025年度歌单` 等卡片渲染在视口内。

### 15.3 展开歌单的标题/封面吸顶
宿主本身有 `.pl-detail-sticky{position:sticky;top:126px}`，但 phone.css 里 v6x 规则写成了
`position:static!important` 把它关掉了。恢复：
- `.pl-detail-sticky{position:sticky!important; top:var(--mr-pl-head-h,120px)!important; z-index:12}`；
- `--mr-pl-head-h` 由 `updatePlaylistStickyVars()` 按面板头部（`.playlist-panel-sticky`）实测高度写入，
  看门狗里每 tick 更新；
- 面板头部本身也 `position:sticky; top:0; z-index:14`，带不透明渐变底。

实测：面板头 73~194、歌单头 195~326 全程钉住，歌曲行从下面滚过（见截图）。
---

## 16. v87：歌单面板滑动一直闪烁

**现象**：打开歌单面板，上下滑动时整片闪。

**根因**：宿主的虚拟列表 `schedulePlaylistPanelVirtualRender()` 用 rAF 节流，但每次 scroll 都执行
`renderUserPlaylistsList()` → `$pl.innerHTML = html` **整段重建**。重建会重新创建所有 `.pl-card` 和封面
`<img>`（重新解码/占位透明），所以滑动时每帧都在「拆掉重建」，看起来一直闪。

**修法**（patch 层）：改成「一次性全量渲染、滚动不再重建」：
1. 包装 `renderUserPlaylistsList`：渲染期间置 `__mrPlRendering`；
2. 包装 `playlistPanelOffsetIndex`：渲染期间第一次调用返回 `0`（窗口起点），第二次返回
   `offsets.length - 2`（窗口终点）→ 可见区间覆盖全部条目，卡片全量渲染；
3. 包装 `playlistPanelDetailRowsHtml`：忽略传入窗口，`scrollTop:0` + `viewport:1e6` → 详情行也全量渲染；
4. 包装 `schedulePlaylistPanelVirtualRender`：`__mrPlFullMode` 下直接返回，滚动不再触发重建；
5. sticky 头（面板头 / 歌单头）改为近不透明纯色 + 去掉 `backdrop-filter`，避免滚动内容从半透明头下透出。

**验证**：打开歌单 → 展开「我喜欢（297 首）」→ 连续滚动 25 帧，`MutationObserver` 记录 **0 次 DOM 变更**；
详情行全量渲染（96 = 宿主当前已加载曲目数，分页加载后自动再渲一次）；逐帧亮度差最大 19（属于正常内容位移，
没有整片闪）；回归 23/23 PASS。
---

## 17. v88：搜索/播放慢——架构解释 + 手机层优化

### 17.1 这个项目是怎么拿歌的
WebView 里跑一套 JS「平台适配层」（`js/ported/ref` 网易云、`kugou-api.js`、`qq`、`qishui`、`bodian`、`ytm`、`spotify`），
`/api/*` 由 `js/android-shim/10-api-router.js` 就地分发；真正的 HTTP 请求经原生 `FoliaBridge`（OkHttp）发出，
带上 WebView CookieManager 里的账号 Cookie，所以能绕 CORS 访问各平台网页接口——本质是**客户端侧逆向爬取**，
不是官方开放 API。音频最后从平台 CDN 取（经本地代理/服务）。

### 17.2 实测数据（本机、当前网络，单位 ms）
| 请求 | 耗时 |
|---|---|
| `qq/login/status` | 26777 |
| `kugou/song/like/check` | 21288 |
| `qishui/search` | 23090 |
| `/api/search`（网易云） | 2128~9067 |
| `kugou/song/url` | 7104 |
| `bodian/search` | 1203~4216 |
| RTT | 网易≈387ms、QQ≈312ms、酷狗 CDN≈61ms |

宿主 `fetchMusicSearchResults()` 用 `Promise.allSettled` 等**全部平台**返回才合并渲染 → 首屏被最慢平台决定。

### 17.3 手机层做了什么（v88）
1. **缓存键归一化**：剥掉 `t/_/_t/ts/timestamp` 等易变参数（原来每个 status 请求都带 `?t=时间戳`，缓存永远 miss）；
2. **status 缓存 10 分钟**：`*/status`、`*/login/status` 命中即返回；登录/登出请求自动清空；
3. **song/url 缓存 10 分钟**：同一首重播/切回不再重新解析；
4. **搜索 12 秒上限**：防 20s+ 卡死（`Promise.allSettled` 仍等最慢者，但至少不会无限等）；
5. 原有 `/api` GET 内存 + IndexedDB 缓存（20 分钟）继续生效。

### 17.4 实测收益
- 重复同一个搜索：首条结果 **1036ms**（首次仍取决于平台）；
- status 第二次请求：**0ms**（`x-mr-cache: 1`）；
- `song/url` 第二次请求：**0ms**；
- 暂停后重新播放同一首：**281ms** 恢复；
- 回归 23/23 PASS。

### 17.5 没做/做不了的
- 真正的首屏提速要改宿主：搜索改成「谁先回来先渲染」的渐进式（或把 `Promise.allSettled` 改成带预算的 `Promise.race` 逐平台刷新）；
- 后台预热 status 实测反而挤占原生桥队列（FoliaBridge 请求像串行排队），会把第一次搜索挤到超时 → 已关闭；
- 跨境 RTT 是物理成本，无法在 App 内消除。
---

## 18. v89：当前队列面板滑动闪烁

v87 只处理了「我的歌单」列表（`renderUserPlaylistsList`）。「当前队列」是另一套：
`renderQueuePanel()` 里用 `queuePanelVirtualWindow()` 算窗口，`scheduleQueuePanelVirtualRender()` 在每次
scroll（rAF 节流）里重新执行 `$ql.innerHTML = ...` → 所有 `.queue-item` + 封面 `<img>` 每帧重建，同样一直闪。

修法（同一套「全量渲染 + 滚动不重建」）：
- 包装 `renderQueuePanel`：渲染期间置 `__mrQueueRendering`；
- 包装 `queuePanelVirtualWindow`：`__mrQueueRendering` 时返回 `{start:0, end:total, top:0, bottom:0}` → 队列全量渲染；
- 包装 `scheduleQueuePanelVirtualRender`：`__mrQueueFull` 时直接返回 → 滚动不触发重建。

验证：当前队列 44 条，连续滚动 25 帧，`MutationObserver` 记录 **0 次 DOM 变更**（此前每帧重建）；面板吸顶头正常，
条目、封面、喜欢/下移/收藏/移除按钮都在；回归 23/23 PASS。
---

## 19. v90：搜索栏直接点歌不进播放页

**现象**：在搜索栏点一首歌，声音开始放了、底栏也显示在播，但界面留在首页（顶部还是搜索栏，stage 不出歌词）。

**复现**：点结果后读 body class → `empty-home-active` 已被宿主移除，但既没有 `mr-player-page`、也没有回到首页 → 卡在中间态。

**原因（两处）**：
1. 宿主「从搜索结果播放」只做播放，不负责页面切换，也不触发我们「首页被隐藏 → 进播放页」的钩子；
2. 我们的 `updateEmptyHomeVisibility` 包装里有 `if (anyOverlayOpen()) return res;`——搜索浮层（`has-results`）算 overlay，
   所以即使首页被隐藏也直接 return，不会进播放页。

**修法**：
- 该分支里若 `hasPlaybackSignal()` 为真，改走 `enterPlayerFromHostHide()`（自己清搜索/歌单/DIY 浮层再 `enterPlayerPage()`）；
- 新增 `bindSearchPlayEnter()`：监听 `#search-results .search-result` 点击，之后每 700ms 轮询（最多 20s，因为 URL 解析/起播可能要好几秒），
  一旦「在播 + 页面仍停在首页 + 首页已隐藏」就收起搜索浮层并 `enterPlayerPage()`。

**验证**：点搜索结果 → `mr-player-page` 出现、顶部歌条上移、歌词/舞台正常；返回键能回首页；回归 23/23 PASS。
---

## 20. v91：清理 / 轻量化 / 丝滑度

### 20.1 审计结论
| 项 | 结果 |
|---|---|
| patch JS 函数 | 132 个，只有 1 个死函数（`measureDockedRect`，v83 实验遗留）→ 删除 |
| patch CSS 规则 | 454 条，3 条完全重复 + 3 条被同选择器后续 `!important` 完全覆盖 → 删除 |
| APK 资源 | `assets/materials` 15 个目录**全部被引用**；`assets/public` 无 `.map/.md/.test` 等可删文件 |
| APK 体积构成 | native `.so` 40MB、materials 34MB、字体 21MB（NotoSansCJK 18.6MB）、dex 16MB、web 24MB |

### 20.2 实际改动
1. **看门狗降步数**（500ms tick）：
   - WebView 不可见（`document.hidden`）直接 return；
   - `noticeWatch` 无可见通知时在查 rect 前返回；
   - `panelKbFit` 在 DIY 面板没开且未钉住时立即返回（0 次 DOM 读取）；
   - 吸顶变量 / 补丁自愈（fetch 缓存重装、列表全量渲染重装）从每 tick 降到每 2s。
2. **长列表丝滑**：`.pl-card` / `.pl-detail-row` / `.queue-item` / `.search-result` 加
   `content-visibility:auto` + `contain-intrinsic-size`（离屏行跳过布局绘制）；
   列表容器 `touch-action:pan-y`、`-webkit-tap-highlight-color:transparent`。
3. **结构可读性**：phone.css 顶部加「模块目录」注释（§1~§9），说明后段 vXX 覆盖规则要先查 DEVLOG。

### 20.3 实测
- 展开 297 首歌单，连续滚动 90 帧：**avg 16.5ms / p95 16.7ms / max 16.7ms / jank 0 帧**（锁 60fps）；
- 空闲时看门狗每 tick 的 DOM 读取从 ~5 次 `getElementById` + 2 次 `getBoundingClientRect` 降到 0~2 次；
- 回归 23/23 PASS、自适应矩阵无溢出；
- APK 体积 75,927,359 B（未变，原因见 20.1）。

### 20.4 想再减体积的两条路（需取舍）
- 字体子集化：`NotoSansCJK-Regular.ttc` 18.6MB → 只保留常用汉字/假名 ≈ 3~4MB，**省 ~14MB**，但生僻字可能变豆腐；
- 材质预设裁剪：`assets/materials` 34MB 按可视化场景裁剪，**省 20MB+**，但会废掉部分粒子/场景预设。
---

## 21. v92：磨砂玻璃 + 首页板块支持静态图

### 21.1 磨砂玻璃
- 搜索历史：`#search-results.search-history-surface` 与其内层 `.search-history` 一起加
  `backdrop-filter: blur(24px) saturate(150%)` + `rgba(9,12,16,.82)` 深底 + 细边框/内高光；
- DIY 面板顶框：`#fx-panel .fx-head` 与 `.fx-head-main` 加 `blur(22px) saturate(155%)` + `rgba(10,14,18,.84)`；
- 注意：宿主会给外层元素设透明背景（computed 仍可能是 `rgba(0,0,0,0)`），所以外层和内层都要写，实际可读性靠内层深底 + blur。

### 21.2 首页板块静态图
宿主「选择 MP4」只接受 `.mp4`（`homeDashboardIsMp4File`），blob 存在 IndexedDB
`mineradio-home-dashboard-video-v1` / store `media` / id `home-hero-video`，meta 在
`localStorage` 的 `mineradio-home-dashboard-video-meta-v1`。

手机层做法：
- 包装 `handleHomeDashboardVideoFile`：图片（jpg/png/webp/gif）走 `mrHomeImgChoose`，视频走原逻辑；
- 图片先 canvas 压缩（最长边 2048，JPEG q0.88），blob 存进**同一个 DB** 的 `home-hero-image` id；
  meta 存 `mr-home-hero-image-v1`（version/name/type/size/width/height/savedAt）；
- 包装 `renderHomeDashboardHero`：把 input 的 `accept` 扩成 `.mp4,video/mp4,image/jpeg,image/png,image/webp,image/gif`，
  并在 `.daily-review-card` 里插入 `<img class="mr-home-hero-image">`（与宿主 video 同为 absolute inset:0 / z-index:0）；
- 二选一：选图时清掉宿主视频（meta + blob + 元素），选视频时清掉图片；
- 包装 `homeDashboardRenderVideoActions`：有图时按钮变「更换背景图 / 移除背景图」；包装 `clearHomeDashboardVideo`：有图时清图片。

实测：模拟选图 → img 出现、meta 落地、按钮改名、视频元素移除；重启后图片仍在；清除后 img/meta 均空；回归 23/23 PASS。
---

## 22. v93：DIY 面板「搜索行 + 标签栏」磨砂（v92 改错了对象）

用户指的框是 DIY 面板里的**搜索行 + 6 个标签栏**，不是面板标题栏（`.fx-head`）。目标：

- `#fx-console-toolbar`（工具条，含 `.fx-console-search-row` 搜索胶囊、`.fx-console-tool-btn` 撤销/历史按钮）
- `#fx-panel-tabs`（常用/界面/歌词/动效/歌单架/系统）

样式：`background: rgba(9,12,16,.88)`、`backdrop-filter: blur(22px) saturate(160%)`、1px 边框、圆角 14px；
搜索胶囊 `rgba(255,255,255,.055)`、工具按钮 `rgba(255,255,255,.07)`、tab 选中 `rgba(255,255,255,.115)`。

实测 computed：toolbar、tabs 都是 `bg rgba(9,12,16,.88)` / `blur(22px) saturate(1.6)` / `radius 14px`；
壁纸不再透到文字上；回归 23/23 PASS。
