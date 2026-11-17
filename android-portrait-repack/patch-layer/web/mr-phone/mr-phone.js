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

  /* 开屏/路由切换时宿主会整体重写 html/body 的 class。
     注意：不能用 MutationObserver —— 宿主在开屏动画里会逐帧重写 class，
     监听后立刻补类会和宿主来回拉锯，把渲染进程 CPU 打满（实测 109%）。
     改用低频轮询，只在缺失时补一次。 */
  function startClassWatch() {
    if (window.__mrPhoneClassWatch) return;
    window.__mrPhoneClassWatch = window.setInterval(function () {
      if (document.body.classList.contains('mr-player-entering') || document.body.classList.contains('mr-return-home')) return;
      ensureClasses();
      hideFab();
      reorderProgressBar();
      enhancePlaylistPanel();
      patchPeek();
      syncChromeAvatar();
      layoutPhoneBar();
    styleBottomBar();
    ensureBarVisible();
      styleLoginModal();
      updatePlayerPage();
      layoutPlayerExtras();
    }, 2000);
  }


  /* 宿主会把 DIY 浮动按钮重新显示出来（会压住卡片），这里用内联 important 兜底 */
  function hideFab() {
    var f = document.getElementById('fx-fab');
    if (!f) return;
    if (document.body.classList.contains('splash-active')) {
      try { f.style.setProperty('display', 'none', 'important'); } catch (e) { }
      f.__mrPosKey = '';
      return;
    }
    var bar = document.getElementById('bottom-bar');
    var barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight - 100;
    var key = Math.round(barTop) + '|' + document.body.classList.contains('mr-player-page');
    if (f.__mrPosKey === key && f.style.display === 'flex') return;
    f.__mrPosKey = key;
    var S = function (k, v) { try { f.style.setProperty(k, v, 'important'); } catch (e) { } };
    S('display', 'flex');
    S('visibility', 'visible');
    S('opacity', '1');
    S('position', 'fixed');
    S('right', '12px');
    var extra = document.body.classList.contains('mr-player-page') ? 86 : 12;
    S('bottom', (window.innerHeight - barTop + extra) + 'px');
    S('z-index', '8550');
    S('width', '44px');
    S('height', '44px');
  }

  function gotoHome() {
    if (typeof window.goHome === 'function') { window.goHome(); return; }
    var btn = document.getElementById('home-btn');
    if (btn) btn.click();
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

  function bindStageGuard() {
    if (window.__mrStageGuardBound) return;
    window.__mrStageGuardBound = 1;
    function isStageTarget(target) {
      if (!target || !target.closest) return false;
      return !!target.closest('#canvas-container, canvas, #idle-guide-canvas');
    }
    ['click', 'dblclick'].forEach(function (type) {
      document.addEventListener(type, function (ev) {
        if (!document.body.classList.contains('mr-player-page')) return;
        if (ev.touches && ev.touches.length > 1) return;
        if (!isStageTarget(ev.target)) return;
        ev.stopPropagation();
        if (type === 'click' || type === 'dblclick') ev.preventDefault();
        if (type === 'pointerdown') { try { window.__mrStageTapAt = performance.now(); } catch (e) { } }
      }, true);
    });
  }

  function bindTrackEnter() {
    if (window.__mrTrackEnterBound) return;
    window.__mrTrackEnterBound = 1;
    document.addEventListener('click', function (ev) {
      var bar = document.getElementById('bottom-bar');
      if (!bar || !bar.contains(ev.target)) return;
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

      // DIY 浮层（手机上浮动按钮被隐藏，改从菜单进）
      var diyBtn = document.createElement('button');
      diyBtn.type = 'button';
      diyBtn.className = 'phone-chrome-action';
      diyBtn.textContent = 'DIY';
      diyBtn.addEventListener('click', function () {
        toggleMenu(false);
        try { if (typeof window.toggleDiyMode === 'function') window.toggleDiyMode(); } catch (e) { }
      });
      actions.appendChild(diyBtn);

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
  function reorderProgressBar() {
    var controls = document.getElementById('controls');
    var prog = document.getElementById('progress-bar');
    if (!controls || !prog) return;
    var transport = controls.querySelector('.control-cluster.transport');
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

  /* 播放页判定：没有 empty-home-active 且不在开屏 */
  function enterPlayerPage() {
    window.__mrForcePlayer = true;
    try { document.body.classList.remove('mr-return-home', 'mr-just-home'); } catch (e) { }
    try { document.body.classList.add('mr-player-entering'); } catch (e) { }
    var home = document.getElementById('empty-home');
    if (home) {
      home.style.removeProperty('opacity');
      home.style.removeProperty('pointer-events');
    }
    window.setTimeout(function () {
      try { document.body.classList.remove('mr-player-entering'); } catch (e) { }
      try { if (typeof setImmersiveMode === 'function') setImmersiveMode(true); } catch (e) { }
      updatePlayerPage();
      try { if (typeof hideFab === 'function') hideFab(); } catch (e) { }
    }, 260);
  }

  function exitPlayerPage() {
    try { document.body.classList.add('mr-return-home'); } catch (e) { }
    var home = document.getElementById('empty-home');
    if (home) {
      home.style.removeProperty('opacity');
      home.style.removeProperty('pointer-events');
    }
    window.setTimeout(function () {
      window.__mrForcePlayer = false;
      try { document.body.classList.remove('mr-return-home'); } catch (e) { }
      try { if (typeof setImmersiveMode === 'function') setImmersiveMode(false); } catch (e) { }
      updatePlayerPage();
      try { if (typeof hideFab === 'function') hideFab(); } catch (e) { }
      try { document.body.classList.add('mr-just-home'); } catch (e) { }
      window.setTimeout(function () { try { document.body.classList.remove('mr-just-home'); } catch (e) { } }, 460);
      try { if (typeof goHome === 'function') goHome(); } catch (e) { }
      window.setTimeout(function () {
        var h = document.getElementById('empty-home');
        if (h && parseFloat(getComputedStyle(h).opacity) < 0.35) {
          try { document.body.classList.add('empty-home-active'); } catch (e) { }
          h.style.setProperty('opacity', '1', 'important');
          h.style.setProperty('pointer-events', 'auto', 'important');
          window.setTimeout(function () {
            try {
              h.style.removeProperty('opacity');
              h.style.removeProperty('pointer-events');
            } catch (e) { }
          }, 1200);
        }
        updatePlayerPage();
      }, 360);
    }, 320);
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

  function bindVolumeTap() {
    if (window.__mrVolumeTap) return;
    window.__mrVolumeTap = 1;
    document.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('#volume-btn') : null;
      var ctl = document.querySelector('#mr-player-extras #volume-control');
      if (btn && ctl) {
        ev.stopPropagation();
        ev.preventDefault();
        ctl.classList.toggle('mr-open');
        return;
      }
      if (ctl && !(ev.target.closest && ev.target.closest('.volume-popover'))) ctl.classList.remove('mr-open');
    }, true);
  }

  function bindLyricTimingTap() {
    if (window.__mrLyricTimingTap) return;
    window.__mrLyricTimingTap = 1;
    document.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('#lyrics-toggle-btn') : null;
      var ctl = document.querySelector('#mr-player-extras .lyric-timing-control');
      if (btn && ctl) {
        var wasOpen = ctl.classList.contains('mr-open');
        if (wasOpen) ctl.classList.remove('mr-open');
        else ctl.classList.add('mr-open');
        return;
      }
      if (ctl && !(ev.target.closest && ev.target.closest('#lyric-timing-popover'))) {
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

  /* 底栏半透明：内联强制定制（宿主有多层渐变规则） */
  /* 兜底：首页底栏如果被动画/宿主状态卡成隐藏，强制恢复可见 */
  function ensureBarVisible() {
    if (document.body.classList.contains('mr-player-page') || document.body.classList.contains('mr-player-entering')) return;
    var bar = document.getElementById('bottom-bar');
    if (!bar) return;
    try {
      var anims = bar.getAnimations ? bar.getAnimations() : [];
      if (anims.length) return;
      var cs = getComputedStyle(bar);
      var op = parseFloat(cs.opacity);
      if (op < 0.85 || cs.transform !== 'none') {
        bar.style.setProperty('opacity', '1', 'important');
        bar.style.setProperty('transform', 'none', 'important');
        bar.style.setProperty('visibility', 'visible', 'important');
      }
    } catch (e) { }
  }

  function styleBottomBar() {
    var bar = document.getElementById('bottom-bar');
    if (!bar) return;
    var alpha = document.body.classList.contains('mr-player-page') ? '0.58' : '0.62';
    var S = function (k, v) { try { bar.style.setProperty(k, v, 'important'); } catch (e) { } };
    S('background', 'rgba(8,14,16,' + alpha + ')');
    S('background-image', 'none');
    S('backdrop-filter', 'none');
    S('-webkit-backdrop-filter', 'none');
    S('border', '1px solid rgba(255,255,255,.10)');
    S('box-shadow', '0 10px 30px rgba(0,0,0,.26)');
  }

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

  /* 播放页：把「词/音量/控制条/沉浸」搬到播放条上方；进度条两侧加时间 */
  function layoutPlayerExtras() {
    var bar = document.getElementById('bottom-bar');
    if (!bar) return;
    var extras = document.getElementById('mr-player-extras');
    if (!extras) {
      extras = document.createElement('div');
      extras.id = 'mr-player-extras';
      document.body.appendChild(extras);
    }
    var modes = document.querySelector('#bottom-bar #controls > .control-cluster.modes');
    var isPlayer = document.body.classList.contains('mr-player-page');
    if (isPlayer) {
      if (modes && modes.parentElement !== extras) { try { extras.appendChild(modes); } catch (e) { } }
      var r = bar.getBoundingClientRect();
      extras.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    } else if (modes && modes.parentElement === extras) {
      var controls = document.getElementById('controls');
      if (controls) { try { controls.appendChild(modes); } catch (e) { } }
    }
    var td = document.getElementById('time-display');
    if (td) td.style.setProperty('display', 'none', 'important');
    var prog = document.getElementById('progress-bar');
    var row = document.getElementById('mr-progress-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'mr-progress-row';
      row.innerHTML = '<span id="mr-time-cur">0:00</span><span id="mr-time-dur">0:00</span>';
      var p0 = prog;
      if (p0 && p0.parentElement) {
        var cur = row.querySelector('#mr-time-cur');
        var dur = row.querySelector('#mr-time-dur');
        p0.parentElement.insertBefore(row, p0);
        row.insertBefore(cur, row.firstChild);
        row.appendChild(p0);
        row.appendChild(dur);
      }
    } else if (prog && prog.parentElement !== row) {
      var cur2 = row.querySelector('#mr-time-cur');
      var dur2 = row.querySelector('#mr-time-dur');
      if (prog.parentElement && cur2 && dur2) {
        prog.parentElement.insertBefore(row, prog);
        row.insertBefore(cur2, row.firstChild);
        row.appendChild(prog);
        row.appendChild(dur2);
      }
    }
    var a = window.audio;
    var cEl = document.getElementById('mr-time-cur');
    var dEl = document.getElementById('mr-time-dur');
    if (a && cEl && dEl) {
      var fmt = function (x) { if (!isFinite(x) || x < 0) x = 0; var m = Math.floor(x / 60), s = Math.floor(x % 60); return m + ':' + (s < 10 ? '0' : '') + s; };
      cEl.textContent = fmt(a.currentTime);
      dEl.textContent = fmt(a.duration);
    }
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

  function updatePlayerPage() {
    if (document.body.classList.contains('mr-return-home')) return;
    var b = document.body;
    if (!b) return;
    var isPlayer = !b.classList.contains('empty-home-active') && !b.classList.contains('splash-active');
    if (window.__mrForcePlayer) isPlayer = true;
    var homeEl = document.getElementById('empty-home');
    if (homeEl && isPlayer) {
      try {
        homeEl.style.removeProperty('opacity');
        homeEl.style.removeProperty('pointer-events');
      } catch (e) { }
    }
    b.classList.toggle('mr-player-page', isPlayer);
    try { if (typeof hideFab === 'function') hideFab(); } catch (e) { }
    var actions = document.querySelector('#bottom-bar #controls > .control-cluster.actions');
    if (isPlayer) {
      if (actions && actions.parentElement !== b) {
        b.appendChild(actions);
      }
      if (actions) actions.classList.add('mr-top-track');
    } else {
      var top = document.querySelector('body > .control-cluster.actions.mr-top-track');
      if (!top) top = actions && actions.classList.contains('mr-top-track') ? actions : null;
      if (top) {
        var controls = document.getElementById('controls');
        if (controls) {
          var transport = controls.querySelector('.control-cluster.transport');
          controls.insertBefore(top, transport || null);
        }
        top.classList.remove('mr-top-track');
      }
    }
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
        // 播放页：返回键回首页（用 App 自己的 goHome）
    if (document.body.classList.contains('mr-player-page')) {
      exitPlayerPage();
      return true;
    }
    var guide = document.getElementById('visual-guide');
    if (guide && guide.classList.contains('show')) { try { closeVisualGuide(true); } catch (e) { } return true; }
    var panel = document.getElementById('playlist-panel');
    if (panel && (panel.classList.contains('show') || panel.classList.contains('peek'))) { closePlaylistPanel(); return true; }
    var login = document.getElementById('login-modal');
    if (login && login.classList.contains('show')) { try { closeLoginModal(); } catch (e) { } return true; }
    var fx = document.getElementById('fx-panel');
    if (fx && (fx.classList.contains('show') || fx.classList.contains('peek'))) { try { setPeek(fx, false, 'fx'); } catch (e) { } return true; }
    var sa = document.getElementById('search-area');
    if (sa && sa.classList.contains('has-results')) {
      try { clearSearchResults(); } catch (e) { }
      try { setPeek(sa, false, 'search'); } catch (e) { }
      return true;
    }
    if (document.body.classList.contains('splash-active')) return true;
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
    startClassWatch();
    forceViewport();
    registerBackButton();
    registerPinchZoom();
    reorderProgressBar();
    enhancePlaylistPanel();
    patchPeek();
    syncChromeAvatar();
    updatePlayerPage();
    layoutPhoneBar();
    styleBottomBar();
    ensureBarVisible();
    layoutPlayerExtras();
    startNoticeWatch();
    styleLoginModal();
    bindTrackEnter();
    bindStageGuard();
    bindStageDrag();
    bindLyricTimingTap();
    bindVolumeTap();
    patchApiCache();
    patchBridgeCache();
    ensureAudioCacheEnabled();
    patchHomeToast();
    tuneRendererOnce();
    tuneAudioFade();
    bindStageDrag();
    // 等应用主体初始化后再补一次类（有些移植版会重写 body.className）
    window.setTimeout(ensureClasses, 1200);
  });

  window.MrPhoneShell = {
    enterPlayerPage: enterPlayerPage,
    exitPlayerPage: exitPlayerPage,
    enable: function () { ensureClasses(); buildChrome(); startClassWatch(); forceViewport(); registerBackButton(); registerPinchZoom(); reorderProgressBar(); enhancePlaylistPanel(); patchPeek(); syncChromeAvatar(); updatePlayerPage(); layoutPhoneBar(); layoutPlayerExtras(); },
    toggleMenu: toggleMenu,
    forceViewport: forceViewport
  };
})(window, document);
