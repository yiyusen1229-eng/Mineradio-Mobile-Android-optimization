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
 *   - mobile-shell.css / mobile-home.css / mobile-touch.css
 *     （来自 mineradio.art，GPL-3.0，需与本文件一起分发）
 *   - mr-phone-early.js（在 <head> 里先执行）
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

  /* 宿主会重写 body.class；低频轮询只补类（纯 class 操作，零测量、零内联写），
     转场期间不做任何布局动作。布局类兜底放到单独的 2.5s watchdog，且转场中直接 return。 */
  function startClassWatch() {
    if (window.__mrPhoneClassWatch) return;
    window.__mrPhoneClassWatch = window.setInterval(function () {
      try {
        ensureClasses();
        ensureShellState();
        syncChromeAvatar();
        enhancePlaylistPanel();
        patchPeek();
        patchHostHooks();
      } catch (e) { }
    }, 2000);
    startLayoutWatch();
  }

  function startLayoutWatch() {
    if (window.__mrLayoutWatch) return;
    window.__mrLayoutWatch = window.setInterval(function () {
      if (isBusy()) return;         /* 转场窗口内绝不测量/重排 */
      try {
        ensureStructure();
        layoutPlayerExtrasPos();
        reorderProgressBar();
        layoutPhoneBar();
        styleLoginModal();
        hideFab();
        updateProgressTimes();
      } catch (e) { }
    }, 2500);
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


  /* 宿主会把 DIY 浮动按钮重新显示出来（会压住卡片），这里用内联 important 兜底 */
  /* v64：DIY 不再是浮在舞台上的悬浮球，而是底栏右上角的一个按钮（首页/播放页都在这里） */
  /* v67：DIY 只负责「显示 + 挂进底栏」，位置/尺寸全部交给 CSS 变量（自适应） */
  function hideFab() {
    var f = document.getElementById('fx-fab');
    if (!f) return;
    if (document.body.classList.contains('splash-active')) {
      try { f.style.setProperty('display', 'none', 'important'); } catch (e) { }
      return;
    }
    var bar = document.getElementById('bottom-bar');
    if (!bar) return;
    if (f.parentElement !== bar) { try { bar.appendChild(f); } catch (e) { } }
    try { document.documentElement.style.setProperty('--mr-bar-h', Math.round(bar.getBoundingClientRect().height) + 'px'); } catch (e) { }
    var S = function (k, v) { try { f.style.setProperty(k, v, 'important'); } catch (e) { } };
    S('display', 'flex');
    S('visibility', 'visible');
    S('opacity', '1');
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
  function keepDiyPanelOpen() {
    if (!window.__mrDiyOpen) return;
    var panel = document.getElementById('fx-panel');
    if (!panel) return;
    if (!panel.classList.contains('peek') && !panel.classList.contains('show')) panel.classList.add('peek');
    try { panel.style.setProperty('display', 'block', 'important'); } catch (e) { }
  }

  function setDiyPanel(open) {
    var panel = document.getElementById('fx-panel');
    if (!panel) return;
    window.__mrDiyOpen = !!open;
    if (window.__mrDiyKeepTimer) { try { clearInterval(window.__mrDiyKeepTimer); } catch (e) { } window.__mrDiyKeepTimer = 0; }
    if (open) {
      window.__mrDiyKeepTimer = window.setInterval(keepDiyPanelOpen, 250);
      panel.classList.add('peek');
      try { panel.style.setProperty('display', 'block', 'important'); } catch (e) { }
      var fab = document.getElementById('fx-fab');
      if (fab) fab.classList.add('active');
    } else {
      panel.classList.remove('show', 'peek', 'pinned');
      try { panel.style.setProperty('display', 'none', 'important'); } catch (e) { }
      var fab2 = document.getElementById('fx-fab');
      if (fab2) fab2.classList.remove('active');
    }
  }

  function diyPanelOpen() {
    var panel = document.getElementById('fx-panel');
    return !!(panel && (panel.classList.contains('show') || panel.classList.contains('peek') || panel.classList.contains('pinned')));
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

  function bindDiyTap() {
    if (window.__mrDiyTap) return;
    window.__mrDiyTap = 1;
    var lastAt = 0;
    function toggleFromFab(ev) {
      var now = Date.now();
      if (now - lastAt < 450) return;
      lastAt = now;
      if (ev) { try { ev.stopPropagation(); ev.preventDefault(); } catch (e) { } }
      setDiyPanel(!diyPanelOpen());
    }
    /* 宿主在 touchstart/pointerdown 上可能 preventDefault，导致 click 不产生；
       所以直接在 DIY 元素上挂 pointerup / touchend / click 三保险（带 450ms 去重）。 */
    function bindFab(el) {
      if (!el || el.__mrDiyBound) return;
      el.__mrDiyBound = 1;
      ['pointerup', 'mouseup', 'touchend', 'click'].forEach(function (t) {
        el.addEventListener(t, function (ev) {
          if (ev.type === 'touchend' && ev.touches && ev.touches.length) return;
          toggleFromFab(ev);
        }, { passive: false });
      });
    }
    bindFab(document.getElementById('fx-fab'));
    window.setInterval(function () { bindFab(document.getElementById('fx-fab')); }, 1500);
    /* 点面板外：只关面板 */
    document.addEventListener('pointerdown', function (ev) {
      if (!diyPanelOpen()) return;
      if (ev.target.closest && ev.target.closest('#fx-panel')) return;
      if (ev.target.closest && ev.target.closest('#fx-fab')) return;
      setDiyPanel(false);
    }, true);
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
    var lastX = 0, lastY = 0, active = false;
    overlay.addEventListener('touchstart', function (ev) {
      if (!window.orbit) return;
      if (ev.touches.length === 1) {
        active = true;
        lastX = ev.touches[0].clientX;
        lastY = ev.touches[0].clientY;
      } else {
        active = false;
      }
    }, { passive: true });
    overlay.addEventListener('touchmove', function (ev) {
      if (!active || !window.orbit || ev.touches.length !== 1) return;
      var x = ev.touches[0].clientX, y = ev.touches[0].clientY;
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
    overlay.addEventListener('touchend', function () { active = false; }, { passive: true });
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

  /* v64：舞台（3D 画布 + 拖拽覆盖层）上的单击一律吞掉，不再触发宿主的相机重置/其它响应；
     双击（或 320ms 内两次点击）才回正视角。底栏、4UI、DIY 的点击不受影响。 */
  /* v65：不再拦截舞台上的单击（那会连带把拖拽旋转/宿主点击一起吃掉）。
     只保留「双击回正视角」这一个增强；旋转交给 #mr-stage-overlay 的拖拽逻辑。 */
  function bindStageGuard() {
    if (window.__mrStageGuardBound) return;
    window.__mrStageGuardBound = 1;
    function recenterCamera() {
      try {
        if (typeof window.recenterCamera === 'function') { window.recenterCamera(); return; }
        if (window.orbit) window.orbit.recentering = true;
      } catch (e) { }
    }
    document.addEventListener('dblclick', function (ev) {
      if (!document.body.classList.contains('mr-player-page')) return;
      recenterCamera();
    }, true);
  }

  function bindTrackEnter() {
    if (window.__mrTrackEnterBound) return;
    window.__mrTrackEnterBound = 1;
    document.addEventListener('click', function (ev) {
      var bar = document.getElementById('bottom-bar');
      if (!bar || !bar.contains(ev.target)) return;
      if (pageState !== 'home' || isBusy()) return;
      var home = document.getElementById('empty-home');
      var homeActive = home && parseFloat(getComputedStyle(home).opacity) > 0.35;
      if (!homeActive) return;
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

  /* ---- 底栏恒高三段结构（幂等，只用 class/属性，不做测量） ---- */
  function ensureStructure() {
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
    updateProgressTimes();
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

  function updateProgressTimes() {
    var a = window.audio;
    var cEl = document.getElementById('mr-time-cur');
    var dEl = document.getElementById('mr-time-dur');
    if (!a || !cEl || !dEl) return;
    var fmt = function (x) { if (!isFinite(x) || x < 0) x = 0; var m = Math.floor(x / 60), s = Math.floor(x % 60); return m + ':' + (s < 10 ? '0' : '') + s; };
    try { cEl.textContent = fmt(a.currentTime); dEl.textContent = fmt(a.duration); } catch (e) { }
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
  /* 确保音频缓存开启（播放过的歌第二次直接读本地） */
  function ensureAudioCacheEnabled() {
    try {
      var raw = localStorage.getItem('mineradio-audio-cache-v1');
      var data = raw ? JSON.parse(raw) : null;
      if (!data || data.enabled !== true) {
        localStorage.setItem('mineradio-audio-cache-v1', JSON.stringify({ enabled: true }));
      }
    } catch (e) { }
  }

  function patchBridgeCache() {
    if (window.__mrBridgeCache || typeof window.__mrBridgeRequest !== 'function') return;
    window.__mrBridgeCache = 1;
    var raw = window.__mrBridgeRequest;
    var TTL = 30 * 60 * 1000;
    window.__mrBridgeRequest = function (opts) {
      if (!opts || String(opts.method || 'GET').toUpperCase() !== 'GET' || opts.binary) return raw(opts);
      var url = opts.url || '';
      var cacheable = /(playlist|user\/playlists|cloudlist|shelf|daily|recommend|hot|listen)/i.test(url) && !/(cover|img|image|avatar|lyric)/i.test(url);
      if (!cacheable) return raw(opts);
      var key = 'mr-bridge-cache:' + url;
      try {
        var rec = JSON.parse(localStorage.getItem(key) || 'null');
        if (rec && Date.now() - rec.t < TTL && typeof rec.body === 'string') {
          return Promise.resolve({ status: rec.status, headers: rec.headers || {}, body: rec.body });
        }
      } catch (e) { }
      return raw(opts).then(function (ans) {
        try {
          var body = ans && ans.body;
          if (typeof body === 'string' && body.length < 2 * 1024 * 1024) {
            localStorage.setItem(key, JSON.stringify({ t: Date.now(), status: ans.status, headers: ans.headers || {}, body: body }));
          }
        } catch (e) { }
        return ans;
      });
    };
  }

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

  function bindInstantPause() {
    if (window.__mrInstantPause) return;
    window.__mrInstantPause = 1;
    document.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('#play-btn') : null;
      if (!b) return;
      var a = window.audio;
      if (a && !a.paused) {
        ev.stopPropagation();
        ev.preventDefault();
        try { a.pause(); } catch (e) { }
      }
    }, true);
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
    var barEl = document.getElementById('bottom-bar');
    var barTop = barEl ? barEl.getBoundingClientRect().top : window.innerHeight;
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

  function bindVolumeTap() {
    if (window.__mrVolumeTap) return;
    window.__mrVolumeTap = 1;
    ['pointerdown', 'touchstart', 'mousedown'].forEach(function (t) {
      document.addEventListener(t, function (ev) {
        var hit = ev.target && ev.target.closest ? ev.target.closest('#volume-btn') : null;
        if (hit) ev.stopPropagation();
      }, true);
    });
    document.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('#volume-btn') : null;
      var ctl = document.querySelector('#mr-player-extras #volume-control');
      if (btn && ctl) {
        ev.stopPropagation();
        ev.preventDefault();
        var vp = document.querySelector('.volume-popover');
        var openNow = !ctl.__mrPopOpen;
        ctl.__mrPopOpen = openNow;
        ctl.classList.toggle('mr-open', openNow);
        if (openNow) placePopover(ctl, vp);
        else {
          hidePopover(vp);
          window.setTimeout(function () { if (!ctl.__mrPopOpen) hidePopover(vp); }, 80);
        }
        return;
      }
      if (ctl && !(ev.target.closest && ev.target.closest('.volume-popover'))) {
        ctl.__mrPopOpen = false;
        hidePopover(document.querySelector('.volume-popover'));
        ctl.classList.remove('mr-open');
      }
    }, true);
  }

  function bindLyricTimingTap() {
    if (window.__mrLyricTimingTap) return;
    window.__mrLyricTimingTap = 1;
    /* 宿主可能在自己的 pointerdown/touchstart 里就把弹层打开，这里先掐断 */
    ['pointerdown', 'touchstart', 'mousedown'].forEach(function (t) {
      document.addEventListener(t, function (ev) {
        var hit = ev.target && ev.target.closest ? ev.target.closest('#lyrics-toggle-btn') : null;
        if (hit) ev.stopPropagation();
      }, true);
    });
    document.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('#lyrics-toggle-btn') : null;
      var ctl = document.querySelector('#mr-player-extras .lyric-timing-control');
      if (btn && ctl) {
        ev.stopPropagation();
        try { ev.preventDefault(); } catch (e) { }
        var pop = document.getElementById('lyric-timing-popover');
        var openNow = !ctl.__mrPopOpen;
        ctl.__mrPopOpen = openNow;
        if (openNow) {
          ctl.classList.add('mr-open');
          placePopover(ctl, pop);
        } else {
          ctl.classList.remove('mr-open');
          hidePopover(pop);
          window.setTimeout(function () { if (!ctl.__mrPopOpen) hidePopover(pop); }, 80);
        }
        return;
      }
      if (ctl && !(ev.target.closest && ev.target.closest('.lyric-timing-popover'))) {
        ctl.__mrPopOpen = false;
        hidePopover(document.getElementById('lyric-timing-popover'));
        ctl.classList.remove('mr-open');
      }
    }, true);
  }

  /* 登录页内联兜底：保证留边、圆角、可滚动，不顶边框 */
  /* 播放页：把音源/提示条压到顶部歌曲信息下面，避免重叠 */
  /* 300ms 守护：提示条一出现就压到顶部歌曲信息下面，关闭时清掉内联 */
  function startNoticeWatch() {
    if (window.__mrNoticeWatch) return;
    window.__mrNoticeWatch = window.setInterval(function () {
      var stack = document.getElementById('source-fallback-stack');
      if (stack) {
        var hasCards = stack.children.length > 0;
        if (hasCards && !stack.__mrPos) {
          stack.__mrPos = 1;
          try {
            var track2 = document.querySelector('.mr-top-track');
            var top2 = 126;
            if (track2) top2 = Math.round(track2.getBoundingClientRect().bottom + 8);
            var S2 = function (k, v) { stack.style.setProperty(k, v, 'important'); };
            S2('position', 'fixed');
            S2('top', top2 + 'px');
            S2('left', '12px');
            S2('right', '12px');
            S2('width', 'auto');
            S2('z-index', '9600');
          } catch (e2) { }
        } else if (!hasCards && stack.__mrPos) {
          stack.__mrPos = 0;
          ['position', 'top', 'left', 'right', 'width', 'z-index'].forEach(function (k) { try { stack.style.removeProperty(k); } catch (e3) { } });
        }
      }
      var n = document.getElementById('source-fallback-notice');
      if (!n) return;
      var shown = n.classList.contains('show');
      if (shown && !n.__mrNoticePos) {
        n.__mrNoticePos = 1;
        try {
          var track = document.querySelector('.mr-top-track');
          var topY = 126;
          if (track) topY = Math.round(track.getBoundingClientRect().bottom + 8);
          var S = function (k, v) { n.style.setProperty(k, v, 'important'); };
          S('position', 'fixed');
          S('top', topY + 'px');
          S('left', '12px');
          S('right', '12px');
          S('width', 'auto');
          S('z-index', '9600');
        } catch (e) { }
      } else if (!shown && n.__mrNoticePos) {
        n.__mrNoticePos = 0;
        ['position', 'top', 'left', 'right', 'width', 'z-index'].forEach(function (k) { try { n.style.removeProperty(k); } catch (e) { } });
      }
    }, 500);
  }

  function styleLoginModal() {
    var lm = document.getElementById('login-modal');
    if (!lm || !lm.classList.contains('show')) return;
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
    if (collects) collects.style.setProperty('display', 'none', 'important');
  }

  /* 播放页顶部槽位（词/音效/沉浸/音量）在 v62 里永久放在 #bottom-bar 内的
     #mr-player-extras 中，绝对覆盖顶部槽位，不再按状态搬 DOM、也不再测量底栏 rect。
     这里保留函数名兼容旧调用点。 */
  function layoutPlayerExtras() {
    ensureStructure();
  }

  function syncChromeAvatar() {
    var more = document.getElementById('phone-chrome-more');
    if (!more) return;
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
      if (o.recentering) o.recentering = false;
      e.preventDefault();
    }, { capture: true, passive: false });
    window.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) active = false;
    }, { capture: true, passive: true });
    window.addEventListener('touchcancel', function () { active = false; }, { capture: true, passive: true });
  }

  ready(function () {
    ensureClasses();
    buildChrome();
    initDiyConsole();
    ensureStructure();
    patchHostHooks();
    startClassWatch();
    forceViewport();
    registerBackButton();
    registerPinchZoom();
    reorderProgressBar();
    enhancePlaylistPanel();
    patchPeek();
    syncChromeAvatar();
    ensureShellState();
    updatePlayerPage();
    layoutPhoneBar();
    startNoticeWatch();
    styleLoginModal();
    bindTrackEnter();
    bindHostNavTriggers();
    bindStageGuard();
    bindDiyTap();
    bindStageDrag();
    bindLyricTimingTap();
    bindVolumeTap();
    patchApiCache();
    patchBridgeCache();
    ensureAudioCacheEnabled();
    patchHomeToast();
    tuneRendererOnce();
    tuneAudioFade();
    // 等应用主体初始化后再补一次：宿主会重写 body.className / 重建 #controls 子节点
    window.setTimeout(function () {
      ensureClasses();
      ensureStructure();
      patchHostHooks();
      ensureShellState();
    }, 1200);
    window.setTimeout(function () {
      ensureStructure();
      patchHostHooks();
      try { hideFab(); } catch (e) { }
    }, 3000);
  });

  window.MrPhoneShell = {
    enterPlayerPage: enterPlayerPage,
    exitPlayerPage: exitPlayerPage,
    enable: function () { ensureClasses(); initDiyConsole(); ensureStructure(); patchHostHooks(); bindHostNavTriggers(); startClassWatch(); forceViewport(); registerBackButton(); registerPinchZoom(); reorderProgressBar(); enhancePlaylistPanel(); patchPeek(); syncChromeAvatar(); updatePlayerPage(); layoutPhoneBar(); },
    toggleMenu: toggleMenu,
    forceViewport: forceViewport
  };
})(window, document);
