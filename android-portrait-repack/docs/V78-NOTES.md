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
