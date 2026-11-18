# v62：手机版「首页 ⇄ 播放页」转场重写（恒高底栏 + 歌曲行 FLIP + 单一 360ms 转场）

> 改动文件：`android-portrait-repack/patch-layer/web/mr-phone/mr-phone.js`、`.../phone.css`
> 不新增依赖；不改宿主 `public/js`、`public/css`（宿主行为只用运行时包装/patch 旁路）。
> 自测环境：Chromium iPhone-14 视口 390×844 dpr3，`http://127.0.0.1:38765/index.phone.html?autodemo=1&demodelay=1000&rounds=2&probeheart=1`
> 逐帧探针：`_tmp/probe/probe.js`（114~115 帧/轮，`sampler:"raf"`，`errs:[]`）

## 1. 问题（修复前实测，详见 analysis/baseline-measurements.md）

| # | 现象 | 证据 |
|---|---|---|
| 1 | **底栏高度硬跳 50px**：进入 t=270.7ms `bh 127.5→77.5`；退出 t=334.1ms `bh 77.5→127.5` | 进入时 260ms 定时器执行 `updatePlayerPage()`，把 `.control-cluster.actions`（歌曲行）从底栏 `appendChild` 到 `<body>`；退出时再插回。底栏高度 = 内容高度，歌曲行一进一出就跳。 |
| 2 | **两段反向运动**：底栏先向下滑出（0→258ms `translateY 0→141.9px`），换完内容再向上滑回（~340ms） | 旧实现：`mr-player-entering/mr-return-home` 用 `translateY(112%)+opacity:0` 滑出，260/320ms 定时器移除 class 后滑回；**用定时器猜时长**，动画目标在过渡中途被改写。 |
| 3 | **退出时首页迟到 700ms**：`ho`（#empty-home opacity）到 t≈706ms 才开始上升 | `exitPlayerPage()` 调宿主 `goHome()`，而 `goHome()` 是**开关**：此时 `emptyHomeActive=true` 走 `dismissHomePage()` 把首页关掉 + toast「已关闭 Home」，360ms 后再由 `mr-phone.js:386-398` 用内联 `opacity:1 !important` 强行拉回。 |
| 4 | **间歇性「瞬切/一下一下弹」** | `ensureBarVisible()` 每 2s 用**内联 `!important`** 写 `opacity/transform/visibility`；按 CSS 级联，内联 important 压过样式表 important → 之后所有 `!important` 的 transform 动画目标被钉死。 |
| 5 | **播放页按钮组迟到（最多 2s）** | `.control-cluster.modes` 要等下一次 2s 轮询 `layoutPlayerExtras()` 才被搬进 `#mr-player-extras`，且 extras 用 `getBoundingClientRect()` 现算 `bottom`。 |
| 6 | **首页内容 94px 瞬跳** | `controls-visible` 切换时 `#empty-home` 的 `bottom` 在 118px/24px 之间变，而 `bottom` 不在任何 transition 列表里。 |

## 2. 改法（目标架构）

### 2.1 底栏恒高三段：结构不再随状态改
```
#bottom-bar（恒高：8 + 44 + 2 + 20 + 2 + 44 + 10 = 130px 左右）
├── #mr-player-extras        绝对定位覆盖「顶部槽位」：top:8 left:12 right:12 height:44
│   └── .control-cluster.modes（词/音量/自动隐藏/沉浸/全屏）  ← 永久在这里，不再搬 DOM
└── #controls (flex column, gap 2)
    ├── .control-cluster.actions  首页态：歌曲信息行
    ├── #mr-track-slot            播放页态占位（高度 = 转场开始时量到的歌曲行高度）
    ├── #mr-progress-row（左时间 / 进度条 / 右时间，高度钉死 20px）
    └── .control-cluster.transport
```
- 首页态：歌曲行在底栏顶部槽位，`#mr-track-slot` 隐藏；播放页态：歌曲行飞走，slot 显示同高度 → **两种状态底栏高度逐像素相同**。
- `#mr-player-extras` 永在底栏内（`position:absolute`），播放页态 `opacity 0→1` 淡入；不再用 `getBoundingClientRect()` 算位置。
- 行高全部钉死（`--mr-row-h: 44px` + `min/max-height`），压掉宿主 `.control-cluster` 默认 62px / 沉浸模式 64px / 断点 56/60px 的抖动，也压掉 `body.immersive-mode .control-cluster.actions{display:none}`。

### 2.2 歌曲行 FLIP 飞行（WAAPI，不用 transition）
- 进入：量底栏里歌曲行的 rect → 写 `--mr-track-row-h` / slot 高度 → 加 `mr-track-away`（slot 显示）、把 `.actions` 搬到 `<body>` 并加 `.mr-top-track` → 量新 rect → `actions.animate([translate(dx,dy) → none], 360ms, cubic-bezier(.22,.9,.25,1), fill:both)`。
- 退出：反向 —— 量 slot 的 rect 作为落点，`animate([none → translate(dx,dy)])`，**飞行结束时才把 DOM 插回底栏并隐藏 slot**（同一次任务里完成，不产生中间帧）。
- 顶部条样式改成 `.control-cluster.actions.mr-top-track` 自作用域（不再依赖 `body.mr-player-page`），因此退出时先移除 `mr-player-page`（首页立刻开始淡入）也不会让顶部条失去 `position:fixed`。
- 顶部条 `padding:0` + cover 44px，与底栏行同高，飞行是**纯 translate**（不缩放、不变形）；顶部渐变底用 `::before` 的 `opacity` 过渡淡入/淡出，不出现「整块深色条突然出现」。

### 2.3 单一 360ms、事件驱动、可接管
- 状态机 `home | to-player | player | to-home`；`enterPlayerPage()` / `exitPlayerPage()` 各启动**一次** 360ms 转场（CSS 交叉淡入淡出 + WAAPI FLIP 同时开始）。
- 结束由 `animation.finished` 驱动，另有 `360+240ms` 兜底定时器；`transSeq` 序号保证过期回调不生效。
- 快速连点/转场中按返回键：`commitInstant()` 取消动画、直接落到终态，再启动反向转场（不会两套动画打架）。
- **仍保留探针依赖的 class**：`mr-player-entering`（进入）、`mr-return-home`（退出）、`mr-player-page`（播放页态）；`mr-just-home` 已废弃。

### 2.4 宿主钩子旁路 / 事件驱动
| 宿主 | 处理 |
|---|---|
| `setControlsHidden()` | 手机下改 no-op（底栏常显）；CSS 另有高特异性 guard 覆盖 `.soft-hidden/.controls-hidden/home-controls-locked` |
| `scheduleControlsHide()` | 同上 no-op |
| `updateEmptyHomeVisibility()` | 包装：调用原函数后，`show=false` 且当前在首页 → 立刻 `enterPlayerPage()`（不再等 2s 轮询）；`show=true` 且在播放页 → `exitPlayerPage()`。**两道门槛**：必须有播放态（`hasActivePlaybackControls()`/`playQueue.length`/`playing`/`audio` 在播），且歌单/搜索/登录/DIY/视觉引导浮层未打开，避免被「打开歌单/搜索/上传」这类 `show=false` 误触发 |
| `renderHomeDiscover()` | 同 tick 去重（<32ms 重复调用只跑一次）；`goHome` 里连调 2~6 次的首页重排收敛为 1 次 |
| `setImmersiveMode(true/false)`、`updateEmptyHomeVisibility({forceLoad})`、`setHomeControlsLocked` | 全部挪到**转场结束后**（`animation.finished` → 双 rAF → `setTimeout 0`），动画窗口内不跑宿主重活 |
| `#empty-home` 的 `bottom` | 固定为 `118px + safe-area`（与 `controls-visible` 态一致），消除 94px 瞬跳 |

> **补充（lead 评审后追加）**：进入播放页时必须把宿主的 `homeForcedOpen` 复位为 `false`。
> 否则一次「返回首页」之后 `homeForcedOpen` 一直是 `true`，而 `shouldShowEmptyHomeCore()` 里
> `if (homeForcedOpen) return true` 在最前面 → 播放页期间宿主任何一次
> `updateEmptyHomeVisibility()`（暂停、切歌、队列变化、上传…）都会返回 `show=true`，
> 包装层据此立刻把用户踢回首页。已在 `enterPlayerPage()` 与 `commitInstant('player')` 里复位。

### 2.4b 转场窗口导航抑制（lead 评审 P0，二版补充）

`navSuppressed` 标志覆盖「转场开始 → 宿主收尾（runHostAfterEnter/Exit）结束」整段窗口：

- 窗口内 `updateEmptyHomeVisibility` **完全不跑 raw**（不调用原函数、不做全量首页重排），
  只按当前状态维持 `empty-home-active` 并返回对应 show 值 → 淡入/淡出中途不会被插入
  `renderHomeDiscover`（tile-row innerHTML + 12 张背景图）造成掉帧/二次淡入。
- 同时堵住 `finishEnter → runHostAfterEnter` 的双 rAF 空窗：旧实现此时 `pageState` 已是 `player`
  但宿主 `immersiveMode` 还是 false、`homeForcedOpen` 已复位 false，宿主 update 若算得 `show=true`
  会立刻把用户顶回首页（回弹）。现在窗口内一律不导航。
- `setNavSuppressed(false)` 在 `runHostAfterEnter/Exit` 末尾执行，另有 1600ms 超时兜底复位。

其它二版修正：

- **进入门槛改「起播事实」**：`hasPlaybackSignal()` 只认 `window.playing===true` 或
  `audio` 真的在播（`!paused && !ended && currentTime>0.05`），不再用「队列非空」当信号；
  `anyOverlayOpen()` 补充上传面板/上传提示/用户弹窗/trial/歌曲详情/音源提示/fx-console-open/3D 歌单架，
  避免点首页 tile/歌单架/上传时误翻播放页。
- **返回键/首页按钮语义**：首页（无浮层）按返回直接消费（不落宿主 `goHome()` 的 dismiss 分支，
  否则会把首页关掉）；`gotoHome()` 在播放页走 `exitPlayerPage()`，在首页 no-op。
- **CSS 补压**：给栏内 `.actions` 补 `transform:none!important`（旧 `phone.css:2481` 会把它
  下移 14px，导致 FLIP 起点对不齐）；`#empty-home` 播放页态改双 id（防 index.css 的
  wallpaper 规则反超）。
- `renderHomeDiscover` 去重改为「只合并同一任务内重复调用」（原来 32ms 窗口会把
  `loadHomeDiscover` 完成后的那次渲染吞掉，首页可能停在骨架）。

### 2.6 真机验证（Xiaomi 24031PN0DC / Android 16 / WebView 157）

用 `adb forward` 把 App WebView 的 devtools socket 转到本机，CDP 注入逐帧探针实测：

| 指标 | v61c（旧） | v62 |
|---|---|---|
| 底栏高度 | 128 ↔ 78 瞬跳 50px | 131.6 恒定（0px） |
| 退出时首页开始淡入 | +724ms | **+38.6ms** |
| 一次转场安定 | ≈1350ms | **≈360~380ms** |
| 转场内 >32ms 帧 | 3 帧（含 72.8ms） | 退出 0 帧；进入偶发 1 帧 |

详见 `analysis/device-measurements.md`（含原始逐帧表）。

### 2.5 删除的旧实现- 删 `ensureBarVisible()`、`styleBottomBar()` 的**运行时内联 `!important` 写入**（底栏外观改静态 CSS，无 `backdrop-filter`）。
- 删退出时「`goHome()` + 360ms 后内联 `opacity:1!important` 拉回首页」的兜底（`mr-phone.js` 原 386-398）；退出改为**显示首页而不是切换**：`homeForcedOpen=true; homeSuppressed=false;`，若 class 缺失则补 `empty-home-active`，收尾再调 `updateEmptyHomeVisibility({forceLoad:false})`（此时 `immersiveMode` 已复位，不会走 dismiss 分支）。
- 2s 心跳只剩纯 class 检查（`ensureClasses/ensureShellState/syncChromeAvatar/patchPeek/patchHostHooks`）；所有布局/测量函数移到独立 3s watchdog，且 `isBusy()` 时直接 return。
- phone.css 末尾新增 `/* ===== V62 转场覆盖 ===== */` 块，用更高特异性覆盖旧的 keyframes（`mrBarFold/mrBarOutDown/mrTrackFold/mrBarUp/mrFadeBar`）与 `translateY(112%)` 两段式；旧规则保留但被覆盖（减少删除带来的回归风险）。

## 3. 自测数据（修复后，Chromium iPhone-14 390×844 dpr3，rAF≈75fps）

### 3.1 进入播放页（`trigger:mr-player-entering`，115 帧，`errs:[]`）
列：`t`=ms，`b`=body 位掩码，`bt`=底栏 top，`bh`=底栏高，`by`=底栏 translateY，`bo`=底栏 opacity，`ho`=首页 opacity，`et/eh/eo`=extras top/height/opacity

| t | b | bt | bh | by | bo | ho | et | eh | eo |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 11 | 704.4 | **131.6** | 0 | 1 | 1 | 717.2 | 44 | 0 |
| 28.4 | 11 | 704.4 | **131.6** | 0 | 1 | 0.849 | 716.6 | 44 | 0.151 |
| 99.1 | 11 | 704.4 | **131.6** | 0 | 1 | 0.275 | 714.3 | 44 | 0.725 |
| 273.4 | 11 | 704.4 | **131.6** | 0 | 1 | 0.009 | 713.2 | 44 | 0.991 |
| 379.8 | 9 | 704.4 | **131.6** | 0 | 1 | 0 | 713.2 | 44 | 1 |

### 3.2 退出播放页（`trigger:mr-return-home`，107 帧，`errs:[]`）
| t | b | bt | bh | by | bo | ho | et | eh | eo |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 12 | 704.4 | **131.6** | 0 | 1 | 0 | 713.2 | 44 | 1 |
| 30.7 | 12 | 704.4 | **131.6** | 0 | 1 | **0.151** | 713.8 | 44 | 0.849 |
| 175.5 | 12 | 704.4 | **131.6** | 0 | 1 | 0.936 | 716.9 | 44 | 0.064 |
| 344.0 | 12 | 704.4 | **131.6** | 0 | 1 | 1 | 717.2 | 44 | 0 |
| 371.9 | 8 | 704.4 | **131.6** | 0 | 1 | 1 | — | 0 | 0 |

### 3.3 逐项验收
| 验收点 | 目标 | 实测 | 结论 |
|---|---|---|---|
| 每轮帧数 | ≥15 | 115 / 107（`sampler:"raf"`） | ✅ |
| `bh` 整轮 max-min | ≤1px | **0.0px**（131.6 全程，含进入前后与退出前后） | ✅ |
| `bt` 底栏 top | 连续/不动 | 704.4 全程（by 恒 0，靠 transform 0） | ✅ |
| `by` 反向 | 无 | 全程 0，`barTransform.first/last = none` | ✅ |
| exit `ho` 起始 | ≤60ms 且单调上升 | **30.7ms** 开始 0→0.151，t=344ms 到 1，单调 | ✅ |
| enter `ho` | 单调下降 | 1→0.849→…→0（t≈353ms） | ✅ |
| extras | 随底栏一起、不滞留半空 | `eh` 恒 44、`et` 跟随底栏（717.2↔713.2，即 4px 内过渡位移），退出 360ms 内 `eo 1→0` | ✅ |
| 长任务/长帧 | 无 >50ms；dt>32ms ≤2 | `dt` 最大 19.3ms，>32ms 帧 **0** | ✅ |
| 探针异常 | 无 `MRPROBE_ERR` | `errs:[]` | ✅ |
| `mr-player-page` 切换 | 1 次/轮 | 进入 1 次（t≈371ms 位掩码 11→9），退出 1 次 | ✅ |

### 3.4 歌曲行 FLIP 实测（转场窗口内逐帧采 `.control-cluster.actions` 的 computed translateY，临时探针）
- 进入 360ms 内：`611.2 → 197.8 → 46.1 → 4.8 → 0`（从底栏槽位飞到屏幕顶部，单调收敛）
- 退出 360ms 内：`0 → 106 → 511.6 → 660.1 → 700.5`（飞回底栏槽位），落位瞬间 DOM 换回底栏并清 transform → 与进入前位置一致（底栏 top/height 逐像素相同：704.4 / 131.6）

### 3.5 与基线的对比
| 指标 | 修复前 | 修复后 |
|---|---|---|
| 进入底栏高度跳变 | t=270.7ms 127.5→77.5 | 无（131.6 恒定） |
| 退出底栏高度跳变 | t=334.1ms 77.5→127.5 | 无（131.6 恒定） |
| 退出首页开始淡入 | t≈706ms（且先被 dismiss 再硬拽） | **t≈31ms**，单调到 1 |
| 退出安定时间 | ≈1.35s（下滑 + 上滑 + 迟到 + 淡入） | ≈0.36s（单一 360ms 转场） |
| 底栏 transform 残留 | 内联 `!important` 可永久钉死动画 | 无内联写；CSS guard 兜死 |
| 播放页按钮组出现时间 | 0~2000ms（等轮询） | 与底栏淡入同步（0~360ms） |

## 4. 如何重打包

```powershell
cd E:\IDM下载目录\DSH工作产生文件\Mineradio-paused\android-portrait-repack\scripts
.\repack.ps1 -BaseApk <原始APK路径> `
             -PatchDir ..\patch-layer\web\mr-phone `
             -Jdk <jdk17目录> -Apktool <apktool_2.10.0.jar> `
             -BuildTools <android-sdk\build-tools\34.0.0>
# 产物：<WorkDir>\signed.apk（同签名覆盖安装）
```
- `repack.ps1` 会解码原 APK，把 `patch-layer/web/mr-phone/{mr-phone.js,phone.css}` 放进 `assets/public/mr-phone/`，`assets/public/index.html` 由 `patches/assets__public__index.html.patch` 注入（head 早期脚本 + `phone.css` link + 末尾 `mr-phone.js` script）。
- 本次只改了这两个文件，**不需要重新打 index.html 补丁**；重打包后清 App 缓存/强刷，确认 `MRPROBE`/实际手感。
- 本地复现（不打包）：把两文件覆盖到 `public/mr-phone/`，刷 `index.phone.html` 即可（server 对静态文件发 `no-store`）。

## 5. 已知风险 / 待真机确认

1. **事件驱动门槛偏保守**：`updateEmptyHomeVisibility` 包装要求「有播放态 + 无浮层」才翻页。若真机上从歌单/搜索点歌时宿主在浮层未关闭前就调用它，则这次不会翻页（等下一次调用）。这是为了避免误触发做的取舍，需要在 APK 内按真实交互再校准（最坏情况退化为旧行为：由轮询/用户点底栏歌曲行进入）。
2. **返回键**：本机复现环境没有 Capacitor，`closeTopOverlay()` 中途接管（转场中按返回 = 落终态）未能真实按键验证；逻辑上 `isBusy()` 时直接 `commitInstant` 并 `return true`，不会落到宿主退出分支。
3. **隐藏窗口态的宿主 `render-deep-sleep`**：页面不可见时宿主会给 body 加 `render-deep-sleep`，此时底栏高度会变（143.6 vs 131.6）。这是宿主省电态，页面可见时不会出现；探针采样必须保证 Agent Window 可见，否则会看到 `MRPROBE_RAFSTALL` / `frames:2`。
4. **顶栏文字截断宽度**：顶部条 `right:64px`（给右上角「…」让位），比底栏行窄约 50px，飞行时文字截断宽度略变（纯 translate，不会变形）；如需完全一致可把右上角按钮在播放页下移，本次未做以免影响其它布局。
5. **首页首次栅格化**：退出时首页由 `opacity:0` 变可见，已保留 `will-change:opacity` 且实测无 >19ms 长帧；低端机若掉帧，可考虑进入播放页后保留更长的合成层。
