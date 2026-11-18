/*!
 * Mineradio phone layout — shell bootstrap
 * ------------------------------------------------------------
 * 作用（在页面加载后执行）：
 *   1. 再次确保 <body> 带上 phone-shell / simple-mode 类
 *   2. 注入 phone chrome（右上「更多」按钮 + 菜单：首页 / 登录）
 *   3. 注入少量定位修正 CSS（搜索栏让位、chrome 固定到右上、底部安全区）
 *   4. 可选：强制自然视口（去掉桌面的「虚拟桌面缩放」时使用）
 *
 * 依赖：
 *   - phone.css（同目录；手机层全部样式，本文件只做行为补丁）
 *   - 宿主全局函数一律按需探测（typeof 判断），不存在就不绑定
 *
 * 模块地图（单文件 IIFE，按注释横幅分区；v78 起取消多份重复实现）：
 *   §1 启动与看门狗   ready / ensureClasses / classWatch / layoutWatch / startWatchdog /
 *                     startStructureObserver / notifyWatch / hideFab / 菜单
 *   §2 DIY 控制台     setDiyPanel / showDiyPanelEl / keepDiyPanelOpen / bindDiyTap / bindFab
 *   §3 播放页舞台     bindStageDrag / bindStageGuard / recenterStageView / patchPlaylistEdgeTrigger
 *   §4 导航入口       bindTrackEnter / enterPlayerFromHostHide / bindHostNavTriggers
 *   §5 Chrome/视口    buildChrome / forceViewport / patchPeek
 *   §6 转场状态机     首页⇄播放页（FLIP + 360ms 单转场，本区最敏感，勿轻改）
 *   §7 宿主钩子       patchHostHooks（updateEmptyHomeVisibility / immersive 旁路）
 *   §8 缓存/调优      patchApiCache / tuneAudioFade / tuneRendererOnce / patchHomeToast
 *   §9 弹层           placePopover / hidePopover / bindPlayerPopovers
 *   §10 通知/登录     noticeWatch / styleLoginModal
 *   §11 底栏/UI       layoutPhoneBar / syncChromeAvatar / updatePlayerPage
 *   §12 歌单/返回     openPlaylistPanel / enhancePlaylistPanel / closeTopOverlay / registerBackButton
 *   §13 手势          registerPinchZoom
 *   §14 入口/API      ready(...) / window.MrPhoneShell
 *
 * 兼容：Mineradio 桌面版前端 / 各 Android WebView 移植版的同名全局函数
 *       goHome()、onUserBtnClick() 可选；存在就接上，不存在就不绑定。
 *
 * Part of the Mineradio phone-portrait port (GPL-3.0, derived from
 * Mineradio by XxHuber / https://github.com/XxHuberrr/Mineradio ).
 */
(function (window, document) {
  'use strict';

  if (window.__mrPhoneShellBooted) return;
  window.__mrPhoneShellBooted = true;

  var root = document.documentElement;


  /* 登录面板在竖屏下的重排：固定弹层 + 可滚动列表 + 抽屉随内容滚动 */

  /* 开屏：原版两段字靠 clamp() 像素偏移拼字，字体缩到 52px 时会错位/拉开；
     这里改用 em 偏移（随字号等比），并停掉原动画只做淡入 */

  /* 手机布局补全：歌单/队列面板、播放条、搜索浮层、视觉引导 */

  var CHROME_HTML = [
    '<div id="phone-chrome-slot" class="phone-chrome-slot">',
    '  <button id="phone-chrome-more" class="phone-chrome-more" type="button"',
    '    aria-label="更多" aria-expanded="false" aria-controls="phone-chrome-menu">',
    '    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">',
    '      <circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle>',
    '      <circle cx="19" cy="12" r="1.8"></circle></svg>',
    '  </button>',
    '  <div id="phone-chrome-menu" class="phone-chrome-menu" role="menu" hidden>',
    '    <div id="phone-chrome-menu-actions" class="phone-chrome-menu-actions"></div>',
    '  </div>',
    '</div>'
  ].join('');

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function ensureClasses() {
    if (!root.classList.contains('phone-shell')) root.classList.add('phone-shell-preload', 'phone-shell');
    if (!document.body) return;
    document.body.classList.add('phone-shell', 'simple-mode', 'web-shell');
    // phone-booting：首帧禁用过渡，避免切布局闪动；600ms 后放开（只做一次）
    if (!window.__mrPhoneBootTimer) {
      window.__mrPhoneBootTimer = 1;
      document.body.classList.add('phone-booting');
      window.setTimeout(function () {
        try { document.body.classList.remove('phone-booting'); } catch (e) { }
      }, 600);
    }
  }

  /* =================================================================
   * §1 启动与看门狗（Watchdog）
   * ----------------------------------------------------------------
   * v77 前这里有 4 个常驻 interval（2000/2500/1500/500ms）+ 1 个按需轮询：
   * 空闲态 ~3.6 次唤醒/秒、~17.5 次 DOM 查询/秒、0.4 次强制布局/秒。
   * v78 合并成单个 500ms 调度器（tick 取模分频），结构变化改事件驱动。
   * ================================================================= */
  var WATCH_TICK = 0;

  /* 2.0s：宿主会重写 body.class；这里只补 class / 补钩子，零测量、零内联写。 */
  function classWatch() {
    try {
      ensureClasses();
      ensureShellState();
      syncChromeAvatar();
      enhancePlaylistPanel();
      patchPeek();
      patchHostHooks();
      patchPlaylistEdgeTrigger();
    } catch (e) { }
  }

  /* 2.5s：布局兜底；转场窗口内直接 return（绝不测量/重排）。 */
  function layoutWatch() {
    if (isBusy()) return;
    try {
      if (window.__mrStructDirty) { ensureStructure(); reorderProgressBar(); }
      layoutPhoneBar();
      styleLoginModal();
      hideFab();
      bindFab(document.getElementById('fx-fab'));
      updateProgressTimes();
      try { patchFallbackNotice(); patchPlaylistEdgeTrigger(); } catch (e) { }
    } catch (e) { }
  }

  function startWatchdog() {
    if (window.__mrWatchdog) return;
    window.__mrWatchdog = 1;
    window.setInterval(function () {
      WATCH_TICK++;
      try { noticeWatch(); } catch (e) { }          /* 500ms */
      try { panelKbFit(); } catch (e) { }
      if (WATCH_TICK % 4 === 0) classWatch();       /* 2.0s */
      if (WATCH_TICK % 5 === 0) layoutWatch();      /* 2.5s */
    }, 500);
  }

  /* 宿主重建 #controls / #bottom-bar 子节点时才需要重跑结构补丁（ событие 驱动） */
  function startStructureObserver() {
    if (window.__mrStructObserver) return;
    window.__mrStructObserver = 1;
    var mark = function () { window.__mrStructDirty = 1; };
    try {
      var mo = new MutationObserver(mark);
      [document.getElementById('controls'), document.getElementById('bottom-bar')].forEach(function (el) {
        if (el) mo.observe(el, { childList: true });
      });
    } catch (e) { }
    mark();
  }

  /* 底栏可见性/控件态：手机层是唯一控制者（纯 class 操作） */
  function ensureShellState() {
    var b = bodyEl();
    if (!b) return;
    try { b.classList.add('controls-visible'); } catch (e) { }
    var bar = barEl();
    if (bar) {
      try {
        bar.classList.add('visible');
        bar.classList.remove('soft-hidden', 'controls-hidden', 'hidden');
      } catch (e) { }
    }
  }


  /* 宿主会把 DIY 浮动按钮重新显示出来（会压住卡片），这里用内联 important 兜底。
     v64：DIY 不再是浮在舞台上的悬浮球，而是底栏右上角的一个按钮（首页/播放页都在这里）。
     v67：位置/尺寸全部交给 CSS 变量（自适应）。
     v78：底栏高度改由 ResizeObserver 维护（原来每 2.5s 一次 getBoundingClientRect
          强制布局 + 全文档 CSS 变量失效）；内联样式也只在目标值变化时写一次。 */
  var barHLast = -1;
  var fabStyleSig = '';

  function setBarHeight(h) {
    h = Math.round(h || 0);
    if (!h || h === barHLast) return;
    barHLast = h;
    try { root.style.setProperty('--mr-bar-h', h + 'px'); } catch (e) { }
  }

  function startBarHeightWatch() {
    if (window.__mrBarHWatch) return;
    window.__mrBarHWatch = 1;
    var bar = document.getElementById('bottom-bar');
    if (!bar || typeof ResizeObserver !== 'function') return;
    try {
      new ResizeObserver(function () { setBarHeight(bar.getBoundingClientRect().height); }).observe(bar);
      setBarHeight(bar.getBoundingClientRect().height);
    } catch (e) { }
  }

  function hideFab() {
    var f = document.getElementById('fx-fab');
    if (!f) return;
    if (document.body.classList.contains('splash-active')) {
      try { f.style.setProperty('display', 'none', 'important'); } catch (e) { }
      fabStyleSig = '';
      return;
    }
    var bar = document.getElementById('bottom-bar');
    if (!bar) return;
    if (f.parentElement !== bar) { try { bar.appendChild(f); } catch (e) { } }
    if (barHLast < 0) setBarHeight(bar.getBoundingClientRect().height);
    /* 目标样式串：不变就完全不碰 style（避免每次 tick 触发样式重算） */
    if (fabStyleSig === 'flex|visible|1|auto|absolute|6|0') return;
    fabStyleSig = 'flex|visible|1|auto|absolute|6|0';
    var S = function (k, v) { try { f.style.setProperty(k, v, 'important'); } catch (e) { } };
    S('display', 'flex');
    S('visibility', 'visible');
    S('opacity', '1');
    /* v77：宿主 body.immersive-mode 会给 #fx-fab 钉 pointer-events:none（播放页正是沉浸模式），
       内联 important 才能让 DIY 键在播放页也能点。 */
    S('pointer-events', 'auto');
    S('position', 'absolute');
    S('z-index', '6');
    S('margin', '0');
  }

  /* 手机上「回首页」必须走我们自己的状态机：
     宿主的 goHome() 是开关语义（首页已显示时它会 dismissHomePage 把首页关掉），
     在播放页则应该走 exitPlayerPage() 的 360ms 转场，而不是瞬间跳。 */
  function gotoHome() {
    try {
      if (pageState === 'player' || pageState === 'to-player') { exitPlayerPage(); return; }
      if (isBusy()) { commitInstant('home'); return; }
      /* 已经在首页：什么都不做，避免调 goHome() 把首页 dismiss / 弹「已关闭 Home」 */
    } catch (e) { }
  }

  function openAccount() {
    if (typeof window.onUserBtnClick === 'function') { window.onUserBtnClick(); return; }
    var btn = document.getElementById('user-btn');
    if (btn) btn.click();
  }

  function toggleMenu(force) {
    var menu = document.getElementById('phone-chrome-menu');
    var more = document.getElementById('phone-chrome-more');
    if (!menu) return;
    var open = typeof force === 'boolean' ? force : !!menu.hidden;
    menu.hidden = !open;
    if (more) more.setAttribute('aria-expanded', String(open));
  }

  /* 播放页：拦截舞台画布上的点击/双击，避免 App 触发相机重置、隐藏控件 */
  /* 播放页舞台触摸层：单指拖动旋转视角，双指交给缩放 */
  /* v65：DIY 键点击兜底（宿主绑在自己 DOM 上的 handler 在重排后可能不触发） */
  /* v70：DIY 键 = 视觉控制台开关（不再有「DIY 玩家模式」这个概念）。
     - 面板从 DIY 键位置长出（CSS transform-origin: 右下）
     - 点面板外/按返回键都只关面板，不改任何模式 */
  /* v77：开态由手机层自持（body.mr-diy-open）。宿主的 fx 面板自己也会被 hover/auto-peek
     写 .peek/.show class，若用 class 判断开合，宿主一加 .peek 我们就会「以为已经开着」
     而把它关掉 —— 表现就是点 DIY 打不开。所以开合只认 window.__mrDiyOpen。 */
  function keepDiyPanelOpen() {
    if (!window.__mrDiyOpen) return;
    var panel = document.getElementById('fx-panel');
    if (!panel) return;
    try { bodyEl().classList.add('mr-diy-open'); } catch (e) { }
    if (!panel.classList.contains('peek') && !panel.classList.contains('show')) panel.classList.add('peek');
    showDiyPanelEl(panel);
  }

  /* v78：开态可见性交给 CSS（body.mr-diy-open），这里只兜底 display。
     不要内联 opacity/visibility/pointer-events！CSS transition 的优先级虽高于 !important，
     但内联 !important 的直接跳变会让面板「硬切」出现 —— WebView 上表现为闪一下。 */
  function showDiyPanelEl(panel) {
    if (!panel) return;
    try { panel.style.setProperty('display', 'block', 'important'); } catch (e) { }
  }

  /* v80：关面板先播 180ms 收起动画（淡出 + 下滑 + 轻微缩小），再真正清状态，
     和开场的滑入对称，不再瞬间消失。动画期间 body.mr-diy-open 保留，
     由 phone.css 的 .mr-diy-closing 规则驱动。 */
  var DIY_CLOSE_MS = 200;
  var diyCloseTimer = 0;
  function cancelDiyClose() {
    if (diyCloseTimer) { try { clearTimeout(diyCloseTimer); } catch (e) { } diyCloseTimer = 0; }
    try { bodyEl().classList.remove('mr-diy-closing'); } catch (e) { }
    var p = document.getElementById('fx-panel');
    if (p) { try { p.classList.remove('mr-diy-closing'); } catch (e) { } }
  }
  function finishDiyClose() {
    diyCloseTimer = 0;
    try { bodyEl().classList.remove('mr-diy-open', 'mr-diy-closing'); } catch (e) { }
    var panel = document.getElementById('fx-panel');
    if (panel) { try { panel.classList.remove('show', 'peek', 'pinned', 'mr-diy-closing'); } catch (e) { } }
    try { panelKbFit(); } catch (e) { }   /* 清掉键盘期的内联钉高 */
  }
  function setDiyPanel(open) {
    var panel = document.getElementById('fx-panel');
    if (!panel) return;
    if (open) {
      cancelDiyClose();
      window.__mrDiyOpen = true;
      if (window.__mrDiyKeepTimer) { try { clearTimeout(window.__mrDiyKeepTimer); } catch (e) { } window.__mrDiyKeepTimer = 0; }
      try { panel.classList.remove('closing'); } catch (e) { }
      showDiyPanelEl(panel);
      /* v78：不再 250ms 轮询补 class（宿主不会删我们的 body class）。
         只在 500ms 后做一次复查，兜住宿主在开场瞬间的 auto-hide/auto-peek。 */
      try { bodyEl().classList.add('mr-diy-open'); } catch (e) { }
      panel.classList.add('peek');
      var fab = document.getElementById('fx-fab');
      if (fab) fab.classList.add('active');
      window.__mrDiyKeepTimer = window.setTimeout(keepDiyPanelOpen, 500);
      try { panelKbFit(); } catch (e) { }
      return;
    }
    if (!window.__mrDiyOpen) return;          /* 已经关着（或正在播收起动画） */
    window.__mrDiyOpen = false;
    if (window.__mrDiyKeepTimer) { try { clearTimeout(window.__mrDiyKeepTimer); } catch (e) { } window.__mrDiyKeepTimer = 0; }
    var fab2 = document.getElementById('fx-fab');
    if (fab2) fab2.classList.remove('active');
    try { bodyEl().classList.add('mr-diy-closing'); } catch (e) { }
    panel.classList.add('mr-diy-closing');
    try { panelKbFit(); } catch (e) { }
    diyCloseTimer = window.setTimeout(finishDiyClose, DIY_CLOSE_MS);
  }

  function diyPanelOpen() {
    return !!window.__mrDiyOpen;
  }

  /* v79：面板内输入框聚焦（软键盘弹出）时，WebView 的 vh 会变小，
     面板几何（top:31vh + bottom:底栏）会缩成一个奇怪的小块，看起来像退回了旧版。
     这里在键盘弹出期间把面板钉成「可视区内的整块表」，键盘收起立即恢复 CSS 几何。 */
  var panelKbPinned = false;
  var layoutBaseH = 0;
  function panelKbFit() {
    var panel = document.getElementById('fx-panel');
    if (!panel) return;
    var layH = window.innerHeight || 0;
    if (!layoutBaseH) layoutBaseH = layH;
    var vv = window.visualViewport || null;
    var visH = vv ? vv.height : layH;
    var visTop = vv ? vv.offsetTop : 0;
    var ae = document.activeElement;
    var textInput = !!(ae && panel.contains(ae) && /^(input|textarea)$/i.test(ae.tagName)
      && !ae.readOnly && !ae.disabled
      && (ae.type === '' || ae.type === 'text' || ae.type === 'search' || ae.type === 'url' || ae.type === 'email' || ae.type === 'number' || ae.type === 'tel' || ae.type === 'password'));
    /* 键盘可能表现为「布局视口变小」（adjustResize）或「视觉视口变小」（adjustPan） */
    var kbOpen = !!textInput && (layH < layoutBaseH - 80 || visH < layH - 80 || visH < layoutBaseH - 80);
    if (!window.__mrDiyOpen || !kbOpen) {
      if (!textInput && layH > 200) layoutBaseH = Math.max(layoutBaseH, layH);
      if (panelKbPinned) {
        panelKbPinned = false;
        ['top', 'bottom', 'height', 'max-height'].forEach(function (k) { try { panel.style.removeProperty(k); } catch (e) { } });
      }
      return;
    }
    var top = Math.max(8, Math.round(visTop + 8));
    var avail = Math.min(visH, layH) - top - 8;
    var height = Math.max(180, Math.round(avail));
    if (panelKbPinned && panel.__mrKbTop === top && panel.__mrKbH === height) return;
    panelKbPinned = true;
    panel.__mrKbTop = top;
    panel.__mrKbH = height;
    var S = function (k, v) { try { panel.style.setProperty(k, v, 'important'); } catch (e) { } };
    S('top', top + 'px');
    S('bottom', 'auto');
    S('height', height + 'px');
    S('max-height', 'none');
  }
  function bindPanelKeyboardFit() {
    if (window.__mrPanelKbBound) return;
    window.__mrPanelKbBound = 1;
    var run = function () { try { panelKbFit(); } catch (e) { } };
    try {
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', run);
        window.visualViewport.addEventListener('scroll', run);
      }
      window.addEventListener('resize', run);
      document.addEventListener('focusin', function () { window.setTimeout(run, 60); window.setTimeout(run, 220); }, true);
      document.addEventListener('focusout', function () { window.setTimeout(run, 120); window.setTimeout(run, 320); }, true);
    } catch (e) { }
  }

  /* 把宿主「DIY 玩家模式」固定打开（手机版不再暴露这个开关），并换回原包的 DIY 图标 */
  function initDiyConsole() {
    if (window.__mrDiyInit) return;
    window.__mrDiyInit = 1;
    try { window.diyPlayerMode = true; } catch (e) { }
    try { bodyEl().classList.add('diy-mode'); } catch (e) { }
    var fab = document.getElementById('fx-fab');
    if (fab && !fab.__mrIcon) {
      fab.__mrIcon = 1;
      fab.innerHTML = '<svg width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24">'
        + '<path d="M4 7h8"/><path d="M16 7h4"/><circle cx="14" cy="7" r="2"/>'
        + '<path d="M4 17h4"/><path d="M12 17h8"/><circle cx="10" cy="17" r="2"/></svg>';
    }
  }

  /* DIY 键点击：宿主在 touchstart/pointerdown 上可能 preventDefault 导致 click 不产生，
     所以挂 pointerup + click 两路（450ms 去重）。宿主自带的开合逻辑抢不到我们的状态：
     开合只认 __mrDiyOpen，样式挂在 body.mr-diy-open 上。 */
  var fabToggleAt = 0;
  function toggleFromFab(ev) {
    var now = Date.now();
    if (now - fabToggleAt < 450) return;
    fabToggleAt = now;
    if (ev) { try { ev.stopPropagation(); ev.preventDefault(); } catch (e) { } }
    setDiyPanel(!window.__mrDiyOpen);
  }

  function bindFab(el) {
    if (!el || el.__mrDiyBound) return;
    el.__mrDiyBound = 1;
    ['pointerup', 'click'].forEach(function (t) {
      el.addEventListener(t, function (ev) { toggleFromFab(ev); }, { passive: false });
    });
  }

  /* ---- §2 DIY 视觉控制台开关 ---- */
  function bindDiyTap() {
    if (window.__mrDiyTap) return;
    window.__mrDiyTap = 1;
    bindFab(document.getElementById('fx-fab'));
    /* 点面板外：只关面板（不碰任何模式） */
    document.addEventListener('pointerdown', function (ev) {
      if (!diyPanelOpen()) return;
      var t = ev.target;
      if (t.closest && t.closest('#fx-panel')) return;
      if (t.closest && t.closest('#fx-fab')) return;
      /* v79：宿主的取色器/历史/搜索下拉等浮层是 append 到 body 的，DOM 不在 #fx-panel 内，
         但视觉上就叠在面板上——按面板矩形做兜底判断，避免点这些地方把面板误关掉
         （误关后宿主 auto-peek 会重新 .peek，就容易看到另一套旧几何）。 */
      try {
        var pb = document.getElementById('fx-panel').getBoundingClientRect();
        var pad = 8;
        if (ev.clientX >= pb.left - pad && ev.clientX <= pb.right + pad
          && ev.clientY >= pb.top - pad && ev.clientY <= pb.bottom + pad) return;
      } catch (e) { }
      setDiyPanel(false);
    }, true);
  }

  /* ---- 播放页舞台：单指拖拽旋转 / 轻点无响应 / 双击回正 ---- */
  function stageIsPlayerPage() {
    try { return document.body.classList.contains('mr-player-page'); } catch (e) { return false; }
  }

  /* 宿主自带「双击回正」（recenterCamera），但它的监听挂在 renderer.domElement 上，
     播放页被 #mr-stage-overlay 挡着收不到，所以手机层自己识别双击并调用它。 */
  function recenterStageView() {
    try {
      if (typeof window.recenterCamera === 'function') { window.recenterCamera(); return; }
      if (window.orbit) window.orbit.recentering = true;
    } catch (e) { }
  }

  function bindStageDrag() {
    if (window.__mrStageDragBound) return;
    window.__mrStageDragBound = 1;
    var overlay = document.getElementById('mr-stage-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mr-stage-overlay';
      document.body.appendChild(overlay);
    }
    var lastX = 0, lastY = 0, downX = 0, downY = 0, active = false, moved = false, unlocked = false;
    var lastTapAt = 0, lastTapX = 0, lastTapY = 0;
    overlay.addEventListener('touchstart', function (ev) {
      /* v77：取消默认动作 → WebView 不再合成 mousedown/mousemove/mouseup/click。
         宿主的点击/悬停链路（canvas click、左缘歌单 peek、粒子跟随）因此完全收不到播放页的轻点，
         而 touch/pointer 事件照常派发，拖拽旋转与双击检测不受影响。 */
      try { ev.preventDefault(); } catch (e) { }
      if (ev.touches.length === 1) {
        active = true;
        lastX = downX = ev.touches[0].clientX;
        lastY = downY = ev.touches[0].clientY;
        moved = false;
        unlocked = false;
      } else {
        active = false;
      }
    }, { passive: false });
    overlay.addEventListener('touchmove', function (ev) {
      if (ev.touches.length !== 1) { active = false; return; }
      var x = ev.touches[0].clientX, y = ev.touches[0].clientY;
      var tx = x - downX, ty = y - downY;
      if (tx * tx + ty * ty > 100) moved = true;   /* >10px 视为拖拽，不当轻点 */
      if (moved && !unlocked) {
        /* 宿主 recenterCamera() 会把 orbit.centerLocked 置 true：此后相机目标永远是 baselineTheta，
           userTheta 改了也不生效（表现为「双击回正后视角锁死」）。宿主的 mousemove 拖拽里会调
           unlockCenteredView()，我们走 touch 链路绕过了它，所以这里补上。 */
        unlocked = true;
        try {
          if (typeof window.unlockCenteredView === 'function') window.unlockCenteredView();
          else if (window.orbit) window.orbit.centerLocked = false;
          if (window.orbit) window.orbit.recentering = false;
        } catch (e) { }
      }
      if (!active || !window.orbit) return;
      var dx = x - lastX, dy = y - lastY;
      lastX = x; lastY = y;
      try {
        window.orbit.userTheta -= dx * 0.006;
        var phi = (window.orbit.userPhi || 0) + dy * 0.004;
        if (phi > 1.15) phi = 1.15;
        if (phi < -1.15) phi = -1.15;
        window.orbit.userPhi = phi;
      } catch (e) { }
      ev.preventDefault();
    }, { passive: false });
    overlay.addEventListener('touchend', function (ev) {
      active = false;
      if (moved || !stageIsPlayerPage()) return;
      var t = ev.changedTouches && ev.changedTouches[0];
      var x = t ? t.clientX : downX, y = t ? t.clientY : downY;
      var now = Date.now();
      if (lastTapAt && now - lastTapAt <= 340 && Math.abs(x - lastTapX) <= 34 && Math.abs(y - lastTapY) <= 34) {
        lastTapAt = 0;
        recenterStageView();          /* 双击回正 */
      } else {
        lastTapAt = now; lastTapX = x; lastTapY = y;
      }
    }, { passive: true });
    overlay.addEventListener('touchcancel', function () { active = false; moved = false; }, { passive: true });
    ['pointerdown', 'mousedown', 'touchstart', 'touchend', 'click', 'dblclick'].forEach(function (type) {
      overlay.addEventListener(type, function (ev) {
        if (ev.touches && ev.touches.length > 1) return;
        ev.stopPropagation();
        if (type === 'click' || type === 'dblclick') {
          try { ev.preventDefault(); } catch (e) { }
        }
      }, { capture: false, passive: type !== 'click' && type !== 'dblclick' });
    });
  }

  /* v76：播放页舞台上所有点击类响应一律屏蔽（宿主在 canvas 上挂了 click/dblclick，
     会表现为「点左半边有反应」）。
     v77：把「双击回正」还给用户 —— 双击只做回正，不做任何其它点击响应；
     鼠标事件（外接鼠标/调试）也按同一语义处理。 */
  function bindStageGuard() {
    if (window.__mrStageGuardBound) return;
    window.__mrStageGuardBound = 1;
    function isStageTarget(t) {
      if (!t || !t.closest) return false;
      return !!t.closest('#canvas-container, canvas, #idle-guide-canvas, #mr-stage-overlay');
    }
    ['click', 'mouseup', 'contextmenu'].forEach(function (type) {
      window.addEventListener(type, function (ev) {
        if (!stageIsPlayerPage()) return;
        if (!isStageTarget(ev.target)) return;
        try {
          ev.stopImmediatePropagation();
          ev.stopPropagation();
          ev.preventDefault();
        } catch (e) { }
      }, true);
    });
    window.addEventListener('dblclick', function (ev) {
      if (!stageIsPlayerPage() || !isStageTarget(ev.target)) return;
      try {
        ev.stopImmediatePropagation();
        ev.stopPropagation();
        ev.preventDefault();
      } catch (e) { }
      recenterStageView();
    }, true);
  }

  /* 宿主在 window 捕获阶段挂了一个 touchstart：手指落在左侧 104px 带里就会
     setPeek(playlist-panel, true, 'pl')（桌面 hover 判定的触屏等价物）。
     这就是「播放页点左半边仍然有反应」的真正来源。播放页里把它关掉；
     首页保留宿主原行为（左缘点一下开歌单）。 */
  function patchPlaylistEdgeTrigger() {
    if (window.__mrEdgeTriggerPatched) return true;
    if (typeof window.isPlaylistEdgeTrigger !== 'function') return false;
    window.__mrEdgeTriggerPatched = 1;
    var orig = window.isPlaylistEdgeTrigger;
    window.isPlaylistEdgeTrigger = function () {
      try { if (stageIsPlayerPage()) return false; } catch (e) { }
      return orig.apply(this, arguments);
    };
    return true;
  }

  var trackEnterBarEl = null;
  function bindTrackEnter() {
    if (window.__mrTrackEnterBound) return;
    window.__mrTrackEnterBound = 1;
    document.addEventListener('click', function (ev) {
      var bar = trackEnterBarEl || (trackEnterBarEl = document.getElementById('bottom-bar'));
      if (!bar || !bar.contains(ev.target)) return;
      if (pageState !== 'home' || isBusy()) return;
      /* 首页稳定显示（有 class）才有「点歌曲行进播放页」语义；原来每次点都读 opacity 强制样式 */
      if (!document.body.classList.contains('empty-home-active')) return;
      var hit = ev.target.closest && ev.target.closest('.control-track, #control-cover, #control-title, #control-title-text');
      if (!hit) return;
      ev.preventDefault();
      ev.stopPropagation();
      enterPlayerPage();
    }, true);
  }

  /* ---- 宿主驱动的「离开首页」→ 自动进播放页 ----
     v61 里宿主一收起首页（empty-home-active 消失），心跳里的 updatePlayerPage()
     就会把 mr-player-page 打上，所以「空白处点一下」「从歌单/搜索点歌起播」都会
     自动进播放页。v62 改成状态机后这条自动入口丢了，实测会出现两种卡死：
       · 首页空白处点一下 → dismissHomePage 收起首页，却停在「舞台 + 底栏」，进不去；
       · 歌单/搜索结果点歌 → 宿主在起播流程里收起首页，但播放页不出现。
     这里只认两个无歧义的事实，不碰宿主其它 show=false（搜索/导入/面板）： */
  function enterPlayerFromHostHide() {
    try {
      if (pageState !== 'home' || isBusy()) return;
      if (!bodyEl() || bodyEl().classList.contains('splash-active')) return;
      if (bodyEl().classList.contains('empty-home-active')) return;   /* 首页还在，不是「离开首页」 */
      /* v75：从搜索结果/歌单里点歌起播时，先把浮层收掉，否则浮层会盖在播放页上「看起来没变化」 */
      try {
        var sa = document.getElementById('search-area');
        if (sa && sa.classList.contains('has-results')) {
          try { clearSearchResults(); } catch (e) { }
          try { setPeek(sa, false, 'search'); } catch (e) { }
        }
      } catch (e) { }
      try {
        var pp = document.getElementById('playlist-panel');
        if (pp && (pp.classList.contains('show') || pp.classList.contains('peek'))) {
          try { closePlaylistPanel(); } catch (e) { }
        }
      } catch (e) { }
      try { setDiyPanel(false); } catch (e) { }
      enterPlayerPage();
    } catch (e) { }
  }

  function bindHostNavTriggers() {
    if (window.__mrNavTriggers) return;
    window.__mrNavTriggers = 1;
    /* 1) 空白处点击：宿主 dismissHomePage() 收起首页 */
    if (typeof window.dismissHomePage === 'function') {
      var rawDismiss = window.dismissHomePage;
      window.dismissHomePage = function () {
        var r = rawDismiss.apply(this, arguments);
        try { window.setTimeout(function () { enterPlayerFromHostHide(); }, 0); } catch (e) { }
        return r;
      };
    }
    /* 2) 真的起播：宿主起播流程（13-playback-start-audio.js）已先收起首页 */
    document.addEventListener('playing', function (e) {
      if (!e.target || e.target.tagName !== 'AUDIO') return;
      enterPlayerFromHostHide();
    }, true);
    /* 进度行时间：宿主 timeupdate 自己的标签被 CSS 隐藏，这里跟着音频刷新，
       避免只靠 2.5s watchdog 造成「每 2.5 秒跳一次」 */
    document.addEventListener('timeupdate', function (e) {
      if (!e.target || e.target.tagName !== 'AUDIO') return;
      updateProgressTimes();
    }, true);
    document.addEventListener('durationchange', function (e) {
      if (!e.target || e.target.tagName !== 'AUDIO') return;
      updateProgressTimes();
    }, true);
  }

  function buildChrome() {
    if (document.getElementById('phone-chrome-slot')) return;
    var holder = document.createElement('div');
    holder.innerHTML = CHROME_HTML;
    var slot = holder.firstElementChild;
    if (!slot) return;
    document.body.appendChild(slot);

    var more = document.getElementById('phone-chrome-more');
    if (more) {
      more.addEventListener('click', function (event) {
        event.preventDefault();
        toggleMenu();
      });
    }

    var actions = document.getElementById('phone-chrome-menu-actions');
    if (actions) {
      var homeBtn = document.createElement('button');
      homeBtn.type = 'button';
      homeBtn.className = 'phone-chrome-action';
      homeBtn.textContent = '首页';
      homeBtn.addEventListener('click', function () { toggleMenu(false); gotoHome(); });

      var loginBtn = document.createElement('button');
      loginBtn.type = 'button';
      loginBtn.className = 'phone-chrome-action';
      loginBtn.textContent = '登录';
      loginBtn.addEventListener('click', function () { toggleMenu(false); openAccount(); });

      actions.appendChild(homeBtn);
      actions.appendChild(loginBtn);

      /* v70：菜单里的「DIY 玩家模式」入口删除——DIY 只由底栏 DIY 键开关面板 */

      var plBtn = document.createElement('button');
      plBtn.type = 'button';
      plBtn.className = 'phone-chrome-action';
      plBtn.textContent = '歌单';
      plBtn.addEventListener('click', function () { toggleMenu(false); openPlaylistPanel(); });
      actions.appendChild(plBtn);

      // 本地音乐入口（仅当宿主存在 #android-local-entry 时显示，桌面版/Timing 版没有）
      if (document.getElementById('android-local-entry')) {
        var localBtn = document.createElement('button');
        localBtn.type = 'button';
        localBtn.className = 'phone-chrome-action';
        localBtn.textContent = '本地';
        localBtn.addEventListener('click', function () {
          toggleMenu(false);
          var entry = document.getElementById('android-local-entry');
          if (entry) entry.click();
        });
        actions.appendChild(localBtn);
      }
    }

    document.addEventListener('click', function (event) {
      var menu = document.getElementById('phone-chrome-menu');
      if (!menu || menu.hidden) return;
      var slot = document.getElementById('phone-chrome-slot');
      if (slot && !slot.contains(event.target)) toggleMenu(false);
    }, true);
  }

  /**
   * 可选：强制自然视口。
   * 仅当宿主页面带有「虚拟桌面缩放」（例如把 layout width 写成 25000 的移植版）
   * 时才需要调用；调用后会把 meta viewport 固定回 device-width 并监听改动。
   */
  function forceViewport() {
    var want = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      (document.head || document.documentElement).appendChild(meta);
    }
    if (meta.getAttribute('content') !== want) meta.setAttribute('content', want);
    if (!window.__mrPhoneViewportObserver && window.MutationObserver) {
      window.__mrPhoneViewportObserver = new MutationObserver(function () {
        if (meta.getAttribute('content') !== want) meta.setAttribute('content', want);
      });
      window.__mrPhoneViewportObserver.observe(meta, { attributes: true, attributeFilter: ['content'] });
    }
  }

  /* ---- 播放条：进度条挪到「歌曲行」和「控制行」之间 ---- */
  /* v62：进度条被 #mr-progress-row 包裹（行内左侧时间/进度/右侧时间）。
     一旦包裹行存在，这里只负责把「整行」放到 transport 前面，
     绝不能再把 #progress-bar 从行里搬出去（否则底栏高度会在 129.5/141.5 之间来回跳）。 */
  function reorderProgressBar() {
    var controls = document.getElementById('controls');
    var prog = document.getElementById('progress-bar');
    if (!controls || !prog) return;
    var transport = controls.querySelector('.control-cluster.transport');
    var row = document.getElementById('mr-progress-row');
    if (row) {
      if (row.parentElement !== controls) {
        if (transport) controls.insertBefore(row, transport);
        else controls.appendChild(row);
      } else if (transport && row.nextElementSibling !== transport) {
        controls.insertBefore(row, transport);
      }
      return;
    }
    if (!transport) return;
    if (prog.parentElement === controls && prog.nextElementSibling === transport) return;
    controls.insertBefore(prog, transport);
  }

  /* ---- 歌单/队列面板：加关闭按钮 + 下滑关闭 ---- */
  function closePlaylistPanel() {
    var panel = document.getElementById('playlist-panel');
    if (!panel) return;
    try { setPeek(panel, false, 'pl'); } catch (e) { }
    try { if (panel.classList.contains('show')) togglePlaylistPanel(); } catch (e) { }
  }

  /* 只允许从「…」菜单/本 UI 打开歌单：拦掉宿主左边缘手势的 setPeek('pl', true) */
  function patchPeek() {
    if (window.__mrPeekPatched || typeof window.setPeek !== 'function') return;
    window.__mrPeekPatched = 1;
    var raw = window.setPeek;
    window.setPeek = function (elem, on, key) {
      if (key === 'pl' && on && !window.__mrAllowPlOpen) return;
      return raw.call(this, elem, on, key);
    };
  }

  /* ==================================================================
   * v62 转场状态机：首页 ⇄ 播放页
   * ----------------------------------------------------------------
   * state: home | to-player | player | to-home
   *  - 底栏恒高三段（顶部槽位 / 进度行 / 控制行）：进出只换内容，不换结构
   *  - 歌曲行 .control-cluster.actions 用 WAAPI FLIP 在
   *    「底栏顶部槽位 ⇄ 屏幕顶部」飞行；飞走后用 #mr-track-slot 占位补高
   *  - 单一 360ms 转场，只动 transform/opacity
   *  - 宿主重活（setImmersiveMode / updateEmptyHomeVisibility）放在转场结束后
   * ================================================================== */
  var MR_DUR = 360;
  var MR_EASE = 'cubic-bezier(.22,.9,.25,1)';
  var pageState = 'home';
  /* 转场从开始到「宿主收尾（runHostAfterEnter/Exit）结束」整段窗口内，
     宿主的 updateEmptyHomeVisibility 一律不执行（也不跑 raw），
     只按当前状态维持 empty-home-active。用来堵两件事：
       1) 淡入/淡出途中插一次全量 home 重排（掉帧、二次淡入）；
       2) finishEnter → runHostAfterEnter 的双 rAF 空窗里，宿主算得 show=true
          把用户顶回首页（回弹）。 */
  var navSuppressed = false;
  var navSuppressTimer = 0;
  function setNavSuppressed(on) {
    navSuppressed = !!on;
    if (navSuppressTimer) { try { window.clearTimeout(navSuppressTimer); } catch (e) { } navSuppressTimer = 0; }
    if (on) {
      /* 兜底：任何异常路径都不允许永久抑制导航 */
      navSuppressTimer = window.setTimeout(function () { navSuppressed = false; navSuppressTimer = 0; }, 1600);
    }
  }
  var trackDocked = false;
  var flightAnim = null;
  var pageTimer = 0;
  var transSeq = 0;
  var hostHookDepth = 0;
  var rawUpdateEmptyHomeVisibility = null;

  function bodyEl() { return document.body; }
  function barEl() { return document.getElementById('bottom-bar'); }
  function controlsEl() { return document.getElementById('controls'); }
  function isBusy() { return pageState === 'to-player' || pageState === 'to-home'; }
  function hostImmersiveOn() {
    try { return typeof immersiveMode !== 'undefined' && !!immersiveMode; } catch (e) { return false; }
  }
  function findActions() {
    return document.querySelector('body > .control-cluster.actions.mr-top-track') ||
      document.querySelector('#bottom-bar #controls > .control-cluster.actions');
  }
  function findSlot() { return document.getElementById('mr-track-slot'); }

  function clearPageTimer() {
    if (pageTimer) { try { window.clearTimeout(pageTimer); } catch (e) { } pageTimer = 0; }
  }
  function cancelFlight() {
    if (flightAnim) { try { flightAnim.cancel(); } catch (e) { } flightAnim = null; }
  }
  function clearHomeInline() {
    var home = document.getElementById('empty-home');
    if (!home) return;
    try { home.style.removeProperty('opacity'); home.style.removeProperty('pointer-events'); } catch (e) { }
  }
  function scheduleIdle(fn) {
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { window.setTimeout(function () { try { fn(); } catch (e) { } }, 0); });
      });
    } else {
      window.setTimeout(function () { try { fn(); } catch (e) { } }, 50);
    }
  }

  /* ---- 底栏恒高三段结构（幂等，只用 class/属性，不做测量） ----
     v78：由 MutationObserver 置脏才跑（稳态零查询）；每次重建节点后清空进度时间缓存。 */
  function ensureStructure() {
    if (!window.__mrStructDirty) return;
    window.__mrStructDirty = 0;
    progCache = null;
    resetPopoverCache();
    var bar = barEl();
    if (!bar) return;
    var extras = document.getElementById('mr-player-extras');
    if (!extras) {
      extras = document.createElement('div');
      extras.id = 'mr-player-extras';
    }
    if (extras.parentElement !== bar) { try { bar.appendChild(extras); } catch (e) { } }
    var modes = extras.querySelector('.control-cluster.modes') ||
      document.querySelector('#controls > .control-cluster.modes');
    if (modes && modes.parentElement !== extras) { try { extras.appendChild(modes); } catch (e) { } }
    var controls = controlsEl();
    if (controls) {
      var slot = findSlot();
      if (!slot) {
        slot = document.createElement('div');
        slot.id = 'mr-track-slot';
      }
      if (slot.parentElement !== controls) { try { controls.insertBefore(slot, controls.firstChild); } catch (e) { } }
      var prog = document.getElementById('progress-bar');
      var row = document.getElementById('mr-progress-row');
      if (!row && prog && prog.parentElement) {
        row = document.createElement('div');
        row.id = 'mr-progress-row';
        var c = document.createElement('span'); c.id = 'mr-time-cur'; c.textContent = '0:00';
        var d = document.createElement('span'); d.id = 'mr-time-dur'; d.textContent = '0:00';
        row.appendChild(c);
        try { prog.parentElement.insertBefore(row, prog); } catch (e) { }
        row.appendChild(prog);
        row.appendChild(d);
      } else if (row && prog && prog.parentElement !== row) {
        var dur = row.querySelector('#mr-time-dur');
        try { row.insertBefore(prog, dur); } catch (e) { row.appendChild(prog); }
      }
    }
  }

  /* v63b：播放页 4 键按钮组回到 v61 的 body 级 fixed 定位（贴着底栏上沿、右侧滑入滑出）。
     放回底栏内部会被旧的 `body.mr-player-page #bottom-bar #volume-btn{display:none}` 命中
     （音量键消失），弹层基准也会错位。这里只在转场/收尾时量一次底栏位置，不逐帧测量。 */
  /* v64：4UI 现在是底栏右上角的绝对定位元素，位置全交给 CSS（含手机自适应），
     这里只清掉旧版留下的内联 bottom，避免和 CSS 打架。 */
  function layoutPlayerExtrasPos() {
    var extras = document.getElementById('mr-player-extras');
    if (!extras) return;
    try { extras.style.removeProperty('bottom'); extras.style.removeProperty('top'); } catch (e) { }
  }

  function applyRowHeight(px) {
    var h = (Math.round((px || 44) * 100) / 100) + 'px';
    try { document.documentElement.style.setProperty('--mr-track-row-h', h); } catch (e) { }
    var slot = findSlot();
    if (slot) { try { slot.style.height = h; } catch (e) { } }
  }

  /* v78：缓存节点引用 + 文案相同不写（timeupdate ≈4 次/秒） */
  var progCache = null;
  var fmtTime = function (x) {
    if (!isFinite(x) || x < 0) x = 0;
    var m = Math.floor(x / 60), s = Math.floor(x % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  };
  function updateProgressTimes() {
    var a = window.audio;
    if (!a) return;
    if (!progCache) progCache = { c: document.getElementById('mr-time-cur'), d: document.getElementById('mr-time-dur') };
    var cEl = progCache.c, dEl = progCache.d;
    if (!cEl || !dEl) { progCache = null; return; }
    var ct = fmtTime(a.currentTime), dt = fmtTime(a.duration);
    if (cEl.textContent !== ct) { try { cEl.textContent = ct; } catch (e) { } }
    if (dEl.textContent !== dt) { try { dEl.textContent = dt; } catch (e) { } }
  }

  /* ---- 歌曲行：底栏顶部槽位 → 屏幕顶部（FLIP） ---- */
  function liftTrackRow() {
    var actions = findActions();
    if (!actions) return null;
    var r0 = actions.getBoundingClientRect();
    applyRowHeight(r0.height);
    bodyEl().classList.add('mr-track-away');
    try { bodyEl().appendChild(actions); } catch (e) { return null; }
    actions.classList.remove('mr-track-bg-on');
    actions.classList.add('mr-top-track', 'mr-track-flying');
    var r1 = actions.getBoundingClientRect();
    trackDocked = true;
    actions.classList.add('mr-track-bg-on');   /* 上面已强制过样式计算，这里才触发渐变淡入 */
    var dx = Math.round((r0.left - r1.left) * 100) / 100;
    var dy = Math.round((r0.top - r1.top) * 100) / 100;
    try {
      return actions.animate(
        [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0px,0px)' }],
        { duration: MR_DUR, easing: MR_EASE, fill: 'both' }
      );
    } catch (e) { return null; }
  }

  /* ---- 歌曲行：屏幕顶部 → 底栏顶部槽位（反向 FLIP，落位时才换 DOM） ---- */
  function dropTrackRow() {
    var actions = findActions();
    var slot = findSlot();
    if (!actions) { bodyEl().classList.remove('mr-track-away'); trackDocked = false; return null; }
    actions.classList.remove('mr-track-bg-on');
    if (!slot || !trackDocked) return null;
    var r1 = actions.getBoundingClientRect();
    var rs = slot.getBoundingClientRect();
    var dx = Math.round((rs.left - r1.left) * 100) / 100;
    var dy = Math.round((rs.top - r1.top) * 100) / 100;
    try {
      return actions.animate(
        [{ transform: 'translate(0px,0px)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px)' }],
        { duration: MR_DUR, easing: MR_EASE, fill: 'both' }
      );
    } catch (e) { return null; }
  }

  function dockTrackImmediate() {
    var actions = findActions();
    var controls = controlsEl();
    cancelFlight();
    if (actions) {
      actions.classList.remove('mr-top-track', 'mr-track-flying', 'mr-track-bg-on');
      try { actions.style.removeProperty('transform'); } catch (e) { }
      if (controls && actions.parentElement !== controls) {
        var slot = findSlot();
        try {
          if (slot) controls.insertBefore(actions, slot);
          else controls.insertBefore(actions, controls.firstChild);
        } catch (e) { }
      }
    }
    bodyEl().classList.remove('mr-track-away');
    trackDocked = false;
  }

  function liftTrackImmediate() {
    var actions = findActions();
    if (!actions || trackDocked) return;
    cancelFlight();
    var h = 44;
    try { h = actions.getBoundingClientRect().height || 44; } catch (e) { }
    applyRowHeight(h);
    bodyEl().classList.add('mr-track-away');
    try { bodyEl().appendChild(actions); } catch (e) { }
    actions.classList.add('mr-top-track', 'mr-track-bg-on');
    actions.classList.remove('mr-track-flying');
    try { actions.style.removeProperty('transform'); } catch (e) { }
    trackDocked = true;
  }

  /* ---- 转场入口 ---- */
  function enterPlayerPage() {
    if (pageState === 'player') return;
    if (isBusy()) commitInstant(pageState === 'to-player' ? 'player' : 'home');
    if (pageState === 'player') return;
    var seq = ++transSeq;
    clearPageTimer();
    pageState = 'to-player';
    setNavSuppressed(true);
    /* 关键：清掉宿主的「首页被强制显示」标记。
       否则 homeForcedOpen=true 会让 shouldShowEmptyHomeCore() 永远返回 true，
       播放页期间宿主任何一次 updateEmptyHomeVisibility()（暂停/切歌/队列变化…）
       都会让包装层判定「首页该显示」→ 立刻把我们踢回首页。 */
    try { window.homeForcedOpen = false; } catch (e) { }
    clearHomeInline();
    ensureStructure();
    layoutPlayerExtrasPos();
    bodyEl().classList.add('mr-transitioning', 'mr-player-page', 'mr-player-entering');
    flightAnim = liftTrackRow();
    if (flightAnim && flightAnim.finished && flightAnim.finished.then) {
      flightAnim.finished.then(function () { finishEnter(seq); }).catch(function () { });
    }
    pageTimer = window.setTimeout(function () { finishEnter(seq); }, MR_DUR + 240);
  }

  function finishEnter(seq) {
    if (seq !== transSeq) return;
    clearPageTimer();
    cancelFlight();
    var actions = findActions();
    if (actions) {
      actions.classList.remove('mr-track-flying');
      try { actions.style.removeProperty('transform'); } catch (e) { }
    }
    pageState = 'player';
    bodyEl().classList.remove('mr-transitioning', 'mr-player-entering');
    bodyEl().classList.add('mr-player-page');
    scheduleIdle(function () { if (pageState === 'player') runHostAfterEnter(); });
  }

  function exitPlayerPage() {
    if (pageState === 'home') return;
    if (isBusy()) commitInstant(pageState === 'to-player' ? 'player' : 'home');
    if (pageState === 'home') return;
    var seq = ++transSeq;
    clearPageTimer();
    pageState = 'to-home';
    try { hidePopovers(); } catch (e) { }
    setNavSuppressed(true);
    clearHomeInline();
    /* 用「显示首页」而不是开关：goHome() 有 dismiss 分支（会先把首页关掉再被 hack 拉回） */
    try { window.homeForcedOpen = true; window.homeSuppressed = false; } catch (e) { }
    if (!bodyEl().classList.contains('empty-home-active')) {
      bodyEl().classList.add('empty-home-active');
      try { window.emptyHomeActive = true; } catch (e) { }
    }
    bodyEl().classList.add('mr-transitioning', 'mr-return-home');
    /* 立刻让首页开始淡入：移除 mr-player-page，并撤掉宿主的 immersive 遮罩 */
    bodyEl().classList.remove('mr-player-page', 'immersive-mode');
    flightAnim = dropTrackRow();
    if (flightAnim && flightAnim.finished && flightAnim.finished.then) {
      flightAnim.finished.then(function () { finishExit(seq); }).catch(function () { });
    }
    pageTimer = window.setTimeout(function () { finishExit(seq); }, MR_DUR + 240);
  }

  function finishExit(seq) {
    if (seq !== transSeq) return;
    clearPageTimer();
    dockTrackImmediate();
    pageState = 'home';
    bodyEl().classList.remove('mr-transitioning', 'mr-return-home');
    scheduleIdle(function () { if (pageState === 'home') runHostAfterExit(); });
  }

  /* 快速连点/返回键中途接管：立刻落到终态 */
  function commitInstant(target) {
    transSeq++;
    clearPageTimer();
    applyRowHeight(currentRowHeight());
    if (target === 'player') {
      cancelFlight();
      bodyEl().classList.remove('mr-transitioning', 'mr-player-entering', 'mr-return-home');
      pageState = 'player';
      try { window.homeForcedOpen = false; } catch (e) { }
      bodyEl().classList.add('mr-player-page');
      if (!trackDocked) liftTrackImmediate();
      scheduleIdle(function () { if (pageState === 'player') runHostAfterEnter(); });
    } else {
      bodyEl().classList.remove('mr-transitioning', 'mr-player-entering', 'mr-return-home');
      pageState = 'home';
      bodyEl().classList.remove('mr-player-page');
      cancelFlight();
      if (trackDocked) dockTrackImmediate();
      bodyEl().classList.remove('mr-track-away');
      scheduleIdle(function () { if (pageState === 'home') runHostAfterExit(); });
    }
  }

  function currentRowHeight() {
    var slot = findSlot();
    if (slot) { var h = slot.getBoundingClientRect().height; if (h > 0) return h; }
    return 44;
  }

  /* ---- 转场结束后的宿主重活（绝不在动画窗口里跑） ---- */
  function runHostAfterEnter() {
    layoutPlayerExtrasPos();
    try {
      if (typeof setImmersiveMode === 'function') {
        if (hostImmersiveOn()) bodyEl().classList.add('immersive-mode');
        else setImmersiveMode(true);
      }
    } catch (e) { }
    pageState = 'player';
    updatePlayerPage();
    try { hideFab(); layoutPhoneBar(); ensureStructure(); } catch (e) { }
    setNavSuppressed(false);
  }

  function runHostAfterExit() {
    hostHookDepth++;
    try {
      if (typeof setImmersiveMode === 'function' && hostImmersiveOn()) setImmersiveMode(false);
      else bodyEl().classList.remove('immersive-mode');
    } catch (e) { }
    try { if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false); } catch (e) { }
    try {
      var bar = barEl();
      if (bar) { bar.classList.remove('soft-hidden'); bar.classList.add('visible'); }
    } catch (e) { }
    try {
      if (rawUpdateEmptyHomeVisibility) rawUpdateEmptyHomeVisibility({ forceLoad: false });
      else if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility({ forceLoad: false });
    } catch (e) { }
    hostHookDepth--;
    pageState = 'home';
    updatePlayerPage();
    try { hideFab(); ensureStructure(); } catch (e) { }
    setNavSuppressed(false);
  }

  /* ---- 宿主钩子：底栏显隐旁路 + 首页显隐事件驱动 + 首页渲染去重 ---- */
  /* 「确实在起播/在播」——只认播放事实，不认「队列非空」。
     旧版用 hasActivePlaybackControls()（队列里有歌就 true），会导致开着暂停队列时，
     点首页「导入本地音乐 / 搜索 / 歌单架」这类 show=false 也误翻到播放页。 */
  function hasPlaybackSignal() {
    try { if (window.playing === true) return true; } catch (e) { }
    try {
      var a = window.audio;
      if (a && a.src && !a.paused && !a.ended && a.currentTime > 0.05) return true;
    } catch (e) { }
    return false;
  }
  function anyOverlayOpen() {
    var list = [
      ['playlist-panel', 'show'], ['playlist-panel', 'peek'],
      ['search-area', 'has-results'], ['login-modal', 'show'],
      ['fx-panel', 'show'], ['fx-panel', 'peek'], ['visual-guide', 'show'],
      ['upload-panel', 'show'], ['upload-tip', 'show'],
      ['user-modal', 'show'], ['trial-banner', 'show'],
      ['track-detail-modal', 'show'], ['source-fallback-notice', 'show']
    ];
    for (var i = 0; i < list.length; i++) {
      var el = document.getElementById(list[i][0]);
      if (el && el.classList.contains(list[i][1])) return true;
    }
    try { if (bodyEl().classList.contains('fx-console-open')) return true; } catch (e) { }
    /* 3D 歌单架：卡座被 pin 住/打开了内容时，宿主 shouldShowEmptyHomeCore 也会返回 false，
       但它不是浮层 DOM，必须单独判断，否则有暂停队列时会被误翻到播放页。 */
    try { if (window.shelfPinnedOpen) return true; } catch (e) { }
    try {
      if (window.shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return true;
    } catch (e) { }
    return false;
  }

  function patchHostHooks() {
    if (!window.__mrControlsPatched) {
      window.__mrControlsPatched = 1;
      /* 手机底栏常显：宿主的自动隐藏/显示状态机不再生效（CSS 也有兜底） */
      window.setControlsHidden = function () { };
      window.scheduleControlsHide = function () { };
    }
    if (!window.__mrEmptyHomePatched && typeof window.updateEmptyHomeVisibility === 'function') {
      window.__mrEmptyHomePatched = 1;
      rawUpdateEmptyHomeVisibility = window.updateEmptyHomeVisibility;
      window.updateEmptyHomeVisibility = function (opts) {
        /* 转场窗口（含宿主收尾空窗）：完全旁路宿主，不跑 raw、不做全量首页重排。
           只按当前状态维持 empty-home-active，避免在淡入/淡出中途插重活，
           也避免宿主算得 show=true 把用户顶回首页。 */
        try {
          if (hostHookDepth > 0) return rawUpdateEmptyHomeVisibility.apply(this, arguments);
          if (!bodyEl() || bodyEl().classList.contains('splash-active')) return rawUpdateEmptyHomeVisibility.apply(this, arguments);
          if (navSuppressed) {
            var wantShow = (pageState === 'home' || pageState === 'to-home');
            if (wantShow) {
              if (!bodyEl().classList.contains('empty-home-active')) bodyEl().classList.add('empty-home-active');
              try { window.emptyHomeActive = true; } catch (e) { }
            }
            return wantShow;
          }
        } catch (e) { }
        var res = rawUpdateEmptyHomeVisibility.apply(this, arguments);
        try {
          if (hostHookDepth > 0) return res;
          if (!bodyEl() || bodyEl().classList.contains('splash-active')) return res;
          var show = (typeof res === 'boolean') ? res : bodyEl().classList.contains('empty-home-active');
          if (show) {
            if (pageState === 'player') exitPlayerPage();
            return res;
          }
          if (pageState !== 'home') return res;
          if (window.homeSuppressed) return res;
          if (!hasPlaybackSignal()) return res;      /* 只认播放事实，避免面板/上传等误触发 */
          if (anyOverlayOpen()) return res;
          enterPlayerPage();
        } catch (e) { }
        return res;
      };
    }
    if (!window.__mrRenderHomePatched && typeof window.renderHomeDiscover === 'function') {
      window.__mrRenderHomePatched = 1;
      var rawRender = window.renderHomeDiscover;
      var renderQueued = false;
      /* 只合并「同一任务内的重复调用」（goHome 一次会连调 2 次），
         不再用 32ms 时间去重——否则会把 loadHomeDiscover 完成后的那次渲染也吞掉，
         首页可能停在骨架/「正在整理推荐」。 */
      window.renderHomeDiscover = function () {
        if (renderQueued) return;
        renderQueued = true;
        var self = this, args = arguments;
        try {
          Promise.resolve().then(function () { renderQueued = false; });
        } catch (e) { renderQueued = false; }
        return rawRender.apply(self, args);
      };
    }
  }

  /* 右上角按钮：登录后显示账号头像，点击仍打开「首页/登录/DIY/歌单」菜单 */
  /* 手机底栏重排：循环 | 收藏 | 上一首 | 播放 | 下一首 | 混音 | 列表 */
  /* 手机上「词」按钮没有 hover：点一下同时展开歌词校准弹层 */
  /* 音量按钮：自己做开关（宿主 toggle 在手机上不总是关得掉） */
  /* 暂停立即切换图标：正在播放时直接 pause，不等淡出 */
  /* 歌单/接口结果本地缓存，减少每次打开都重新拉取 */
  /* 原生 bridge 请求缓存：歌单/推荐等 GET 结果存本地，打开歌单不再每次重新拉 */
  function patchApiCache() {
    if (window.__mrApiCache) return;
    var raw = window.fetch;
    if (typeof raw !== 'function') return;
    window.__mrApiCache = 1;
    var TTL = 6 * 3600 * 1000;
    var makeResp = function (payload) {
      return {
        ok: true, status: 200, statusText: 'OK',
        headers: { get: function (n) { return String(n).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null; } },
        json: function () { return Promise.resolve(payload); },
        text: function () { return Promise.resolve(JSON.stringify(payload)); },
        clone: function () { return makeResp(payload); }
      };
    };
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : ((input && input.url) || '');
      var method = (init && init.method) || 'GET';
      var cacheable = method.toUpperCase() === 'GET' && /\/api\//.test(url) && !/cover|image|img|avatar|binary/i.test(url);
      var key = 'mr-api-cache:' + url;
      if (cacheable) {
        try {
          var rec = JSON.parse(localStorage.getItem(key) || 'null');
          if (rec && Date.now() - rec.t < TTL) return Promise.resolve(makeResp(rec.d));
        } catch (e) { }
      }
      var out = raw.apply(this, arguments);
      if (cacheable && out && typeof out.then === 'function') {
        return out.then(function (res) {
          try {
            if (res && typeof res.clone === 'function') {
              res.clone().json().then(function (data) {
                try {
                  localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data }));
                } catch (e) { }
              }).catch(function () { });
            }
          } catch (e) { }
          return res;
        });
      }
      return out;
    };
  }

  /* 抑制「已关闭 Home / 已回到首页」这类提示 */
  function patchHomeToast() {
    if (window.__mrToastPatched) return;
    var raw = window.showToast;
    if (typeof raw !== 'function') return;
    window.__mrToastPatched = 1;
    window.showToast = function (msg) {
      try {
        if (typeof msg === 'string' && /Home|沉浸/i.test(msg)) return;
      } catch (e) { }
      return raw.apply(this, arguments);
    };
  }

  /* 降低 3D 渲染分辨率，减轻 GPU 压力 */
  /* 把暂停淡出设为 0：点暂停立即切换图标（原来要等 ~1s 淡出） */
  function tuneAudioFade() {
    if (window.__mrFadeTuned) return;
    if (typeof setAudioFadeSetting !== 'function') return;
    try {
      setAudioFadeSetting('out', 0, true);
      window.__mrFadeTuned = 1;
    } catch (e) { }
  }

  function tuneRendererOnce() {
    if (window.__mrRendererTuned) return;
    var r = window.renderer;
    if (!r || !r.getPixelRatio) return;
    window.__mrRendererTuned = 1;
    try {
      var pr = r.getPixelRatio();
      if (pr > 1.0) {
        r.setPixelRatio(1.0);
        if (r.setSize) r.setSize(window.innerWidth, window.innerHeight, false);
      }
    } catch (e) { }
  }

  /* v64：弹层按触发按钮当前的 rect 相对定位（正上方、右对齐、距按钮 8px，带屏幕边界收敛）。
     不用固定像素，手机自适应/横竖屏变化时弹层会跟着按钮走。 */
  function placePopover(ctl, pop) {
    if (!ctl || !pop) return;
    var P = function (k, v) { try { pop.style.setProperty(k, v, 'important'); } catch (e) { } };
    /* 挂到 body 下：避免被 #mr-player-extras 的 will-change:transform 变成 fixed 包含块 */
    if (pop.parentElement !== document.body) { try { document.body.appendChild(pop); } catch (e) { } }
    P('position', 'fixed');
    P('right', 'auto');
    P('top', 'auto');
    P('visibility', 'visible');
    P('opacity', '0');
    P('pointer-events', 'none');
    P('display', 'grid');
    var r = ctl.getBoundingClientRect();
    var barBox = document.getElementById('bottom-bar');
    var barTop = barBox ? barBox.getBoundingClientRect().top : window.innerHeight;
    var w = pop.offsetWidth || 226;
    var h = pop.offsetHeight || 150;
    var left = Math.round(r.left + r.width / 2 - w / 2);
    left = Math.max(8, Math.min(Math.max(8, window.innerWidth - w - 8), left));
    var bottom = Math.max(8, Math.round(window.innerHeight - Math.min(r.top, barTop) + 8));
    P('left', left + 'px');
    P('bottom', bottom + 'px');
    P('transform', 'none');
    P('z-index', '9600');
    P('opacity', '1');
    P('pointer-events', 'auto');
  }

  function hidePopover(pop) {
    if (!pop) return;
    var P = function (k, v) { try { pop.style.setProperty(k, v, 'important'); } catch (e) { } };
    P('opacity', '0');
    P('visibility', 'hidden');
    P('pointer-events', 'none');
  }

  function hidePopovers() {
    hidePopover(document.getElementById('lyric-timing-popover'));
    var vp = document.querySelector('.volume-popover');
    hidePopover(vp);
  }

  /* ---- §9 弹层：播放页 4UI 里的「音量」「词」是同一套开关逻辑，
     v78 合并为一个实现（原来两份逐行重复 + 6 个 document 捕获监听）。 ---- */
  var popoverCache = null;
  function popoverRefs() {
    if (!popoverCache) popoverCache = {
      volCtl: document.querySelector('#mr-player-extras #volume-control'),
      volPop: document.querySelector('.volume-popover'),
      lyrCtl: document.querySelector('#mr-player-extras .lyric-timing-control'),
      lyrPop: document.getElementById('lyric-timing-popover')
    };
    return popoverCache;
  }
  function resetPopoverCache() { popoverCache = null; }

  function closePopover(ctl, pop) {
    if (ctl) { ctl.__mrPopOpen = false; ctl.classList.remove('mr-open'); }
    hidePopover(pop);
    window.setTimeout(function () { if (ctl && !ctl.__mrPopOpen) hidePopover(pop); }, 80);
  }

  function togglePopover(ctl, pop) {
    var openNow = !ctl.__mrPopOpen;
    ctl.__mrPopOpen = openNow;
    ctl.classList.toggle('mr-open', openNow);
    if (openNow) placePopover(ctl, pop);
    else closePopover(ctl, pop);
  }

  /* fy: 宿主可能在自己的 pointerdown/touchstart 里就把弹层打开，捕获阶段先掐断 */
  function bindPlayerPopovers() {
    if (window.__mrPopoversBound) return;
    window.__mrPopoversBound = 1;
    ['pointerdown', 'touchstart', 'mousedown'].forEach(function (t) {
      document.addEventListener(t, function (ev) {
        var hit = ev.target && ev.target.closest ? ev.target.closest('#volume-btn,#lyrics-toggle-btn') : null;
        if (hit) ev.stopPropagation();
      }, true);
    });
    document.addEventListener('click', function (ev) {
      var refs = popoverRefs();
      var t = ev.target;
      var isVol = t && t.closest ? t.closest('#volume-btn') : null;
      if (isVol && refs.volCtl && refs.volPop) {
        ev.stopPropagation();
        try { ev.preventDefault(); } catch (e) { }
        togglePopover(refs.volCtl, refs.volPop);
        return;
      }
      var isLyr = t && t.closest ? t.closest('#lyrics-toggle-btn') : null;
      if (isLyr && refs.lyrCtl && refs.lyrPop) {
        ev.stopPropagation();
        try { ev.preventDefault(); } catch (e) { }
        togglePopover(refs.lyrCtl, refs.lyrPop);
        return;
      }
      /* 点其它地方：把已展开的弹层收起 */
      if (refs.volCtl && refs.volCtl.__mrPopOpen && !(t && t.closest && t.closest('.volume-popover'))) closePopover(refs.volCtl, refs.volPop);
      if (refs.lyrCtl && refs.lyrCtl.__mrPopOpen && !(t && t.closest && t.closest('#lyric-timing-popover'))) closePopover(refs.lyrCtl, refs.lyrPop);
    }, true);
  }

  /* 登录页内联兜底：保证留边、圆角、可滚动，不顶边框 */
  /* 播放页：把音源/提示条压到顶部歌曲信息下面，避免重叠 */
  /* 提示条：一出现就压到顶部歌曲信息下面，关闭时清掉内联。
     v78：节点引用缓存一次（原来每 500ms 4 次 getElementById），由 500ms 调度器驱动。 */
  var noticeRefs = { stack: null, notice: null };
  var noticePinnedTop = -1;
  function noticeEls() {
    var r = noticeRefs;
    /* 关键：#source-fallback-stack 是宿主第一次弹提示时才创建并 append 到 body 的，
       不能缓存 null 到永久（v78 的 bug：首个 500ms tick 时它还不存在 -> 之后永远拿不到）。 */
    if (!r.stack || !r.stack.isConnected) r.stack = document.getElementById('source-fallback-stack');
    if (!r.notice || !r.notice.isConnected) r.notice = document.getElementById('source-fallback-notice');
    return r;
  }
  function noticeTopY() {
    var track = document.querySelector('.mr-top-track');
    if (track) {
      var b = track.getBoundingClientRect();
      if (b && b.bottom > 0) return Math.round(b.bottom + 8);
    }
    return 126;
  }
  function pinNotice(el, top) {
    var S = function (k, v) { try { el.style.setProperty(k, v, 'important'); } catch (e) { } };
    S('position', 'fixed');
    S('top', top + 'px');
    S('left', '12px');
    S('right', '12px');
    S('width', 'auto');
    S('z-index', '9600');
    el.__mrPos = 1;
    el.__mrTop = top;
  }
  function unpinNotice(el) {
    if (!el.__mrPos) return;
    el.__mrPos = 0;
    el.__mrTop = -1;
    ['position', 'top', 'left', 'right', 'width', 'z-index'].forEach(function (k) { try { el.style.removeProperty(k); } catch (e) { } });
  }
  function noticeWatch() {
    var refs = noticeEls();
    var top = noticeTopY();
    var stack = refs.stack;
    if (stack) {
      if (stack.children.length > 0) { if (!stack.__mrPos || stack.__mrTop !== top) pinNotice(stack, top); }
      else unpinNotice(stack);
    }
    var n = refs.notice;
    if (n) {
      if (n.classList.contains('show')) { if (!n.__mrPos || n.__mrTop !== top) pinNotice(n, top); }
      else unpinNotice(n);
    }
  }
  function patchFallbackNotice() {
    if (window.__mrFallbackNoticePatched) return true;
    if (typeof window.showSourceFallbackNotice !== 'function') return false;
    window.__mrFallbackNoticePatched = 1;
    var raw = window.showSourceFallbackNotice;
    window.showSourceFallbackNotice = function () {
      var r = raw.apply(this, arguments);
      try { requestAnimationFrame(function () { try { noticeWatch(); } catch (e) { } }); } catch (e) { try { noticeWatch(); } catch (e2) { } }
      return r;
    };
    return true;
  }


  function styleLoginModal() {
    var lm = document.getElementById('login-modal');
    if (!lm) return;
    if (!lm.classList.contains('show')) { lm.__mrStyled = 0; return; }
    /* v78：原来每 2.5s 重写 19 条内联 !important；改成每次「打开」只应用一次 */
    if (lm.__mrStyled) return;
    lm.__mrStyled = 1;
    var S = function (el, k, v) { try { el.style.setProperty(k, v, 'important'); } catch (e) { } };
    S(lm, 'padding', 'calc(14px + env(safe-area-inset-top,0px)) 12px calc(20px + env(safe-area-inset-bottom,0px))');
    S(lm, 'align-items', 'center');
    S(lm, 'justify-content', 'center');
    var m = lm.querySelector('.dual-login-modal');
    if (!m) return;
    S(m, 'position', 'relative');
    S(m, 'inset', 'auto');
    S(m, 'width', '100%');
    S(m, 'max-width', '420px');
    S(m, 'max-height', '100%');
    S(m, 'height', 'auto');
    S(m, 'margin', '0 auto');
    S(m, 'box-sizing', 'border-box');
    S(m, 'border-radius', '20px');
    S(m, 'overflow-y', 'auto');
    S(m, 'overflow-x', 'hidden');
    var head = m.querySelector('.login-panel-head');
    if (head) {
      S(head, 'position', 'sticky');
      S(head, 'top', '0');
      S(head, 'padding', '12px 14px');
      S(head, 'border-radius', '20px 20px 0 0');
    }
    var graph = m.querySelector('.login-node-graph');
    if (graph) { S(graph, 'padding', '12px 8px 8px'); }
  }

  /* v62：删除 ensureBarVisible() / styleBottomBar() 的运行时内联 !important 写入。
     原因：内联 !important 的优先级高于样式表 !important，一次写入就会把之后所有
     transform/opacity 动画的目标值钉死（滑入滑出退化成瞬切，且造成二次弹跳）。
     底栏外观（半透明、无 backdrop-filter、圆角、边框）改由 phone.css 里的静态规则提供；
     宿主显隐状态机在 patchHostHooks() 里被旁路（setControlsHidden/scheduleControlsHide = no-op），
     phone.css 里另有高特异性 guard 覆盖 soft-hidden/controls-hidden/home-controls-locked。 */

  function layoutPhoneBar() {
    var tr = document.querySelector('#bottom-bar #controls > .control-cluster.transport');
    if (!tr) return;
    var order = ['play-mode-btn', 'heart-btn', 'prev-btn', 'play-btn', 'next-btn', 'cuefield-automix-btn', 'mini-queue-btn'];
    var cur = [].map.call(tr.children, function (c) { return c.id; }).join(',');
    if (cur !== order.join(',')) {
      order.forEach(function (id) {
        var e = document.getElementById(id);
        if (e) { try { tr.appendChild(e); } catch (err) { } }
      });
    }
    var collects = document.getElementById('collect-btn');
    if (collects && collects.style.display !== 'none') collects.style.setProperty('display', 'none', 'important');
  }

  var chromeMoreEl = null;
  function syncChromeAvatar() {
    var more = chromeMoreEl || (chromeMoreEl = document.getElementById('phone-chrome-more'));
    if (!more) { chromeMoreEl = null; return; }
    var ub = document.getElementById('user-btn');
    var img = ub ? ub.querySelector('.top-account-pill img') : null;
    var src = img && img.src ? img.src : '';
    if (src && src.indexOf('data:image/svg') !== 0) {
      if (more.getAttribute('data-avatar-src') !== src) {
        more.setAttribute('data-avatar-src', src);
        more.innerHTML = '<img class="phone-chrome-avatar" alt="" src="' + src.replace(/"/g, '&quot;') + '">';
      }
    } else if (more.getAttribute('data-avatar-src')) {
      more.removeAttribute('data-avatar-src');
      more.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"></circle><circle cx="12" cy="12" r="1.7"></circle><circle cx="19" cy="12" r="1.7"></circle></svg>';
    }
  }

  /* v62：播放页 class 由状态机（pageState）唯一决定，不再从 empty-home-active 反推，
     也不再按状态搬 .actions 的 DOM（搬运只发生在 lift/drop 的转场函数里）。 */
  function updatePlayerPage() {
    if (isBusy()) return;
    ensureStructure();
    var isPlayer = pageState === 'player';
    try { document.body.classList.toggle('mr-player-page', isPlayer); } catch (e) { }
    if (isPlayer) { if (!trackDocked) liftTrackImmediate(); }
    else if (trackDocked) { dockTrackImmediate(); }
    ensureShellState();
    updateProgressTimes();
  }

  function openPlaylistPanel() {
    var panel = document.getElementById('playlist-panel');
    if (!panel) return;
    window.__mrAllowPlOpen = 1;
    window.setTimeout(function () { window.__mrAllowPlOpen = 0; }, 700);
    try { setPeek(panel, true, 'pl'); } catch (e) { try { togglePlaylistPanel(); } catch (e2) { } }
  }

  function enhancePlaylistPanel() {
    var head = document.querySelector('#playlist-panel .queue-head-act');
    if (head && !document.getElementById('mr-panel-close')) {
      var btn = document.createElement('button');
      btn.id = 'mr-panel-close';
      btn.type = 'button';
      btn.className = 'fx-mini-btn ghost';
      btn.setAttribute('aria-label', '关闭歌单');
      btn.textContent = '✕';
      btn.addEventListener('click', function (e) { e.stopPropagation(); closePlaylistPanel(); });
      head.appendChild(btn);
    }
    var panel = document.getElementById('playlist-panel');
    var swipeHost = panel ? panel.querySelector('.playlist-panel-sticky') : null;
    if (swipeHost && !swipeHost.__mrSwipeClose) {
      swipeHost.__mrSwipeClose = true;
      var sy = 0, sx = 0, tracking = false;
      swipeHost.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        sy = e.touches[0].clientY; sx = e.touches[0].clientX; tracking = true;
      }, { passive: true });
      swipeHost.addEventListener('touchend', function (e) {
        if (!tracking) return;
        tracking = false;
        var t = e.changedTouches[0];
        if (!t) return;
        if (t.clientY - sy > 70 && Math.abs(t.clientX - sx) < 60) closePlaylistPanel();
      }, { passive: true });
    }
  }

  /* ---- 返回键：先关浮层，不直接退出 App ---- */
  function closeTopOverlay() {
    if (isBusy()) {
      commitInstant(pageState === 'to-player' ? 'player' : 'home');
      return true;
    }
    /* v75：先关最上层浮层，再退播放页（否则搜索/歌单盖在播放页上，按返回像没反应） */
    if (diyPanelOpen()) { setDiyPanel(false); return true; }
    var guide = document.getElementById('visual-guide');
    if (guide && guide.classList.contains('show')) { try { closeVisualGuide(true); } catch (e) { } return true; }
    var sa = document.getElementById('search-area');
    if (sa && sa.classList.contains('has-results')) {
      try { clearSearchResults(); } catch (e) { }
      try { setPeek(sa, false, 'search'); } catch (e) { }
      return true;
    }
    var panel = document.getElementById('playlist-panel');
    if (panel && (panel.classList.contains('show') || panel.classList.contains('peek'))) { closePlaylistPanel(); return true; }
    var login = document.getElementById('login-modal');
    if (login && login.classList.contains('show')) { try { closeLoginModal(); } catch (e) { } return true; }
    var fx = document.getElementById('fx-panel');
    if (fx && (fx.classList.contains('show') || fx.classList.contains('peek'))) { try { setPeek(fx, false, 'fx'); } catch (e) { } return true; }
    /* 播放页：返回键回首页 */
    if (pageState === 'player' || document.body.classList.contains('mr-player-page')) {
      exitPlayerPage();
      return true;
    }
    if (document.body.classList.contains('splash-active')) return true;
    /* 首页（无浮层）按返回：消费掉，不要落到宿主分支（goHome 是开关语义会 dismiss 首页） */
    if (pageState === 'home') return true;
    return false;
  }

  function registerBackButton() {
    var C = window.Capacitor;
    var plugin = C && C.Plugins && C.Plugins.FoliaNative;
    if (!plugin || !plugin.addListener || window.__mrBackRegistered) return;
    window.__mrBackRegistered = 1;
    try {
      plugin.addListener('backButton', function () {
        if (closeTopOverlay()) return;
        // 首页：返回键不再退出 App（避免误触退出）
        try { if (typeof goHome === 'function') goHome(); } catch (e) { }
      });
    } catch (e) { }
  }

  /* ---- 双指缩放：复刻桌面滚轮（缩放 3D 场景 / 歌词背景） ---- */
  function registerPinchZoom() {
    if (window.__mrPinchZoom) return;
    window.__mrPinchZoom = 1;
    var startDist = 0, startRadius = 0, active = false;
    function touchDist(t) {
      var dx = t[0].clientX - t[1].clientX;
      var dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy) || 1;
    }
    window.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 2) return;
      var o = window.orbit;
      if (!o) return;
      active = true;
      startDist = touchDist(e.touches);
      startRadius = (typeof o.userRadius === 'number' ? o.userRadius : o.radius) || 6.6;
    }, { capture: true, passive: true });
    window.addEventListener('touchmove', function (e) {
      if (!active || e.touches.length < 2) return;
      var o = window.orbit;
      if (!o) return;
      var ratio = touchDist(e.touches) / startDist;
      if (!isFinite(ratio) || ratio <= 0) return;
      var r = startRadius / ratio;
      var minR = o.minRadius || 2.4, maxR = o.maxRadius || 14;
      r = Math.max(minR, Math.min(maxR, r));
      o.userRadius = r;
      o.radius = r;
      if (o.centerLocked || o.recentering) {
        try {
          if (typeof window.unlockCenteredView === 'function') window.unlockCenteredView();
          else o.centerLocked = false;
        } catch (e) { }
        o.recentering = false;
      }
      e.preventDefault();
    }, { capture: true, passive: false });
    window.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) active = false;
    }, { capture: true, passive: true });
    window.addEventListener('touchcancel', function () { active = false; }, { capture: true, passive: true });
  }

  /* ---- §14 入口 ---- */
  ready(function () {
    window.__mrStructDirty = 1;
    ensureClasses();
    buildChrome();
    initDiyConsole();
    startStructureObserver();
    startBarHeightWatch();
    bindPanelKeyboardFit();
    ensureStructure();
    patchHostHooks();
    startWatchdog();
    forceViewport();
    registerBackButton();
    registerPinchZoom();
    reorderProgressBar();
    layoutPlayerExtrasPos();
    enhancePlaylistPanel();
    patchPeek();
    syncChromeAvatar();
    ensureShellState();
    updatePlayerPage();
    layoutPhoneBar();
    styleLoginModal();
    bindTrackEnter();
    bindHostNavTriggers();
    bindStageGuard();
    bindDiyTap();
    bindFab(document.getElementById('fx-fab'));
    bindStageDrag();
    patchPlaylistEdgeTrigger();
    bindPlayerPopovers();
    patchApiCache();
    patchHomeToast();
    tuneRendererOnce();
    tuneAudioFade();
    // 等应用主体初始化后再补一次：宿主会重写 body.className / 重建 #controls 子节点
    window.setTimeout(function () {
      window.__mrStructDirty = 1;
      ensureClasses();
      ensureStructure();
      patchHostHooks();
      ensureShellState();
    }, 1200);
    window.setTimeout(function () {
      window.__mrStructDirty = 1;
      ensureStructure();
      patchHostHooks();
      try { hideFab(); } catch (e) { }
    }, 3000);
  });

  window.MrPhoneShell = {
    enterPlayerPage: enterPlayerPage,
    exitPlayerPage: exitPlayerPage,
    enable: function () {
      window.__mrStructDirty = 1;
      ensureClasses();
      initDiyConsole();
      startStructureObserver();
      startBarHeightWatch();
      ensureStructure();
      patchHostHooks();
      startWatchdog();
      forceViewport();
      registerBackButton();
      registerPinchZoom();
      reorderProgressBar();
      enhancePlaylistPanel();
      patchPeek();
      syncChromeAvatar();
      updatePlayerPage();
      layoutPhoneBar();
      bindFab(document.getElementById('fx-fab'));
    },
    toggleMenu: toggleMenu,
    forceViewport: forceViewport
  };
})(window, document);
