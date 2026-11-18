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
