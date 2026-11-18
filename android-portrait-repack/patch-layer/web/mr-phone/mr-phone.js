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

  /* ===== v84：localStorage 配额保护（修「主页 MP4 保存失败」）=====
     宿主把网络缓存都放 localStorage：实测 5.24MB 上限里 mr-api-cache 就占 3.97MB。
     选 MP4 时视频 blob 已经写进 IndexedDB，但紧随其后写几百字节的 meta 反而失败（QuotaExceeded），
     宿主 catch 后提示「主页 MP4 保存失败」。
     处理：① 启动 / 配额报错时清掉纯网络缓存；② setItem 先清缓存再重试；③ 仍失败落内存兜底，getItem 能读回。 */
  var MR_LS_PRUNE_KEYS = /^(mr-api-cache:|mr-bridge-cache:|mr_chrome_storage__beatmap:)/;
  var mrLsFallback = Object.create(null);

  function mrLsTotalSize() {
    var total = 0;
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var k = localStorage.key(i);
        if (!k) continue;
        total += k.length + (localStorage.getItem(k) || '').length;
      }
    } catch (e) { return 0; }
    return total;
  }

  function mrPruneLocalStorageCaches(force) {
    var removed = 0;
    try {
      var total = mrLsTotalSize();
      if (!force && total < 3.6 * 1024 * 1024) return 0;
      var keys = [];
      for (var i = 0; i < localStorage.length; i += 1) { var k = localStorage.key(i); if (k) keys.push(k); }
      for (var j = 0; j < keys.length; j += 1) {
        if (!MR_LS_PRUNE_KEYS.test(keys[j])) continue;
        try { localStorage.removeItem(keys[j]); removed += 1; } catch (e) { }
      }
      if (removed) {
        try { window.__mrLsPruned = (window.__mrLsPruned || 0) + removed; } catch (e) { }
      }
    } catch (e) { }
    return removed;
  }

  function installLocalStorageGuard() {
    if (window.__mrLsGuard) return;
    window.__mrLsGuard = 1;
    try {
      var proto = window.Storage && Storage.prototype;
      if (!proto || !proto.setItem) return;
      var rawSet = proto.setItem;
      var rawGet = proto.getItem;
      var rawRemove = proto.removeItem;
      proto.setItem = function (key, value) {
        try {
          return rawSet.call(this, key, value);
        } catch (error) {
          var quota = error && /quota/i.test(((error.name || "") + " " + (error.message || "")));
          if (!quota) throw error;
          mrPruneLocalStorageCaches(true);
          try {
            return rawSet.call(this, key, value);
          } catch (again) {
            mrLsFallback[String(key)] = String(value);
            return undefined;
          }
        }
      };
      proto.getItem = function (key) {
        var value = rawGet.call(this, key);
        if (value === null) {
          var fallbackKey = String(key);
          if (Object.prototype.hasOwnProperty.call(mrLsFallback, fallbackKey)) return mrLsFallback[fallbackKey];
        }
        return value;
      };
      proto.removeItem = function (key) {
        try { delete mrLsFallback[String(key)]; } catch (e) { }
        return rawRemove.call(this, key);
      };
    } catch (e) { }
  }

  /* ===== v87：歌单面板滚动闪烁 =====
     宿主虚拟列表在滚动时每帧重设 #pl-list.innerHTML（卡片、封面 <img> 全部重建）→ 一直闪。
     这里改成「一次性全量渲染」：渲染时强制窗口覆盖所有卡片与详情行，之后不再随滚动重建。
     列表规模最多几百首，全量 DOM 静置比每帧重建更稳，也不会再闪。 */
  function installPlaylistFullRender() {
    if (window.__mrPlFullInstalled) return true;
    if (typeof window.renderUserPlaylistsList !== 'function') return false;
    if (typeof window.playlistPanelOffsetIndex !== 'function') return false;
    window.__mrPlFullInstalled = 1;
    window.__mrPlFullMode = 1;

    var rawRender = window.renderUserPlaylistsList;
    var rawIdx = window.playlistPanelOffsetIndex;
    var rawRows = window.playlistPanelDetailRowsHtml;
    var rawSchedule = window.schedulePlaylistPanelVirtualRender;

    /* 渲染期间：让可见区间 = 全部条目（第一次 = 起点 0，第二次 = 末尾） */
    window.playlistPanelOffsetIndex = function (offsets, value) {
      if (window.__mrPlRendering) {
        window.__mrPlIdxCalls = (window.__mrPlIdxCalls || 0) + 1;
        if (window.__mrPlIdxCalls <= 1) return 0;
        return Math.max(0, (offsets && offsets.length ? offsets.length - 2 : 0));
      }
      return rawIdx.apply(this, arguments);
    };

    window.renderUserPlaylistsList = function () {
      window.__mrPlRendering = 1;
      window.__mrPlIdxCalls = 0;
      try {
        return rawRender.apply(this, arguments);
      } finally {
        window.__mrPlRendering = 0;
        window.__mrPlIdxCalls = 0;
      }
    };

    /* 详情行也全量渲染（原来按滚动窗口只渲染十几行） */
    window.playlistPanelDetailRowsHtml = function (options) {
      if (typeof rawRows !== 'function') return '';
      try {
        var opts = Object.assign({}, options || {});
        opts.scrollTop = 0;
        opts.viewport = 1000000;
        return rawRows(opts);
      } catch (e) {
        return rawRows.apply(this, arguments);
      }
    };

    /* 滚动时不再触发虚拟重建 */
    window.schedulePlaylistPanelVirtualRender = function () {
      if (window.__mrPlFullMode) return;
      return rawSchedule.apply(this, arguments);
    };

    /* v89：当前队列面板同样是「每帧重建 #queue-list.innerHTML」→ 滑动一直闪。
       一并改成全量渲染 + 滚动不重建。 */
    if (!window.__mrQueueFullInstalled && typeof window.renderQueuePanel === 'function') {
      window.__mrQueueFullInstalled = 1;
      window.__mrQueueFull = 1;
      var rawQueueRender = window.renderQueuePanel;
      var rawQueueWin = window.queuePanelVirtualWindow;
      var rawQueueSched = window.scheduleQueuePanelVirtualRender;
      if (typeof rawQueueWin === 'function') {
        window.queuePanelVirtualWindow = function (scroller, panelScroller, total) {
          if (window.__mrQueueRendering) {
            var n = Math.max(0, Number(total) || 0);
            return { start: 0, end: n, top: 0, bottom: 0 };
          }
          return rawQueueWin.apply(this, arguments);
        };
      }
      window.renderQueuePanel = function () {
        window.__mrQueueRendering = 1;
        try {
          return rawQueueRender.apply(this, arguments);
        } finally {
          window.__mrQueueRendering = 0;
        }
      };
      if (typeof rawQueueSched === 'function') {
        window.scheduleQueuePanelVirtualRender = function () {
          if (window.__mrQueueFull) return;
          return rawQueueSched.apply(this, arguments);
        };
      }
    }
    return true;
  }

  /* ===== v86：/api GET 响应缓存（内存 + IndexedDB）=====
     宿主每次打开歌单都会重新拉 /api/user/playlists；旧手机层的 localStorage 缓存已在 v78 清掉。
     这里补一个不占 localStorage 配额的缓存：内存命中即时返回，IndexedDB 持久化（TTL 20 分钟）。
     注意：宿主的 runtime-log 模块会在手机层之后替换 window.fetch，所以安装函数要可重复调用，
     看门狗发现 fetch 被换掉时重新包到最外层。

     v88 增补（性能）：
       - 缓存键归一化（剥掉 ?t= 时间戳等易变参数）；
       - 各平台 status / login-status 接口内存缓存 5 分钟，登录/登出自动失效；
       - song/url 解析结果内存缓存 10 分钟（同一首重播秒开）；
       - 搜索接口 4.5s 硬超时，超时返回空结果，先渲染其它平台。 */
  function installApiFetchCache() {
    if (typeof window.fetch !== 'function') return false;
    var state = window.__mrApiCacheState;
    if (!state) {
      state = {
        ttl: 20 * 60 * 1000,
        dbName: 'mr-api-cache-v2',
        store: 'kv',
        mem: Object.create(null),
        dbPromise: null,
        wrapped: null,
        statusMem: Object.create(null),
        urlMem: Object.create(null)
      };
      window.__mrApiCacheState = state;
      window.__mrApiCacheInstalled = 1;
    }
    if (window.fetch === state.wrapped) return true;

    var STATUS_TTL = 10 * 60 * 1000;
    var SONG_URL_TTL = 10 * 60 * 1000;
    var SEARCH_TIMEOUT = 12000;
    if (!isFinite(SEARCH_TIMEOUT) || SEARCH_TIMEOUT < 2000) SEARCH_TIMEOUT = 12000;

    function ensureDb() {
      if (state.dbPromise) return state.dbPromise;
      state.dbPromise = new Promise(function (resolve) {
        var settled = false;
        function done(db) { if (settled) return; settled = true; resolve(db); }
        function create(ver) {
          var req;
          try { req = indexedDB.open(state.dbName, ver); } catch (e) { state.dbPromise = null; done(null); return; }
          req.onupgradeneeded = function () {
            try { if (!req.result.objectStoreNames.contains(state.store)) req.result.createObjectStore(state.store, { keyPath: 'k' }); } catch (e) { }
          };
          req.onsuccess = function () {
            var db = req.result;
            if (db.objectStoreNames.contains(state.store)) { done(db); return; }
            var current = db.version;
            try { db.close(); } catch (e) { }
            if (ver > current + 1) {
              try {
                var del = indexedDB.deleteDatabase(state.dbName);
                del.onsuccess = del.onerror = del.onblocked = function () { create(1); };
              } catch (e) { state.dbPromise = null; done(null); }
              return;
            }
            create(ver + 1);
          };
          req.onerror = function () { state.dbPromise = null; done(null); };
          req.onblocked = function () { state.dbPromise = null; done(null); };
        }
        create(1);
      });
      return state.dbPromise;
    }
    function dbGet(db, key) {
      return new Promise(function (resolve) {
        try {
          var rq = db.transaction(state.store, 'readonly').objectStore(state.store).get(key);
          rq.onsuccess = function () { resolve(rq.result || null); };
          rq.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }
    function dbPut(db, rec) {
      try { db.transaction(state.store, 'readwrite').objectStore(state.store).put(rec); } catch (e) { }
    }
    function makeJsonResponse(data) {
      try {
        return new Response(JSON.stringify(data), { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-MR-Cache': '1' } });
      } catch (e) { return null; }
    }
    function emptySearchPayload() {
      return { ok: false, error: 'MR_SEARCH_TIMEOUT', songs: [], result: { songs: [] }, playlists: [], tracks: [], data: { lists: [], songs: [], info: [] }, list: [] };
    }
    function fetchUrl(input) {
      try { return typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) { return ''; }
    }
    /* 去掉时间戳类易变参数，否则每次 key 都不同 → 缓存永远不命中 */
    function normalizeCacheKey(url) {
      try {
        var u = new URL(url, location.href);
        var drop = ['t', '_', '_t', 'ts', 'timestamp', 'cachebuster', 'rnd', 'random'];
        drop.forEach(function (k) { if (u.searchParams.has(k)) u.searchParams.delete(k); });
        return u.href;
      } catch (e) { return url; }
    }
    function classify(url) {
      if (/\/status(\?|$)|\/login\/status/.test(url)) return 'status';
      if (/\/song\/url(\?|$)/.test(url)) return 'songurl';
      if (/\/search(\?|$)|\/cloudsearch\/pc/.test(url)) return 'search';
      return 'other';
    }
    function clearAuthStatus() {
      try {
        Object.keys(state.statusMem).forEach(function (k) {
          if (/\/status|login/.test(k)) delete state.statusMem[k];
        });
      } catch (e) { }
    }
    function cacheable(url, init) {
      try {
        if ((((init && init.method) || 'GET').toUpperCase()) !== 'GET') return false;
        try { url = new URL(url, location.href).href; } catch (e) { return false; }
        if (url.indexOf(location.origin) !== 0) return false;
        if (!/\/api\//.test(url)) return false;
        if (/\.(mp3|m4a|flac|ape|wav|jpg|jpeg|png|webp|gif|mp4|bin|ttf|woff2?|zip)(\?|$)/i.test(url)) return false;
        if (/[?&](stream|binary|raw)=/i.test(url)) return false;
        if (/\/(cover|image|img|avatar|stream|audio)\//i.test(url)) return false;
        return true;
      } catch (e) { return false; }
    }
    var rawFetch = window.fetch;
    var wrapped = function (input, init) {
      var absUrl;
      try { absUrl = new URL(fetchUrl(input), location.href).href; } catch (e) { return rawFetch.apply(window, arguments); }
      if (!cacheable(absUrl, init)) return rawFetch.apply(window, arguments);
      var key = normalizeCacheKey(absUrl);
      var kind = classify(absUrl);
      var now = Date.now();
      var self = this;

      function isSentinelPayload(d) {
        try { return !!(d && (d.error === 'MR_SEARCH_TIMEOUT' || d.__mrTimeout)); } catch (e) { return false; }
      }

      if (kind === 'status') {
        var st = state.statusMem[key];
        if (st && now - st.t < STATUS_TTL) {
          var stResp = makeJsonResponse(st.d);
          if (stResp) return Promise.resolve(stResp);
        }
      } else if (kind === 'songurl') {
        var su = state.urlMem[key];
        if (su && now - su.t < SONG_URL_TTL) {
          var suResp = makeJsonResponse(su.d);
          if (suResp) return Promise.resolve(suResp);
        }
      }
      /* 登录 / 登出：清掉状态缓存，避免刚登录仍显示未登录 */
      if (/\/login\/|\/logout/.test(absUrl)) clearAuthStatus();

      function storeResult(data) {
        try {
          if (kind === 'status') state.statusMem[key] = { t: Date.now(), d: data };
          else if (kind === 'songurl') state.urlMem[key] = { t: Date.now(), d: data };
        } catch (e) { }
      }

      return (async function () {
        var hit = state.mem[key];
        if (hit && isSentinelPayload(hit.d)) { delete state.mem[key]; hit = null; }
        if (hit && now - hit.t < state.ttl) {
          storeResult(hit.d);
          var cachedResp = makeJsonResponse(hit.d);
          if (cachedResp) { try { mrNetRec(kind, key, 0, true); } catch (e) { } return cachedResp; }
        }
        /* v95-C1：like/check 全部已知 → 本地合成 */
        if (kind === 'other' && /like\/check|\/like\b/.test(absUrl)) {
          try {
            var synth = mrLikeSynthesize(absUrl);
            if (synth) {
              mrNetStat.likeSkip += 1;
              mrNetRec('like', absUrl, 0, true);
              var sr = makeJsonResponse(synth);
              if (sr) return sr;
            }
          } catch (e) { }
        }
        /* v95-C2：正在起播时把歌词请求压到出声之后 */
        if (kind === 'lyric' || /\/lyric/.test(absUrl)) {
          try {
            if (mrPlayPending.at) { mrNetStat.lyricDeferred += 1; await mrWaitPlayStarted(2500); }
          } catch (e) { }
        }
        if (!hit) {
          var db0 = await ensureDb();
          if (db0) {
            var rec = await dbGet(db0, key);
            if (rec && isSentinelPayload(rec.d)) { rec = null; }
          if (rec && rec.t && Date.now() - rec.t < state.ttl) {
              state.mem[key] = { t: rec.t, d: rec.d };
              storeResult(rec.d);
              var resp1 = makeJsonResponse(rec.d);
              if (resp1) return resp1;
            }
          }
        }

        var fetchPromise = rawFetch.call(self, input, init);
        var res;
        if (kind === 'search') {
          /* 搜索：硬超时，先让其它平台出结果，不让最慢的平台拖整页 */
          res = await Promise.race([
            fetchPromise.catch(function (e) { return { __mrErr: e }; }),
            new Promise(function (resolve) { setTimeout(function () { resolve({ __mrTimeout: 1 }); }, SEARCH_TIMEOUT); })
          ]);
          if (res && res.__mrTimeout) return makeJsonResponse(emptySearchPayload());
          if (res && res.__mrErr) throw res.__mrErr;
        } else {
          res = await fetchPromise;
        }
        try {
          var __mrNetT0b = performance.now();
          if (res && res.ok) {
            var clone = res.clone();
            clone.json().then(function (data) {
              try { mrNetRec(kind, key, performance.now() - __mrNetT0b, false); } catch (e) { }
              if (kind === 'other' && /like\/check|\/like\b/.test(absUrl)) mrLikeRememberFromResponse(data);
              if (isSentinelPayload(data)) return;
              var item = { t: Date.now(), d: data };
              state.mem[key] = item;
              storeResult(data);
              ensureDb().then(function (db2) {
                if (!db2) return;
                dbPut(db2, { k: key, t: item.t, d: item.d });
                try {
                  var all = db2.transaction(state.store, 'readonly').objectStore(state.store).getAll();
                  all.onsuccess = function () {
                    var rows = all.result || [];
                    if (rows.length <= 400) return;
                    rows.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
                    var tx = db2.transaction(state.store, 'readwrite');
                    rows.slice(0, rows.length - 400).forEach(function (row) { try { tx.objectStore(state.store).delete(row.k); } catch (e) { } });
                  };
                } catch (e) { }
              });
            }).catch(function () { });
          }
        } catch (e) { }
        return res;
      })();
    };
    state.wrapped = wrapped;
    window.fetch = wrapped;

    /* 后台预热各平台登录状态：这些接口实测 4~27s，等用户操作再去查会把搜索/播放拖慢 */
    if (!state.warmTimer) {
      /* 实测原生桥请求会排队，后台预热反而挤占用户操作；改成不预热，靠 status 缓存同样能覆盖重复操作 */
      state.warmTimer = -1;
      if (false) window.setTimeout(function () {
        var urls = [
          '/api/kugou/login/status',
          '/api/qq/login/status',
          '/api/qishui/status',
          '/api/bodian/status',
          '/api/ytm/status',
          '/api/login/status'
        ];
        var stamp = Date.now();
        urls.forEach(function (u, i) {
          window.setTimeout(function () {
            try { wrapped(u + '?t=' + (stamp + i), { method: 'GET' }).catch(function () { }); } catch (e) { }
          }, i * 120);
        });
      }, 1500);
    }
    return true;
  }

  function mrLocalStorageBoot() {
    installLocalStorageGuard();
    try { mrPruneLocalStorageCaches(false); } catch (e) { }
  }

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
      try { patchFallbackNotice(); patchPlaylistEdgeTrigger(); patchLyricOnlineSearch(); } catch (e) { }
    } catch (e) { }
  }


  /* ===== v92：首页板块支持静态图片（与 MP4 二选一，存 IndexedDB 持久化） =====
     宿主自带「选择 MP4」：只接受 .mp4，把 blob 存进 DB mineradio-home-dashboard-video-v1/media。
     这里复用同一个 DB 存一张图（id 用 home-hero-image），并在 .home-hero 里插 <img>。 */
  var MR_HOME_IMG_DB = 'mineradio-home-dashboard-video-v1';
  var MR_HOME_IMG_STORE = 'media';
  var MR_HOME_IMG_BLOB_ID = 'home-hero-image';
  var MR_HOME_IMG_META_KEY = 'mr-home-hero-image-v1';
  var MR_HOME_IMG_MAX_BYTES = 24 * 1024 * 1024;
  var MR_HOME_IMG_MAX_SIDE = 2048;
  var mrHomeImgDbPromise = null;
  var mrHomeImgObjectUrl = '';

  function mrHomeImgOpenDb() {
    if (mrHomeImgDbPromise) return mrHomeImgDbPromise;
    mrHomeImgDbPromise = new Promise(function (resolve) {
      var req;
      try { req = indexedDB.open(MR_HOME_IMG_DB, 1); } catch (e) { resolve(null); return; }
      req.onupgradeneeded = function () {
        try {
          if (!req.result.objectStoreNames.contains(MR_HOME_IMG_STORE)) req.result.createObjectStore(MR_HOME_IMG_STORE, { keyPath: 'id' });
        } catch (e) { }
      };
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { mrHomeImgDbPromise = null; resolve(null); };
      req.onblocked = function () { mrHomeImgDbPromise = null; resolve(null); };
    });
    return mrHomeImgDbPromise;
  }

  function mrHomeImgMeta() {
    try {
      var m = JSON.parse(localStorage.getItem(MR_HOME_IMG_META_KEY) || 'null');
      if (!m || m.version !== 1 || !m.name) return null;
      return m;
    } catch (e) { return null; }
  }

  function mrHomeImgWriteMeta(meta) {
    try {
      if (meta) localStorage.setItem(MR_HOME_IMG_META_KEY, JSON.stringify(meta));
      else localStorage.removeItem(MR_HOME_IMG_META_KEY);
      return true;
    } catch (e) { return false; }
  }

  async function mrHomeImgPutBlob(blob, meta) {
    var db = await mrHomeImgOpenDb();
    if (!db) throw new Error('HOME_IMAGE_DB_UNAVAILABLE');
    await new Promise(function (resolve, reject) {
      var tx = db.transaction(MR_HOME_IMG_STORE, 'readwrite');
      tx.objectStore(MR_HOME_IMG_STORE).put({ id: MR_HOME_IMG_BLOB_ID, blob: blob, meta: meta });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = tx.onabort = function () { reject(tx.error || new Error('HOME_IMAGE_SAVE_FAILED')); };
    });
  }

  async function mrHomeImgGetBlob() {
    var db = await mrHomeImgOpenDb();
    if (!db) return null;
    return await new Promise(function (resolve) {
      try {
        var rq = db.transaction(MR_HOME_IMG_STORE, 'readonly').objectStore(MR_HOME_IMG_STORE).get(MR_HOME_IMG_BLOB_ID);
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  async function mrHomeImgDeleteBlob() {
    var db = await mrHomeImgOpenDb();
    if (!db) return;
    await new Promise(function (resolve) {
      try {
        var tx = db.transaction(MR_HOME_IMG_STORE, 'readwrite');
        tx.objectStore(MR_HOME_IMG_STORE).delete(MR_HOME_IMG_BLOB_ID);
        tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  }

  function mrHomeImgNotify(msg) {
    try { if (typeof window.homeDashboardNotify === 'function') { window.homeDashboardNotify(msg); return; } } catch (e) { }
    try { console.log('[HomeImage]', msg); } catch (e) { }
  }

  function mrHomeImgDetach() {
    try {
      var img = document.querySelector('#empty-home .mr-home-hero-image');
      if (img) img.remove();
    } catch (e) { }
    if (mrHomeImgObjectUrl) {
      try { URL.revokeObjectURL(mrHomeImgObjectUrl); } catch (e) { }
      mrHomeImgObjectUrl = '';
    }
  }

  async function mrHomeImgAttach() {
    var hero = document.querySelector('#empty-home .home-hero');
    if (!hero) return;
    var meta = mrHomeImgMeta();
    if (!meta) { mrHomeImgDetach(); return; }
    var existing = hero.querySelector('.mr-home-hero-image');
    if (existing && existing.getAttribute('src')) return;
    var rec = await mrHomeImgGetBlob();
    if (!rec || !rec.blob) return;
    if (mrHomeImgObjectUrl) { try { URL.revokeObjectURL(mrHomeImgObjectUrl); } catch (e) { } }
    mrHomeImgObjectUrl = URL.createObjectURL(rec.blob);
    var card = hero.querySelector('.daily-review-card') || hero;
    var img = document.createElement('img');
    img.className = 'mr-home-hero-image';
    img.setAttribute('aria-hidden', 'true');
    img.alt = '';
    img.src = mrHomeImgObjectUrl;
    if (existing) existing.remove();
    card.insertBefore(img, card.firstChild);
  }

  /* 图片压缩：限制最长边 2048，统一转 JPEG（透明图铺黑底） */
  function mrHomeImgEncode(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || 0;
          var h = img.naturalHeight || 0;
          if (!w || !h) { URL.revokeObjectURL(url); reject(new Error('BAD_IMAGE')); return; }
          var scale = Math.min(1, MR_HOME_IMG_MAX_SIDE / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#050608';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          URL.revokeObjectURL(url);
          canvas.toBlob(function (blob) {
            if (blob) resolve({ blob: blob, width: cw, height: ch });
            else reject(new Error('ENCODE_FAILED'));
          }, 'image/jpeg', 0.88);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('DECODE_FAILED')); };
      img.src = url;
    });
  }

  async function mrHomeImgChoose(file) {
    if (!file) return;
    if (Number(file.size) > MR_HOME_IMG_MAX_BYTES) { mrHomeImgNotify('图片不能超过 24 MB'); return; }
    try {
      var encoded = await mrHomeImgEncode(file);
      var meta = {
        version: 1,
        name: String(file.name || 'home-image'),
        type: 'image/jpeg',
        size: encoded.blob.size || 0,
        width: encoded.width,
        height: encoded.height,
        savedAt: Date.now()
      };
      await mrHomeImgPutBlob(encoded.blob, meta);
      mrHomeImgWriteMeta(meta);
      /* 与 MP4 二选一：清掉宿主的视频 */
      try { if (typeof window.homeDashboardReleaseVideoSource === 'function') window.homeDashboardReleaseVideoSource(true); } catch (e) { }
      try { localStorage.removeItem('mineradio-home-dashboard-video-meta-v1'); } catch (e) { }
      try { if (typeof window.homeDashboardDeleteVideoBlob === 'function') window.homeDashboardDeleteVideoBlob().catch(function () { }); } catch (e) { }
      var v = document.querySelector('#empty-home .home-dashboard-video');
      if (v) v.remove();
      mrHomeImgDetach();
      await mrHomeImgAttach();
      try { if (typeof window.homeDashboardRenderVideoActions === 'function') window.homeDashboardRenderVideoActions(); } catch (e) { }
      mrHomeImgNotify('首页背景图已保存');
    } catch (e) {
      console.warn('[HomeImageSave]', e);
      mrHomeImgNotify('首页背景图保存失败');
    }
  }

  async function mrHomeImgClear() {
    mrHomeImgWriteMeta(null);
    mrHomeImgDetach();
    try { await mrHomeImgDeleteBlob(); } catch (e) { }
    try { if (typeof window.homeDashboardRenderVideoActions === 'function') window.homeDashboardRenderVideoActions(); } catch (e) { }
    mrHomeImgNotify('已恢复首页默认动画');
  }

  function patchHomeHeroMedia() {
    if (window.__mrHomeHeroMediaPatched) return true;
    if (typeof window.handleHomeDashboardVideoFile !== 'function') return false;
    window.__mrHomeHeroMediaPatched = 1;

    var rawHandle = window.handleHomeDashboardVideoFile;
    window.handleHomeDashboardVideoFile = function (file) {
      try {
        var type = String((file && file.type) || '').toLowerCase();
        var name = String((file && file.name) || '');
        if (/^image\//.test(type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(name)) return mrHomeImgChoose(file);
      } catch (e) { }
      /* 选视频时清掉图片，保持二选一 */
      try { if (mrHomeImgMeta()) { mrHomeImgWriteMeta(null); mrHomeImgDetach(); mrHomeImgDeleteBlob().catch(function () { }); } } catch (e) { }
      return rawHandle.apply(this, arguments);
    };

    if (typeof window.homeDashboardRenderVideoActions === 'function') {
      var rawActions = window.homeDashboardRenderVideoActions;
      window.homeDashboardRenderVideoActions = function () {
        var r = rawActions.apply(this, arguments);
        try {
          var hasImage = !!mrHomeImgMeta();
          var choose = document.getElementById('home-dashboard-video-choose');
          var clear = document.getElementById('home-dashboard-video-clear');
          if (hasImage) {
            if (choose) choose.textContent = '更换背景图';
            if (clear) { clear.hidden = false; clear.textContent = '移除背景图'; }
          } else {
            if (clear && !clear.hidden) clear.textContent = '移除视频';
          }
        } catch (e) { }
        return r;
      };
    }

    if (typeof window.renderHomeDashboardHero === 'function') {
      var rawHero = window.renderHomeDashboardHero;
      window.renderHomeDashboardHero = function () {
        var r = rawHero.apply(this, arguments);
        try {
          var input = document.getElementById('home-dashboard-video-input');
          if (input) input.setAttribute('accept', '.mp4,video/mp4,image/jpeg,image/png,image/webp,image/gif');
          mrHomeImgAttach();
        } catch (e) { }
        return r;
      };
    }

    if (typeof window.clearHomeDashboardVideo === 'function') {
      var rawClear = window.clearHomeDashboardVideo;
      window.clearHomeDashboardVideo = function () {
        if (mrHomeImgMeta()) return mrHomeImgClear();
        return rawClear.apply(this, arguments);
      };
    }
    return true;
  }


  /* ===== v94：网络优化（预热 / 酷狗优先渐进搜索 / 下一首预解析） ===== */
  var MR_SEARCH_PAGE_LIMITS = { netease: 18, qq: 12, kugou: 12, qishui: 12, bodian: 12, ytm: 10, spotify: 10 };
  var mrWarmDone = 0;
  var mrWarmLastAt = 0;

  function mrNetApiJson(url, timeoutMs) {
    try {
      if (typeof window.apiJson === 'function') return window.apiJson(url, timeoutMs ? { timeoutMs: timeoutMs } : undefined);
    } catch (e) { }
    return Promise.reject(new Error('NO_API_JSON'));
  }

  function mrNetSearchTimeout(ms) {
    return new Promise(function (resolve) { window.setTimeout(function () { resolve(null); }, ms); });
  }

  function mrNetProviderPageInfo(value, limit) {
    var songs = Array.isArray(value && value.songs) ? value.songs : [];
    var offset = 0;
    var nextOffset = Number(value && value.nextOffset);
    if (!isFinite(nextOffset) || nextOffset <= offset) nextOffset = offset + songs.length;
    var hasMore = value && value.hasMore === true;
    if (value && value.hasMore == null) hasMore = songs.length >= limit;
    if (!songs.length || nextOffset <= offset) hasMore = false;
    return {
      offset: offset,
      limit: Number(value && value.limit) || limit,
      nextOffset: nextOffset,
      hasMore: hasMore,
      total: Number(value && value.total) || 0,
      failed: false
    };
  }

  /* 连接预热：只发 limit=1 的轻量搜索，目的只是让 native OkHttp 建好连接池 */
  function mrWarmConnections() {
    var now = Date.now();
    if (mrWarmDone && now - mrWarmLastAt < 10 * 60 * 1000) return;
    mrWarmDone = 1;
    mrWarmLastAt = now;
    var warm = function (url, delay) {
      window.setTimeout(function () {
        try { mrNetApiJson(url, 15000).catch(function () { }); } catch (e) { }
      }, delay);
    };
    /* 主用酷狗：先热酷狗；网易云是其它平台的兜底，排后面，避免抢连接 */
    warm('/api/kugou/search?keywords=a&limit=1&offset=0', 3200);
    warm('/api/search?keywords=a&limit=1&offset=0', 3800);
  }

  /* 后台补齐其它平台结果：并入 searchMusicRenderState 并增量 append（不重排、不闪烁） */
  function mrMergeBackgroundSearch(q, mode, key, providerPages, rest) {
    if (!rest.length) return;
    var jobs = rest.map(function (provider) {
      var limit = MR_SEARCH_PAGE_LIMITS[provider] || 12;
      var url;
      try { url = window.searchProviderUrl(provider, q, limit, 0); } catch (e) { url = ''; }
      if (!url) return Promise.resolve(null);
      return mrNetApiJson(url, 9000).then(function (value) {
        return { provider: provider, value: value || {}, limit: limit };
      }).catch(function () { return null; });
    });
    Promise.all(jobs).then(function (list) {
      var st = window.searchMusicRenderState;
      if (!st || st.key !== key) return;
      var incoming = [];
      var anyMore = false;
      list.forEach(function (item) {
        if (!item || !item.value) return;
        var songs = Array.isArray(item.value.songs) ? item.value.songs : [];
        if (songs.length) incoming = incoming.concat(songs);
        providerPages[item.provider] = mrNetProviderPageInfo(item.value, item.limit);
        if (item.value.hasMore === true) anyMore = true;
      });
      if (!incoming.length) return;
      var merged = (typeof window.mergeUniqueSearchSongPools === 'function')
        ? window.mergeUniqueSearchSongPools(st.songs || [], incoming)
        : (st.songs || []).concat(incoming);
      if (!merged || merged.length <= (st.songs || []).length) return;
      st.songs = merged;
      st.providerPages = providerPages;
      st.remoteHasMore = !!anyMore;
      try { window.playlist = merged; } catch (e) { }
      try {
        if (typeof window.appendNextSearchResults === 'function') window.appendNextSearchResults(key);
        else if (typeof window.refreshSearchLoadMoreSentinel === 'function') window.refreshSearchLoadMoreSentinel();
      } catch (e) { }
    }).catch(function () { });
  }

  function patchProgressiveSearch() {
    if (window.__mrProgressiveSearch) return true;
    if (typeof window.fetchMusicSearchResults !== 'function') return false;
    if (typeof window.searchProviderUrl !== 'function' || typeof window.activeSearchProvidersForMode !== 'function') return false;
    if (typeof window.mergeSongSearchResults !== 'function') return false;
    window.__mrProgressiveSearch = 1;
    var raw = window.fetchMusicSearchResults;
    window.fetchMusicSearchResults = async function (q, mode, previousPages) {
      try {
        if (previousPages) return raw.apply(this, arguments);
        var providers = window.activeSearchProvidersForMode(mode) || [];
        if (providers.length < 2 || providers.indexOf('kugou') < 0) return raw.apply(this, arguments);
        var limit = MR_SEARCH_PAGE_LIMITS.kugou || 12;
        var kgUrl = window.searchProviderUrl('kugou', q, limit, 0);
        var kg = await Promise.race([
          mrNetApiJson(kgUrl, 6500).then(function (value) { return { value: value || {} }; }).catch(function () { return null; }),
          mrNetSearchTimeout(6500)
        ]);
        var kgSongs = Array.isArray(kg && kg.value && kg.value.songs) ? kg.value.songs : [];
        if (!kgSongs.length) {
          /* 可能是历史空包缓存：加 cache-buster 再试一次 */
          var bust = kgUrl + (kgUrl.indexOf('?') >= 0 ? '&' : '?') + 'mrrerun=' + Date.now();
          var kg2 = await Promise.race([
            mrNetApiJson(bust, 6500).then(function (value) { return { value: value || {} }; }).catch(function () { return null; }),
            mrNetSearchTimeout(6500)
          ]);
          if (kg2 && kg2.value) { kg = kg2; kgSongs = Array.isArray(kg2.value.songs) ? kg2.value.songs : []; }
        }
        if (!kg || !kg.value) return raw.apply(this, arguments);
        if (!kgSongs.length) {
          /* 酷狗没结果：并行拿其它平台，6 秒预算，不再走 raw（raw 会等每个平台 12s） */
          var restEarly = providers.filter(function (p) { return p !== 'kugou'; });
          var early = await Promise.race([
            Promise.all(restEarly.map(function (p) {
              var lm = MR_SEARCH_PAGE_LIMITS[p] || 12;
              var u;
              try { u = window.searchProviderUrl(p, q, lm, 0); } catch (e) { u = ''; }
              if (!u) return Promise.resolve(null);
              return mrNetApiJson(u, 8000).then(function (value) { return { provider: p, value: value || {}, limit: lm }; }).catch(function () { return null; });
            })),
            mrNetSearchTimeout(6000)
          ]);
          var earlyList = Array.isArray(early) ? early : [];
          var pp = {};
          var pools = { netease: [], qq: [], kugou: [], qishui: [], spotify: [] };
          var extra = [];
          earlyList.forEach(function (item) {
            if (!item || !item.value) return;
            var ss = Array.isArray(item.value.songs) ? item.value.songs : [];
            pp[item.provider] = mrNetProviderPageInfo(item.value, item.limit);
            if (pools[item.provider]) pools[item.provider] = pools[item.provider].concat(ss);
            else extra = extra.concat(ss);
          });
          var mergedEarly = window.mergeSongSearchResults(pools.netease, pools.qq, pools.kugou, pools.qishui, pools.spotify, 60, q).concat(extra);
          return { songs: mergedEarly, providerPages: pp, hasMore: false };
        }
        var providerPages = {};
        providerPages.kugou = mrNetProviderPageInfo(kg.value, limit);
        var songs = window.mergeSongSearchResults([], [], kgSongs, [], [], 60, q);
        var result = { songs: songs, providerPages: providerPages, hasMore: false };
        try {
          mrNetStat.searchMs.push(Math.round(performance.now() - (window.__mrSearchT0 || performance.now())));
          if (mrNetStat.searchMs.length > 20) mrNetStat.searchMs.shift();
        } catch (e) { }
        var rest = providers.filter(function (p) { return p !== 'kugou'; });
        var key = '';
        try { key = window.searchResultKey(q, mode); } catch (e) { key = ''; }
        if (key && rest.length) {
          window.setTimeout(function () { mrMergeBackgroundSearch(q, mode, key, providerPages, rest); }, 60);
        }
        return result;
      } catch (e) {
        return raw.apply(this, arguments);
      }
    };
    return true;
  }

  /* 下一首预解析：复用宿主自己的解析函数 → 命中我们的 song/url 缓存 */
  var mrPrefetchState = { key: '', timer: 0 };
  function mrPrefetchNextTrack() {
    try {
      var q = window.playQueue;
      var idx = window.currentIdx;
      if (!q || !q.length || typeof idx !== 'number' || idx < 0) return;
      var next = q[idx + 1];
      if (!next || next.type === 'local' || next.source === 'local' || next.localUrl) return;
      if (typeof window.resolveAlbumGaplessPlaybackData !== 'function') return;
      var key = '';
      try {
        key = (next.hash || next.id || next.mid || '') + '|' + idx;
      } catch (e) { key = String(idx); }
      if (mrPrefetchState.key === key) return;
      mrPrefetchState.key = key;
      if (mrPrefetchState.timer) window.clearTimeout(mrPrefetchState.timer);
      mrPrefetchState.timer = window.setTimeout(function () {
        mrPrefetchState.timer = 0;
        try { window.resolveAlbumGaplessPlaybackData(next).catch(function () { }); } catch (e) { }
      }, 1800);
    } catch (e) { }
  }

  function patchNextTrackPrefetch() {
    if (window.__mrPrefetchPatched) return true;
    window.__mrPrefetchPatched = 1;
    document.addEventListener('playing', function (ev) {
      var t = ev.target;
      if (!t || t.tagName !== 'AUDIO') return;
      if (mrPrefetchState.key && mrPrefetchState.key.indexOf('|') > 0) mrPrefetchState.key = '';
      window.setTimeout(mrPrefetchNextTrack, 200);
    }, true);
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#play-btn, .control-prev, .control-next, .song-next, .queue-item')) {
        mrPrefetchState.key = '';
        window.setTimeout(mrPrefetchNextTrack, 2500);
      }
    }, true);
    return true;
  }


  /* ===== v95：网络计时（F）+ 关键路径瘦身（C） =====
     C1：like/check 合并防抖 + 按 hash 记忆（同一批 hash 再次出现直接本地合成响应）；
     C2：歌词请求在「正在起播」期间延后到真正出声之后（最多 2.5s）。
     F ：把 /api 请求耗时、搜索首条耗时、起播耗时、音频缓存状态收在一张小面板里（三点菜单→网络）。 */
  var MR_NET_KEEP = 160;
  var mrNetStat = (window.__mrNetStats = window.__mrNetStats || {
    reqs: [], searchMs: [], playMs: [], likeSkip: 0, lyricDeferred: 0
  });

  function mrNetRec(kind, url, ms, cached) {
    try {
      var list = mrNetStat.reqs;
      list.push({ k: kind, u: String(url || '').slice(0, 120), ms: Math.round(ms), c: !!cached, t: Date.now() });
      if (list.length > MR_NET_KEEP) list.splice(0, list.length - MR_NET_KEEP);
    } catch (e) { }
  }

  function mrNetKind(url) {
    if (/\/song\/url/.test(url)) return 'songurl';
    if (/\/lyric/.test(url)) return 'lyric';
    if (/like\/check|\/like\b/.test(url)) return 'like';
    if (/\/search|cloudsearch/.test(url)) return 'search';
    if (/\/status/.test(url)) return 'status';
    if (/beatmap/.test(url)) return 'beatmap';
    return 'other';
  }

  /* ---- C1：like/check 的 hash 级记忆 ---- */
  var MR_LIKE_MAP_KEY = 'mr-like-map-v1';
  var mrLikeMap = null;
  function mrLikeMapLoad() {
    if (mrLikeMap) return mrLikeMap;
    try { mrLikeMap = JSON.parse(localStorage.getItem(MR_LIKE_MAP_KEY) || '{}') || {}; } catch (e) { mrLikeMap = {}; }
    return mrLikeMap;
  }
  function mrLikeMapSave() {
    try {
      var map = mrLikeMapLoad();
      var keys = Object.keys(map);
      if (keys.length > 2500) {
        keys.slice(0, keys.length - 2500).forEach(function (k) { delete map[k]; });
      }
      localStorage.setItem(MR_LIKE_MAP_KEY, JSON.stringify(map));
    } catch (e) { }
  }

  /* 把 like/check 响应里的 liked 结果按 hash 记下来（成功后调用） */
  function mrLikeRememberFromResponse(body) {
    try {
      var liked = body && body.liked;
      if (!liked || typeof liked !== 'object') return;
      var map = mrLikeMapLoad();
      var changed = 0;
      Object.keys(liked).forEach(function (k) {
        var v = liked[k];
        var val = !!(v === true || v === 1 || v === '1' || (v && (v.liked === true || v.status === 1)));
        map[k] = val ? 1 : 0;
        changed++;
      });
      if (changed) mrLikeMapSave();
    } catch (e) { }
  }

  /* 请求里的 hash 是否全部已知 → 已知就直接本地合成响应 */
  function mrLikeSynthesize(url) {
    try {
      var m = String(url || '').match(/[?&](?:hashes|ids|hashs)=([^&]+)/);
      if (!m) return null;
      var raw = decodeURIComponent(m[1]);
      var ids = raw.split(',').map(function (x) { return String(x || '').trim().toLowerCase(); }).filter(Boolean);
      if (!ids.length) return null;
      var map = mrLikeMapLoad();
      var liked = {};
      for (var i = 0; i < ids.length; i++) {
        var v = map[ids[i]];
        if (v === undefined) return null;
        liked[ids[i]] = !!v;
      }
      return { ok: true, liked: liked, mrCache: 1 };
    } catch (e) { return null; }
  }

  /* ---- C2：正在起播时延后歌词请求 ---- */
  var mrPlayPending = { at: 0, timer: 0 };
  function mrMarkPlayPending() {
    mrPlayPending.at = Date.now();
    if (mrPlayPending.timer) window.clearTimeout(mrPlayPending.timer);
    mrPlayPending.timer = window.setTimeout(function () { mrPlayPending.at = 0; }, 4000);
  }
  function mrWaitPlayStarted(maxMs) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () { if (done) return; done = true; resolve(); };
      try {
        document.addEventListener('playing', function onP(e) {
          if (!e.target || e.target.tagName !== 'AUDIO') return;
          document.removeEventListener('playing', onP, true);
          finish();
        }, true);
      } catch (e) { }
      window.setTimeout(finish, maxMs);
    });
  }

  /* ---- C0：syncLikeStatusForSongs 合并防抖（避免一次渲染打几十个 like 请求） ---- */
  var mrLikeSyncPending = null;
  var mrLikeSyncTimer = 0;
  function patchLikeStatusSync() {
    if (window.__mrLikeSyncPatched) return true;
    if (typeof window.syncLikeStatusForSongs !== 'function') return false;
    window.__mrLikeSyncPatched = 1;
    var raw = window.syncLikeStatusForSongs;
    window.syncLikeStatusForSongs = function (songs) {
      try {
        if (Array.isArray(songs)) {
          if (!mrLikeSyncPending) mrLikeSyncPending = [];
          for (var i = 0; i < songs.length; i++) {
            var s = songs[i];
            if (s) mrLikeSyncPending.push(s);
          }
        }
        if (mrLikeSyncTimer) return;
        mrLikeSyncTimer = window.setTimeout(function () {
          mrLikeSyncTimer = 0;
          var batch = mrLikeSyncPending || [];
          mrLikeSyncPending = null;
          if (!batch.length) return;
          var seen = Object.create(null);
          var uniq = [];
          batch.forEach(function (s) {
            var key = (s && (s.hash || s.id || s.mid)) || '';
            if (key && seen[key]) return;
            if (key) seen[key] = 1;
            uniq.push(s);
          });
          if (uniq.length > 80) uniq = uniq.slice(0, 80);
          try { raw.call(window, uniq); } catch (e) { }
        }, 700);
      } catch (e) {
        try { raw.apply(window, arguments); } catch (e2) { }
      }
    };
    return true;
  }

  /* ---- 面板 UI ---- */
  var mrNetPanelEl = null;
  function mrNetPanelHtml() {
    var st = mrNetStat;
    var avg = function (arr) {
      if (!arr.length) return null;
      var sum = 0;
      for (var i = 0; i < arr.length; i++) sum += arr[i];
      return Math.round(sum / arr.length);
    };
    var lastSearch = st.searchMs.length ? st.searchMs[st.searchMs.length - 1] : null;
    var lastPlay = st.playMs.length ? st.playMs[st.playMs.length - 1] : null;
    var slow = st.reqs.slice().sort(function (a, b) { return b.ms - a.ms; }).slice(0, 8);
    var cacheHits = st.reqs.filter(function (r) { return r.c; }).length;
    var cacheInfo = 'n/a';
    try {
      if (window.mrAudioCacheStats) {
        var a = window.mrAudioCacheStats();
        cacheInfo = a.enabled ? ('开 · 命中 ' + a.hits + ' / 未命中 ' + a.misses + ' / 排队 ' + a.pending) : '关';
      }
    } catch (e) { }
    var rows = slow.map(function (r) {
      return '<div class="mr-net-row"><span class="mr-net-k">' + r.k + '</span>' +
        '<span class="mr-net-u">' + String(r.u).replace(/</g, '&lt;') + '</span>' +
        '<span class="mr-net-ms' + (r.ms > 2000 ? ' slow' : '') + '">' + r.ms + 'ms' + (r.c ? ' ·缓存' : '') + '</span></div>';
    }).join('') || '<div class="mr-net-empty">还没有请求记录</div>';
    return '' +
      '<div class="mr-net-head"><strong>网络计时</strong><span class="mr-net-close">×</span></div>' +
      '<div class="mr-net-grid">' +
      '<div><b>' + (lastSearch == null ? '—' : lastSearch + 'ms') + '</b><small>搜索首条（均 ' + (avg(st.searchMs) == null ? '—' : avg(st.searchMs) + 'ms') + '）</small></div>' +
      '<div><b>' + (lastPlay == null ? '—' : lastPlay + 'ms') + '</b><small>起播（均 ' + (avg(st.playMs) == null ? '—' : avg(st.playMs) + 'ms') + '）</small></div>' +
      '<div><b>' + cacheHits + ' / ' + st.reqs.length + '</b><small>请求缓存命中</small></div>' +
      '<div><b>' + st.likeSkip + '</b><small>like 请求省掉</small></div>' +
      '</div>' +
      '<div class="mr-net-sec">音频缓存：' + cacheInfo + '</div>' +
      '<div class="mr-net-sec">最慢请求 Top 8</div>' +
      rows +
      '<div class="mr-net-actions"><button type="button" data-mr-net-clear="1">清空</button><button type="button" data-mr-net-close="1">关闭</button></div>';
  }

  function mrNetPanelRender() {
    if (!mrNetPanelEl) return;
    mrNetPanelEl.innerHTML = mrNetPanelHtml();
  }

  function mrNetPanelToggle(force) {
    if (!mrNetPanelEl) {
      mrNetPanelEl = document.createElement('div');
      mrNetPanelEl.id = 'mr-net-panel';
      mrNetPanelEl.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t) return;
        if (t.closest('[data-mr-net-close]') || t.closest('.mr-net-close')) { mrNetPanelToggle(false); return; }
        if (t.closest('[data-mr-net-clear]')) {
          mrNetStat.reqs.length = 0; mrNetStat.searchMs.length = 0; mrNetStat.playMs.length = 0;
          mrNetStat.likeSkip = 0; mrNetStat.lyricDeferred = 0;
          mrNetPanelRender();
        }
      });
      document.body.appendChild(mrNetPanelEl);
    }
    var show = typeof force === 'boolean' ? force : mrNetPanelEl.classList.contains('mr-net-hide');
    mrNetPanelEl.classList.toggle('mr-net-hide', !show);
    if (show) mrNetPanelRender();
  }
  window.mrNetPanel = { toggle: mrNetPanelToggle, render: mrNetPanelRender };

  function patchNetStatsUi() {
    if (window.__mrNetUiPatched) return true;
    window.__mrNetUiPatched = 1;
    /* 起播计时：点播放/上一首/下一首/队列项/搜索结果 → 到真正出声 */
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#play-btn, #prev-btn, #next-btn, .queue-item, #search-results .search-result, #pl-list .pl-detail-row')) {
        mrMarkPlayPending();
        window.__mrPlayMark = performance.now();
      }
    }, true);
    document.addEventListener('playing', function (ev) {
      var t = ev.target;
      if (!t || t.tagName !== 'AUDIO') return;
      try {
        if (window.__mrPlayMark) {
          mrNetStat.playMs.push(Math.round(performance.now() - window.__mrPlayMark));
          if (mrNetStat.playMs.length > 20) mrNetStat.playMs.shift();
          window.__mrPlayMark = 0;
        }
        mrPlayPending.at = 0;
      } catch (e) { }
      if (mrNetPanelEl && !mrNetPanelEl.classList.contains('mr-net-hide')) mrNetPanelRender();
    }, true);
    window.setInterval(function () {
      if (mrNetPanelEl && !mrNetPanelEl.classList.contains('mr-net-hide')) mrNetPanelRender();
    }, 1500);
    return true;
  }


  /* ===== v96：删热键面板 / 平台推荐弹层动画 / 今日聆听卡片误触修复 ===== */

  /* ---- 1) 热键按钮与热键设置面板（手机没有键盘，面板是死重）---- */
  function mrRemoveHotkeyUi() {
    try {
      var btn = document.getElementById('hotkey-settings-btn');
      if (btn) {
        var wrap = btn.parentElement;
        try { btn.remove(); } catch (e) { btn.parentNode && btn.parentNode.removeChild(btn); }
        if (wrap && wrap.classList && wrap.classList.contains('fx-head-actions') && !wrap.children.length) {
          wrap.style.display = 'none';
        }
      }
      var modal = document.getElementById('hotkey-modal');
      if (modal) { try { modal.remove(); } catch (e) { modal.parentNode && modal.parentNode.removeChild(modal); } }
      /* 控制台搜索索引里的「热键设置」条目 */
      try {
        var reg = window.fxConsoleRegistry;
        if (Array.isArray(reg)) {
          for (var i = reg.length - 1; i >= 0; i--) {
            var entry = reg[i];
            var el = entry && entry.element;
            var byId = el && el.id === 'hotkey-settings-btn';
            var byTitle = entry && /热键/.test(String(entry.title || ''));
            if (byId || byTitle) reg.splice(i, 1);
          }
        }
      } catch (e) { }
      /* 搜索框里已经渲染出来的热键条目也清掉 */
      try {
        var list = document.querySelectorAll('#fx-console-search-results .fx-console-search-result');
        for (var k = 0; k < list.length; k++) {
          if (/热键/.test(list[k].textContent || '')) list[k].remove();
        }
      } catch (e) { }
    } catch (e) { }
  }
  function patchHotkeyRemoval() {
    if (window.__mrHotkeyRemoved) return true;
    window.__mrHotkeyRemoved = 1;
    try {
      window.openHotkeySettings = function () { /* v96：热键面板已移除 */ };
      window.closeHotkeySettings = function () { };
    } catch (e) { }
    mrRemoveHotkeyUi();
    return true;
  }

  /* ---- 2) 平台推荐 / 音乐发现 弹层动画 ---- */
  function patchPlatformPanelAnimation() {
    if (window.__mrPlatformAnimPatched) return true;
    window.__mrPlatformAnimPatched = 1;
    var mask = document.getElementById('home-platform-recommend-mask');
    if (!mask) return true;
    /* 打开动画交给 CSS（.show 触发 keyframes），这里只给关闭补 170ms 淡出 */
    if (typeof window.closeHomePlatformRecommendations === 'function') {
      var rawClose = window.closeHomePlatformRecommendations;
      window.closeHomePlatformRecommendations = function () {
        try {
          var m = document.getElementById('home-platform-recommend-mask');
          if (m && m.classList.contains('show') && !m.classList.contains('mr-panel-closing')) {
            m.classList.add('mr-panel-closing');
            window.setTimeout(function () {
              try {
                m.classList.remove('mr-panel-closing');
                rawClose.call(window);
              } catch (e) { }
            }, 170);
            return;
          }
        } catch (e) { }
        return rawClose.apply(this, arguments);
      };
    }
    return true;
  }

  /* ---- 3) 今日聆听指标卡：源 APK 里是纯展示，不该触发「点空白处离开首页」---- */
  function patchHomeBlankDismiss() {
    if (window.__mrBlankDismissPatched) return true;
    if (typeof window.isHomeBlankDismissClick !== 'function') return false;
    window.__mrBlankDismissPatched = 1;
    var raw = window.isHomeBlankDismissClick;
    window.isHomeBlankDismissClick = function (e) {
      try {
        var t = e && e.target;
        if (t && t.closest &&
            t.closest('#home-insight-dock, .home-insight-card, .home-listen-card, .home-listen-metric, ' +
              '.home-discovery-strip, .home-hero, .home-card, .home-ranking-entry, #home-today-time, #home-today-count, #home-today-artist')) {
          return false;
        }
      } catch (err) { }
      return raw.apply(this, arguments);
    };
    return true;
  }


  /* ===== v97：导入入口 / 恢复快捷卡 / 隐藏UI+全沉浸 / 搜索时暂停 ===== */

  /* ---- 恢复「隐藏UI / 全沉浸」在手机端的行为 ---- */
  var mrUiHidden = { mode: '', restore: null };
  function mrEnsureRestorePill() {
    if (mrUiHidden.restore && document.body.contains(mrUiHidden.restore)) return mrUiHidden.restore;
    var pill = document.createElement('button');
    pill.type = 'button';
    pill.id = 'mr-ui-restore';
    pill.textContent = '显示界面';
    pill.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      mrSetUiHidden('');
    });
    document.body.appendChild(pill);
    mrUiHidden.restore = pill;
    return pill;
  }
  function mrSetUiHidden(mode) {
    mrUiHidden.mode = mode || '';
    try {
      document.body.classList.toggle('mr-ui-hidden', mode === 'ui');
      document.body.classList.toggle('mr-immersive', mode === 'immersive');
      var pill = mrEnsureRestorePill();
      pill.style.display = mode ? '' : 'none';
      /* 尽力而为：WebView 支持全屏 API 时顺带隐藏系统栏 */
      if (mode === 'immersive') {
        try {
          if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(function () { });
          }
        } catch (e) { }
      } else {
        try {
          if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () { });
        } catch (e) { }
      }
      if (typeof window.showToast === 'function') {
        window.showToast(mode === 'ui' ? '已隐藏界面（点「显示界面」恢复）' : (mode === 'immersive' ? '全沉浸模式（点「显示界面」退出）' : '已恢复界面'));
      }
    } catch (e) { }
  }
  function patchUiHideControls() {
    if (window.__mrUiHidePatched) return true;
    window.__mrUiHidePatched = 1;
    var rawControls = window.toggleControlsAutoHide;
    if (typeof rawControls === 'function') {
      window.toggleControlsAutoHide = function () {
        /* 手机端：这个按钮做成「隐藏UI」开关 */
        mrSetUiHidden(mrUiHidden.mode === 'ui' ? '' : 'ui');
      };
    }
    var rawImmersive = window.toggleImmersiveMode;
    if (typeof rawImmersive === 'function') {
      window.toggleImmersiveMode = function () {
        mrSetUiHidden(mrUiHidden.mode === 'immersive' ? '' : 'immersive');
      };
    }
    /* 点舞台空白（隐藏态下）也恢复 */
    document.addEventListener('click', function (ev) {
      if (!mrUiHidden.mode) return;
      var t = ev.target;
      if (t && t.closest && t.closest('#mr-ui-restore, #bottom-bar, #phone-chrome-slot, #search-area, #fx-fab, #playlist-panel')) return;
    }, true);
    return true;
  }

  /* ---- 首页恢复三张快捷卡（音乐库 / 每日推荐 / 最近播放）---- */
  function patchHomeQuickCards() {
    if (window.__mrQuickCardsPatched) return true;
    var grid = document.querySelector('#empty-home .home-grid.home-quick-grid');
    if (!grid) return false;
    window.__mrQuickCardsPatched = 1;
    try { grid.style.display = ''; } catch (e) { }
    return true;
  }

  /* ---- 菜单加「导入」（走宿主导入面板）---- */
  function patchImportMenuButton() {
    if (window.__mrImportMenuPatched) return true;
    var actions = document.getElementById('phone-chrome-menu-actions');
    if (!actions) return false;
    window.__mrImportMenuPatched = 1;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'phone-chrome-action';
    btn.textContent = '导入';
    btn.addEventListener('click', function () {
      try { toggleMenu(false); } catch (e) { }
      try {
        if (typeof window.toggleUploadPanel === 'function') { window.toggleUploadPanel(); return; }
      } catch (e) { }
      try { if (typeof window.openHomeLocalImport === 'function') { window.openHomeLocalImport(); return; } } catch (e) { }
      try { if (typeof window.openUploadPanel === 'function') window.openUploadPanel(); } catch (e) { }
    });
    actions.appendChild(btn);
    return true;
  }

  /* ---- 播放时语音输入：聚焦搜索框先暂停，离开搜索未提交再恢复 ---- */
  var mrSearchPause = { wasPlaying: false, pausedByUs: false };
  function patchSearchPauseForVoice() {
    if (window.__mrSearchPausePatched) return true;
    var area = document.getElementById('search-area');
    if (!area) return false;
    window.__mrSearchPausePatched = 1;
    function pauseForSearch() {
      try {
        if (mrSearchPause.resumeTimer) { window.clearTimeout(mrSearchPause.resumeTimer); mrSearchPause.resumeTimer = 0; }
        var a = window.audio;
        if (!a || a.paused) return;
        if (!window.playing) return;
        mrSearchPause.wasPlaying = true;
        mrSearchPause.pausedByUs = true;
        a.pause();
        try { if (typeof window.setPlayIcon === 'function') window.setPlayIcon(false); } catch (e) { }
      } catch (e) { }
    }
    function maybeResume() {
      try {
        if (!mrSearchPause.pausedByUs) return;
        var area2 = document.getElementById('search-area');
        var input = document.getElementById('search-input');
        var busy = area2 && area2.classList.contains('has-results');
        var hasText = !!(input && String(input.value || '').trim());
        if (busy || hasText) return;                 /* 有结果/有输入就不恢复，避免边搜边播 */
        var ae = document.activeElement;
        var area3 = document.getElementById('search-area');
        if (ae && area3 && area3.contains(ae)) return;   /* 焦点还在搜索区，保持暂停（语音输入需要在暂停态） */
        mrSearchPause.pausedByUs = false;
        var a = window.audio;
        if (a && a.paused && mrSearchPause.wasPlaying) {
          mrSearchPause.wasPlaying = false;
          try { if (typeof window.togglePlay === 'function') window.togglePlay(); else a.play().catch(function () { }); } catch (e) { }
        }
      } catch (e) { }
    }
    /* 用 document 级捕获：搜索框/搜索区被宿主重建也能命中 */
    document.addEventListener('focusin', function (ev) {
      var t = ev.target;
      if (t && t.closest && t.closest('#search-area')) pauseForSearch();
    }, true);
    document.addEventListener('focusout', function (ev) {
      var t = ev.target;
      if (!t || !t.closest || !t.closest('#search-area')) return;
      if (mrSearchPause.resumeTimer) window.clearTimeout(mrSearchPause.resumeTimer);
      mrSearchPause.resumeTimer = window.setTimeout(function () { mrSearchPause.resumeTimer = 0; maybeResume(); }, 700);
    }, true);
    return true;
  }


  /* ===== v98：音乐库入口 / 每日推荐·最近播放弹层动画 ===== */

  /* 音乐库：宿主走 openPlaylistPanelTab → setPeek(pl)，会被 patchPeek 的闸门挡住 → 临时放开 */
  function mrWithPlaylistPeekOpen(fn) {
    try {
      window.__mrAllowPlOpen = 1;
      fn();
    } catch (e) { }
    window.clearTimeout(window.__mrAllowPlOpenTimer);
    window.__mrAllowPlOpenTimer = window.setTimeout(function () {
      window.__mrAllowPlOpen = 0;
      window.__mrAllowPlOpenTimer = 0;
    }, 800);
  }
  function patchHomeLibraryEntry() {
    if (window.__mrHomeLibraryPatched) return true;
    window.__mrHomeLibraryPatched = 1;
    if (typeof window.openHomeDashboardLibrary === 'function') {
      var rawLib = window.openHomeDashboardLibrary;
      window.openHomeDashboardLibrary = function () {
        var self = this, args = arguments;
        window.__mrAllowPlOpen = 1;
        var r;
        try { r = rawLib.apply(self, args); } catch (e) { }
        window.clearTimeout(window.__mrAllowPlOpenTimer);
        window.__mrAllowPlOpenTimer = window.setTimeout(function () {
          window.__mrAllowPlOpen = 0;
          window.__mrAllowPlOpenTimer = 0;
        }, 800);
        return r;
      };
    }
    if (typeof window.openHomeLibrary === 'function') {
      var rawLib2 = window.openHomeLibrary;
      window.openHomeLibrary = function () {
        return mrWithPlaylistPeekOpen(function () { rawLib2.apply(this, arguments); });
      };
    }
    return true;
  }

  /* 每日推荐 / 最近播放：套上「先加 closing class 再真正关闭」的滑出动画 */
  var MR_DISCOVERY_PANEL_IDS = ['daily-recommend-panel', 'listen-history-panel'];
  function mrClosePanelAnimated(id, rawClose) {
    var mask = document.getElementById(id);
    if (mask && mask.classList.contains('show') && !mask.classList.contains('mr-panel-closing')) {
      mask.classList.add('mr-panel-closing');
      window.setTimeout(function () {
        try {
          mask.classList.remove('mr-panel-closing');
          if (typeof rawClose === 'function') rawClose();
          else mask.classList.remove('show');
        } catch (e) { }
      }, 220);
      return;
    }
    if (typeof rawClose === 'function') rawClose();
  }
  function patchDiscoveryPanelsAnimation() {
    if (window.__mrDiscoveryAnimPatched) return true;
    window.__mrDiscoveryAnimPatched = 1;
    ['closeDailyRecommendPanel', 'closeListenHistoryPanel'].forEach(function (name) {
      var raw = window[name];
      if (typeof raw !== 'function') return;
      var id = name.indexOf('Daily') >= 0 ? 'daily-recommend-panel' : 'listen-history-panel';
      window[name] = function () { return mrClosePanelAnimated(id, raw); };
    });
    /* 点遮罩关闭也走动画（捕获阶段先接管，避免宿主内部 closePanel 立刻撤 class） */
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.id) return;
      if (MR_DISCOVERY_PANEL_IDS.indexOf(t.id) < 0) return;
      if (!t.classList.contains('show')) return;
      if (t.classList.contains('mr-panel-closing')) return;
      ev.stopImmediatePropagation();
      ev.stopPropagation();
      ev.preventDefault();
      var rawName = t.id === 'daily-recommend-panel' ? 'closeDailyRecommendPanel' : 'closeListenHistoryPanel';
      var raw = window[rawName];
      if (typeof raw === 'function') mrClosePanelAnimated(t.id, raw);
      else t.classList.remove('show');
    }, true);
    return true;
  }


  /* ===== v99：歌词 音/译 切换（注音=假名转罗马音；译文=宿主双语翻译） ===== */
  var MR_AUX_MODE_KEY = 'mr-lyric-aux-mode-v1';
  var mrLyricAux = { mode: 'off', state: null };

  var MR_ROMA_TABLE = {
    'あ':'a','い':'i','う':'u','え':'e','お':'o',
    'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
    'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
    'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
    'や':'ya','ゆ':'yu','よ':'yo',
    'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
    'わ':'wa','を':'wo','ん':'n',
    'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
    'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
    'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
    'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
    'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
    'ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o',
    'ゃ':'ya','ゅ':'yu','ょ':'yo','ゎ':'wa','ゔ':'vu',
    'ー':'-','・':' ','、':', ','。':'.','！':'!','？':'?','「':'"','」':'"','『':'"','』':'"','（':'(','）':')','　':' '
  };
  var MR_ROMA_COMBOS = {
    'きゃ':'kya','きゅ':'kyu','きょ':'kyo','しゃ':'sha','しゅ':'shu','しょ':'sho','ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
    'にゃ':'nya','にゅ':'nyu','にょ':'nyo','ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo','みゃ':'mya','みゅ':'myu','みょ':'myo',
    'りゃ':'rya','りゅ':'ryu','りょ':'ryo','ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo','じゃ':'ja','じゅ':'ju','じょ':'jo',
    'びゃ':'bya','びゅ':'byu','びょ':'byo','ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo','てぃ':'ti','でぃ':'di','ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo',
    'うぇ':'we','うぃ':'wi','ゔぁ':'va','ゔぃ':'vi','ゔぇ':'ve','ゔぉ':'vo','しぇ':'she','ちぇ':'che','じぇ':'je'
  };
  function mrKanaToRomaji(input) {
    var s = String(input || '');
    if (!s) return '';
    /* 片假名 → 平假名 */
    s = s.replace(/[\u30a1-\u30f6]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var two = s.substr(i, 2);
      if (two === 'っ') { /* 促音：双写下一个辅音 */ }
      if (c === 'っ') {
        var nxt = s.charAt(i + 1);
        var nxt2 = s.substr(i + 1, 2);
        var roma = MR_ROMA_COMBOS[nxt2] || MR_ROMA_TABLE[nxt] || MR_ROMA_TABLE[s.charAt(i + 1)] || '';
        if (roma) out += roma.charAt(0);
        continue;
      }
      if (MR_ROMA_COMBOS[two]) { out += MR_ROMA_COMBOS[two]; i++; continue; }
      if (MR_ROMA_TABLE[c] !== undefined) { out += MR_ROMA_TABLE[c]; continue; }
      out += c;
    }
    return out.replace(/\s+/g, ' ').trim();
  }
  function mrHasKana(text) {
    return /[\u3040-\u30ff]/.test(String(text || ''));
  }
  /* 把注音写进 line.translation（宿主渲染第二行用的就是这个字段） */
  function mrApplyRomajiLines(lines) {
    var src = Array.isArray(lines) ? lines : [];
    return src.map(function (line) {
      var copy = {};
      for (var k in line) { if (Object.prototype.hasOwnProperty.call(line, k)) copy[k] = line[k]; }
      var text = String(copy.text || '');
      if (text && mrHasKana(text)) {
        var roma = mrKanaToRomaji(text);
        if (roma && roma !== text) copy.translation = roma;
      }
      return copy;
    });
  }

  function mrLyricAuxButtons() {
    var box = document.getElementById('mr-lyric-aux');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'mr-lyric-aux';
    box.innerHTML = '<button type="button" data-aux="roma" title="注音（罗马音）">音</button>' +
      '<button type="button" data-aux="trans" title="译文">译</button>';
    box.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-aux]') : null;
      if (!t) return;
      ev.preventDefault();
      ev.stopPropagation();
      var want = t.getAttribute('data-aux');
      mrSetLyricAuxMode(mrLyricAux.mode === want ? 'off' : want);
    });
    document.body.appendChild(box);
    return box;
  }

  /* ===== v100：在线歌词搜索提速 + 音/译按钮位置与显隐 ===== */
  function mrCleanLyricQuery(q) {
    var s = String(q || '');
    s = s.replace(/[〜～~]/g, ' ')
      .replace(/[【】\[\]（）()「」『』]/g, ' ')
      .replace(/[（(][^（）()]{0,18}[)）]/g, ' ')
      .replace(/\b(feat|ft|featuring|ver|version|remix|live|acoustic|instrumental|inst)\b\.?/gi, ' ')
      .replace(/\s*[-–—/|]\s*(最后|编缀|回忆|acoustic|live).*$/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return s || String(q || '').trim();
  }
  function patchLyricOnlineSearchSpeed() {
    if (window.__mrLyricSearchSpeedPatched) return true;
    if (typeof window.lyricOnlineSearchProvider !== 'function' || typeof window.lyricOnlineSearchNow !== 'function') return false;
    window.__mrLyricSearchSpeedPatched = 1;

    var rawProvider = window.lyricOnlineSearchProvider;
    window.lyricOnlineSearchProvider = function (provider, query, limit) {
      var p;
      try { p = rawProvider.apply(this, arguments); } catch (e) { return Promise.resolve([]); }
      if (!p || typeof p.then !== 'function') return p;
      return Promise.race([
        p.catch(function () { return []; }),
        new Promise(function (resolve) { window.setTimeout(function () { resolve([]); }, 4500); })
      ]);
    };

    var rawNow = window.lyricOnlineSearchNow;
    window.lyricOnlineSearchNow = function () {
      try {
        var mask = document.getElementById('lyric-online-modal');
        var input = mask && mask.querySelector('#lyric-online-input');
        if (input) {
          var cleaned = mrCleanLyricQuery(input.value);
          if (cleaned && cleaned !== input.value) {
            input.value = cleaned;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        /* 酷狗优先（主用平台，返回快） */
        if (window.lyricOnlineState && Array.isArray(window.lyricOnlineState.order)) {
          var order = window.lyricOnlineState.order.slice();
          order.sort(function (a, b) {
            var rank = { kugou: 0, netease: 1, qq: 2, qishui: 3, bodian: 4, ytm: 5, spotify: 6 };
            return (rank[a] == null ? 9 : rank[a]) - (rank[b] == null ? 9 : rank[b]);
          });
          window.lyricOnlineState.order = order;
        }
      } catch (e) { }
      return rawNow.apply(this, arguments);
    };
    return true;
  }


  /* ===== v101：优先使用平台自带罗马音（netease romalrc / QQ roma） ===== */
  var MR_ROMA_CACHE_KEY = 'mr-provider-roma-v1';
  var mrRomaMem = null;
  var mrRomaPending = Object.create(null);

  function mrRomaLoadCache() {
    if (mrRomaMem) return mrRomaMem;
    try { mrRomaMem = JSON.parse(localStorage.getItem(MR_ROMA_CACHE_KEY) || '{}') || {}; } catch (e) { mrRomaMem = {}; }
    return mrRomaMem;
  }
  function mrRomaSaveCache(key, rec) {
    try {
      var c = mrRomaLoadCache();
      c[key] = rec;
      var keys = Object.keys(c);
      if (keys.length > 160) keys.slice(0, keys.length - 160).forEach(function (k) { delete c[k]; });
      localStorage.setItem(MR_ROMA_CACHE_KEY, JSON.stringify(c));
    } catch (e) { }
  }
  function mrRomaSongKey(song) {
    try {
      var provider = String(typeof songProviderKey === 'function' ? songProviderKey(song) : (song.provider || song.source || ''));
      if (provider === 'netease') return 'netease:' + (song.id || song.songId || '');
      if (provider === 'qq') return 'qq:' + (song.mid || song.songmid || song.mediaMid || song.id || '');
      return '';
    } catch (e) { return ''; }
  }
  /* LRC -> {秒: 文本} */
  function mrParseLrcMap(text) {
    var map = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var m;
      var re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
      var times = [];
      while ((m = re.exec(line))) {
        var sec = Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(('0.' + m[3]).slice(0, 5)) : 0);
        times.push(Math.round(sec * 1000) / 1000);
      }
      var rest = line.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '').trim();
      if (!rest || !times.length) return;
      times.forEach(function (t) { map[String(t)] = rest; });
    });
    return map;
  }
  function mrBridgeGet(url, headers, timeoutMs) {
    var bridge = window.__mrBridgeRequest;
    if (typeof bridge !== 'function') return Promise.reject(new Error('NO_BRIDGE'));
    return bridge({ url: url, method: 'GET', headers: headers || {}, timeoutMs: timeoutMs || 12000 });
  }
  function mrRomaFetchFromProvider(song) {
    var key = mrRomaSongKey(song);
    if (!key) return Promise.resolve(null);
    var cached = mrRomaLoadCache()[key];
    if (cached && cached.map && Object.keys(cached.map).length) return Promise.resolve(cached);
    if (mrRomaPending[key]) return mrRomaPending[key];
    var provider = key.split(':')[0];
    var id = key.split(':').slice(1).join(':');
    var task = Promise.resolve(null);
    if (provider === 'netease' && id) {
      var url = 'https://music.163.com/api/song/lyric?id=' + encodeURIComponent(id) + '&lv=-1&kv=-1&tv=-1&rv=1';
      task = mrBridgeGet(url, { 'Referer': 'https://music.163.com/', 'User-Agent': navigator.userAgent }).then(function (res) {
        var body = String((res && res.body) || '');
        if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1);
        var data = JSON.parse(body);
        var romaText = (data && data.romalrc && data.romalrc.lyric) || '';
        if (!romaText) return null;
        var map = mrParseLrcMap(romaText);
        return Object.keys(map).length ? { map: map, source: 'netease-romalrc' } : null;
      });
    } else if (provider === 'qq' && id) {
      var qurl = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=' + encodeURIComponent(id) +
        '&format=json&nobase64=1&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0';
      task = mrBridgeGet(qurl, { 'Referer': 'https://y.qq.com/', 'User-Agent': navigator.userAgent }).then(function (res) {
        var body = String((res && res.body) || '');
        body = body.replace(/^[^({]*\(/, '').replace(/\)\s*;?\s*$/, '');
        var data = JSON.parse(body);
        var romaText = (data && (data.roma || '')).toString() || '';
        if (!romaText) return null;
        var map = mrParseLrcMap(romaText);
        return Object.keys(map).length ? { map: map, source: 'qq-roma' } : null;
      });
    }
    task = task.catch(function () { return null; }).then(function (rec) {
      delete mrRomaPending[key];
      if (rec) mrRomaSaveCache(key, rec);
      return rec;
    });
    mrRomaPending[key] = task;
    return task;
  }
  /* 把平台罗马音按时间贴到歌词行上（返回新数组；没有可贴的返回 null） */
  function mrApplyProviderRoma(lines, map) {
    if (!map || !Object.keys(map).length) return null;
    var keys = Object.keys(map);
    var times = keys.map(Number).sort(function (a, b) { return a - b; });
    function closest(t) {
      var best = null, bestD = 9;
      for (var i = 0; i < times.length; i++) {
        var d = Math.abs(times[i] - t);
        if (d < bestD) { bestD = d; best = times[i]; }
        if (times[i] > t + 2) break;
      }
      return bestD <= 0.6 ? map[String(best)] : '';
    }
    var hit = 0;
    var out = (lines || []).map(function (line) {
      var copy = {};
      for (var k in line) { if (Object.prototype.hasOwnProperty.call(line, k)) copy[k] = line[k]; }
      var t = Number(copy.t != null ? copy.t : copy.time);
      if (!isFinite(t)) t = 0;
      var roma = closest(t);
      if (roma) { copy.translation = roma; hit++; }
      return copy;
    });
    return hit ? out : null;
  }
  function mrCurrentSongForRoma() {
    try {
      if (typeof currentLyricSong === 'function') return currentLyricSong();
      var q = window.playQueue || [];
      return q[window.currentIdx] || null;
    } catch (e) { return null; }
  }
  /* 当前歌词状态下尝试用平台罗马音重绘 */
  function mrApplyRomaForState(song) {
    var st = mrLyricAux.state;
    if (!st || mrLyricAux.mode !== 'roma') return;
    var key = mrRomaSongKey(song || mrCurrentSongForRoma() || {});
    var cached = key && mrRomaLoadCache()[key];
    if (cached && cached.map) {
      var withRoma = mrApplyProviderRoma(st.lines, cached.map);
      if (withRoma) {
        try {
          var raw = st.__rawSet;
          (window.setOriginalLyricsStateForRoma || window.setOriginalLyricsState)(withRoma, st.hasKaraoke, st.timingSource, st.translationLines, st.translationSource);
          window.applyPreferredLyricsForCurrent(true);
        } catch (e) { }
        return;
      }
    }
    /* 没缓存：异步拉一次，回来再重绘 */
    var target = song || mrCurrentSongForRoma();
    if (!target || !mrRomaSongKey(target)) return;
    mrRomaFetchFromProvider(target).then(function (rec) {
      if (!rec || mrLyricAux.mode !== 'roma') return;
      var st2 = mrLyricAux.state;
      if (!st2) return;
      var withRoma2 = mrApplyProviderRoma(st2.lines, rec.map);
      if (!withRoma2) return;
      window.setOriginalLyricsState(withRoma2, st2.hasKaraoke, st2.timingSource, st2.translationLines, st2.translationSource);
      try { window.applyPreferredLyricsForCurrent(true); } catch (e) { }
    }).catch(function () { });
  }

  function mrLyricAuxAvailability() {
    var st = mrLyricAux.state;
    /* 优先用宿主当前歌词全局（切歌后最准），没有再用我们保存的原始歌词 */
    var live = (window.lyricsLines && window.lyricsLines.length) ? window.lyricsLines : null;
    var lines = live || (st && st.lines) || [];
    var hasRoma = false;
    var hasTrans = false;
    try {
      hasRoma = lines.some(function (l) { return l && mrHasKana(l.text); });
      hasTrans = !!((window.lyricsTranslationLines && window.lyricsTranslationLines.length) || (st && st.translationLines && st.translationLines.length));
      if (!hasTrans) hasTrans = lines.some(function (l) { return l && String(l.translation || '').trim(); });
    } catch (e) { }
    return { roma: hasRoma, trans: hasTrans };
  }
  function mrPlaceLyricAux() {
    var box = document.getElementById('mr-lyric-aux');
    if (!box) return null;
    var bar = document.getElementById('bottom-bar');
    if (bar && box.parentElement !== bar) bar.appendChild(box);
    return box;
  }

  function mrUpdateLyricAuxButtons() {
    var box = mrPlaceLyricAux() || mrLyricAuxButtons();
    var on = mrLyricAux.mode;
    var av = mrLyricAuxAvailability();
    box.classList.toggle('mr-aux-on-roma', on === 'roma');
    box.classList.toggle('mr-aux-on-trans', on === 'trans');
    var bRoma = box.querySelector('[data-aux="roma"]');
    var bTrans = box.querySelector('[data-aux="trans"]');
    if (bRoma) bRoma.style.display = av.roma ? '' : 'none';
    if (bTrans) bTrans.style.display = av.trans ? '' : 'none';
    var any = av.roma || av.trans;
    var visible = any;
    try { if (visible && !stageIsPlayerPage()) visible = false; } catch (e) { }
    box.style.display = visible ? '' : 'none';
    /* 都不支持时清掉模式，避免残留 */
    if (!any && mrLyricAux.mode !== 'off') {
      mrLyricAux.mode = 'off';
      try { localStorage.setItem(MR_AUX_MODE_KEY, 'off'); } catch (e) { }
    }
  }
  function mrSetLyricAuxMode(mode) {
    if (mode !== 'roma' && mode !== 'trans') mode = 'off';
    mrLyricAux.mode = mode;
    try { localStorage.setItem(MR_AUX_MODE_KEY, mode); } catch (e) { }
    try {
      if (typeof window.setLyricTranslationMode === 'function') {
        window.setLyricTranslationMode(mode === 'trans' ? 'dual' : 'off');
      }
    } catch (e) { }
    var st = mrLyricAux.state;
    if (st) {
      try {
        window.setOriginalLyricsState(
          mode === 'roma' ? mrApplyRomajiLines(st.lines) : st.lines,
          st.hasKaraoke, st.timingSource, st.translationLines, st.translationSource
        );
        window.applyPreferredLyricsForCurrent(true);
      } catch (e) { }
      if (mode === 'roma') {
        /* 先用假名转换兜底，再异步换成平台自带的罗马音 */
        try { mrApplyRomaForState(mrCurrentSongForRoma()); } catch (e) { }
      }
    }
    mrUpdateLyricAuxButtons();
    if (typeof window.showToast === 'function') {
      if (mode === 'roma') {
        var has = false;
        try { has = (st ? st.lines : []).some(function (l) { return mrHasKana(l && l.text); }); } catch (e) { }
        window.showToast(has ? '已显示注音（罗马音）' : '这首歌没有日文假名，无法注音');
      } else if (mode === 'trans') {
        window.showToast('已显示译文（需要歌词自带翻译）');
      } else {
        window.showToast('已关闭音/译');
      }
    }
  }

  function patchLyricAux() {
    if (window.__mrLyricAuxPatched) return true;
    if (typeof window.setOriginalLyricsState !== 'function' || typeof window.applyPreferredLyricsForCurrent !== 'function') return false;
    window.__mrLyricAuxPatched = 1;
    try {
      var saved = localStorage.getItem(MR_AUX_MODE_KEY);
      if (saved === 'roma' || saved === 'trans') mrLyricAux.mode = saved;
    } catch (e) { }
    var rawSet = window.setOriginalLyricsState;
    window.setOriginalLyricsState = function (lines, hasKaraoke, timingSource, translationLines, translationSource) {
      var safeLines = Array.isArray(lines) ? lines : [];
      mrLyricAux.state = {
        lines: JSON.parse(JSON.stringify(safeLines)),
        hasKaraoke: hasKaraoke,
        timingSource: timingSource,
        translationLines: Array.isArray(translationLines) ? JSON.parse(JSON.stringify(translationLines)) : [],
        translationSource: translationSource
      };
      var useLines = safeLines;
      if (mrLyricAux.mode === 'roma') {
        var romaKey = mrRomaSongKey(mrCurrentSongForRoma() || {});
        var romaCached = romaKey && mrRomaLoadCache()[romaKey];
        var romaLines = romaCached && romaCached.map ? mrApplyProviderRoma(safeLines, romaCached.map) : null;
        useLines = romaLines || mrApplyRomajiLines(safeLines);
      }
      var r = rawSet.call(this, useLines, hasKaraoke, timingSource, translationLines, translationSource);
      try { window.setTimeout(mrUpdateLyricAuxButtons, 30); } catch (e) { }
      if (mrLyricAux.mode === 'roma') {
        try { window.setTimeout(function () { mrApplyRomaForState(mrCurrentSongForRoma()); }, 60); } catch (e) { }
      }
      return r;
    };
    /* 进播放页/换歌后刷新按钮可见性与状态 */
    document.addEventListener('click', function () { window.setTimeout(mrUpdateLyricAuxButtons, 320); }, true);
    window.setInterval(function () { try { mrUpdateLyricAuxButtons(); } catch (e) { } }, 1000);
    mrUpdateLyricAuxButtons();
    return true;
  }


  /* ===== v102：面板预热 + 返回键收回动画 ===== */
  var MR_WARM_PANELS = ['daily-recommend-panel', 'listen-history-panel', 'home-platform-recommend-mask'];
  var mrPanelWarmState = { done: 0, timer: 0 };

  function mrPanelOpenAnimatedClose(id) {
    var mask = document.getElementById(id);
    if (!mask || !mask.classList.contains('show')) return false;
    if (id === 'daily-recommend-panel' && typeof window.closeDailyRecommendPanel === 'function') { window.closeDailyRecommendPanel(); return true; }
    if (id === 'listen-history-panel' && typeof window.closeListenHistoryPanel === 'function') { window.closeListenHistoryPanel(); return true; }
    if (id === 'home-platform-recommend-mask' && typeof window.closeHomePlatformRecommendations === 'function') { window.closeHomePlatformRecommendations(); return true; }
    if (!mask.classList.contains('mr-panel-closing')) {
      mask.classList.add('mr-panel-closing');
      window.setTimeout(function () { mask.classList.remove('mr-panel-closing'); mask.classList.remove('show'); }, 220);
    }
    return true;
  }

  /* 返回键：优先按 z 序关闭我们管的面板（带收回动画） */
  function patchBackButtonPanels() {
    if (window.__mrBackPanelsPatched) return true;
    if (typeof window.closeTopOverlay !== 'function') return false;
    window.__mrBackPanelsPatched = 1;
    var raw = window.closeTopOverlay;
    window.closeTopOverlay = function () {
      try {
        var ids = ['home-platform-recommend-mask', 'daily-recommend-panel', 'listen-history-panel', 'lyric-online-modal', 'upload-panel'];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (!el) continue;
          var isOpen = el.classList.contains('show') || (el.classList.contains('lyric-online-mask') && el.classList.contains('show'));
          if (!isOpen) continue;
          if (ids[i] === 'lyric-online-modal') { try { window.closeLyricOnlineSearch(); } catch (e) { } return true; }
          if (ids[i] === 'upload-panel') { try { window.closeUploadPanel(); } catch (e) { el.classList.remove('show'); } return true; }
          return mrPanelOpenAnimatedClose(ids[i]);
        }
      } catch (e) { }
      return raw.apply(this, arguments);
    };
    return true;
  }

  /* 空闲预热：隐藏状态下把面板建好、数据拉一次，之后用户点开就是秒开 */
  function mrWarmPanels() {
    if (mrPanelWarmState.done) return;
    if (mrPanelWarmState.timer) return;
    mrPanelWarmState.timer = window.setTimeout(function () {
      mrPanelWarmState.timer = 0;
      if (document.hidden || window.playing === false && document.body.classList.contains('mr-player-page')) {
        /* 播放页里不预热，等回到首页再说 */
        mrPanelWarmState.timer = window.setTimeout(mrWarmPanels, 8000);
        return;
      }
      mrPanelWarmState.done = 1;
      try {
        document.body.classList.add('mr-prewarming');
        var finish = function () {
          window.setTimeout(function () {
            try {
              MR_WARM_PANELS.forEach(function (id) {
                var m = document.getElementById(id);
                if (!m) return;
                m.classList.remove('show');
                m.classList.remove('mr-panel-closing');
              });
              try { if (window.__mrDiscoveryPanels && window.__mrDiscoveryPanels.state) { } } catch (e) { }
              if (window.dailyState) window.dailyState.open = false;
              if (window.historyState) window.historyState.open = false;
              if (window.homePlatformRecommendationState) window.homePlatformRecommendationState.open = false;
            } catch (e) { }
            try { document.body.classList.remove('mr-prewarming'); } catch (e) { }
          }, 700);
        };
        try { if (typeof window.openListenHistoryPanel === 'function') window.openListenHistoryPanel(); } catch (e) { }
        try { if (typeof window.openDailyRecommendPanel === 'function') window.openDailyRecommendPanel(); } catch (e) { }
        try { if (typeof window.openHomePlatformRecommendations === 'function') window.openHomePlatformRecommendations(); } catch (e) { }
        /* 歌单数据预热：只拉数据（缓存到 /api 缓存），避免首次打开等网络 */
        try { if (typeof window.refreshUserPlaylists === 'function') window.refreshUserPlaylists(true); } catch (e) { }
        finish();
      } catch (e) {
        try { document.body.classList.remove('mr-prewarming'); } catch (e2) { }
      }
    }, 6000);
  }

  /* 回首页时再预热一次（播放页里不预热） */
  function mrMaybeWarmOnHome() {
    try {
      if (document.body.classList.contains('empty-home-active') && !document.body.classList.contains('mr-player-page')) mrWarmPanels();
    } catch (e) { }
  }

  function startWatchdog() {
    if (window.__mrWatchdog) return;
    window.__mrWatchdog = 1;
    window.setInterval(function () {
      /* v91：后台（WebView 不可见）不跑任何检测，回到前台再继续 */
      if (document.hidden) return;
      WATCH_TICK++;
      try { noticeWatch(); } catch (e) { }          /* 500ms：无通知时只做 2 次 null 判断 */
      try { panelKbFit(); } catch (e) { }           /* DIY 面板没开时立即返回 */
      if (WATCH_TICK % 4 === 0) {
        try { if (document.getElementById('hotkey-settings-btn') || document.getElementById('hotkey-modal')) mrRemoveHotkeyUi(); } catch (e) { }
        try { patchHomeQuickCards(); } catch (e) { }
        try { patchHomeLibraryEntry(); } catch (e) { }
        try { patchLyricAux(); } catch (e) { }
        try { patchLyricOnlineSearchSpeed(); } catch (e) { }
        try { patchBackButtonPanels(); } catch (e) { }
    try { patchBackButtonPanels(); } catch (e) { }
    try { mrWarmPanels(); } catch (e) { }
    try { window.setInterval(mrMaybeWarmOnHome, 4000); } catch (e) { }
    try { patchLyricOnlineSearchSpeed(); } catch (e) { }
    try { patchLyricAux(); } catch (e) { }
        try { patchDiscoveryPanelsAnimation(); } catch (e) { }
        try { patchImportMenuButton(); } catch (e) { }
        try { patchSearchPauseForVoice(); } catch (e) { }
        try { patchPlatformPanelAnimation(); } catch (e) { }
        try { patchHomeBlankDismiss(); } catch (e) { }
        /* 2.0s：吸顶变量 / 补丁自愈（宿主换 fetch、重建面板时才需要重装） */
        try { updatePlaylistStickyVars(); } catch (e) { }
        try { installApiFetchCache(); } catch (e) { }
        try { installPlaylistFullRender(); } catch (e) { }
        classWatch();
      }
      try {
        /* 在线歌词模态 / DIY 面板打开时，4UI 弹层一律收起（兜底，防宿主换入口打开） */
        if (window.__mrDiyOpen) closeAllPopovers();
        else if (window.__mrLyricModalOpen || document.getElementById('lyric-online-modal')) {
          var lom = document.getElementById('lyric-online-modal');
          if (lom && lom.classList.contains('show')) closeAllPopovers();
        }
      } catch (e) { }
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
      try { updatePlaylistStickyVars(); } catch (e) { }
      try { installApiFetchCache(); } catch (e) { }
      try { installPlaylistFullRender(); } catch (e) { }
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
    /* v91：DIY 面板没开、也没钉住过，就不用每 500ms 读 DOM/visualViewport */
    if (!window.__mrDiyOpen && !panelKbPinned) return;
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
      window.addEventListener('resize', function () {
        var h = window.innerHeight || 0;
        if (h > 200 && h > layoutBaseH) layoutBaseH = h;
        run();
      });
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

  /* v90：从搜索结果直接点歌时，宿主只会开始播放、不会切播放页（也不触发我们的首页隐藏钩子）。
     这里在搜索结果点击后兜底：只要确认已经在播，就收起搜索浮层并进播放页。 */
  function bindSearchPlayEnter() {
    if (window.__mrSearchPlayEnter) return;
    window.__mrSearchPlayEnter = 1;
    function tryEnterFromSearch() {
      try {
        if (pageState !== 'home' || isBusy()) return false;
        if (!hasPlaybackSignal()) return false;
        var sa = document.getElementById('search-area');
        if (sa && sa.classList.contains('has-results')) {
          try { clearSearchResults(); } catch (e) { }
          try { setPeek(sa, false, 'search'); } catch (e) { }
        }
        try { if (window.__mrDiyOpen) setDiyPanel(false); } catch (e) { }
        enterPlayerPage();
        return true;
      } catch (e) { return false; }
    }
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      var hit = t && t.closest ? t.closest('#search-results .search-result') : null;
      if (!hit) return;
      /* 解析/起播可能要好几秒，轮询等到真的在播再切页（最多 20s） */
      if (window.__mrSearchPlayTimer) { try { window.clearInterval(window.__mrSearchPlayTimer); } catch (e) { } }
      var tries = 0;
      window.__mrSearchPlayTimer = window.setInterval(function () {
        tries += 1;
        if (tryEnterFromSearch() || tries >= 28) {
          try { window.clearInterval(window.__mrSearchPlayTimer); } catch (e) { }
          window.__mrSearchPlayTimer = 0;
        }
      }, 700);
    }, true);
    /* 宿主也可能通过键盘/其它入口播放，这里再兜一层：离开首页类名消失但没进播放页时补进 */
    document.addEventListener('click', function () {
      window.setTimeout(function () {
        try {
          if (pageState !== 'home' || isBusy()) return;
          if (!hasPlaybackSignal()) return;
          if (!bodyEl() || bodyEl().classList.contains('empty-home-active')) return;
          tryEnterFromSearch();
        } catch (e) { }
      }, 900);
    }, true);
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

      var netBtn = document.createElement('button');
      netBtn.type = 'button';
      netBtn.className = 'phone-chrome-action';
      netBtn.textContent = '网络';
      netBtn.addEventListener('click', function () {
        toggleMenu(false);
        try { window.mrNetPanel.toggle(); } catch (e) { }
      });
      actions.appendChild(netBtn);

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

  /* v83：FLIP 行的宽高同步动画（WAAPI 的 width/height 会被 CSS !important 盖掉，只能自己写内联） */
  var MR_EASE_FN = (function () {
    /* cubic-bezier(.22,.9,.25,1) 求值：给定 x 求 y */
    var x1 = 0.22, y1 = 0.9, x2 = 0.25, y2 = 1;
    function A(a1, a2) { return 1 - 3 * a2 + 3 * a1; }
    function B(a1, a2) { return 3 * a2 - 6 * a1; }
    function C(a1) { return 3 * a1; }
    function calc(t, a1, a2) { return ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t; }
    function slope(t, a1, a2) { return 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1); }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 4; i += 1) {
        var s = slope(t, x1, x2);
        if (Math.abs(s) < 1e-5) break;
        t -= (calc(t, x1, x2) - x) / s;
      }
      return calc(t, y1, y2);
    };
  })();

  function animateRowBox(el, fromW, fromH, toW, toH, dur) {
    if (!el) return;
    var t0 = performance.now();
    if (el.__mrBoxRaf) { try { cancelAnimationFrame(el.__mrBoxRaf); } catch (e) { } el.__mrBoxRaf = 0; }
    function step(now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = MR_EASE_FN(t);
      var w = fromW + (toW - fromW) * e;
      var h = fromH + (toH - fromH) * e;
      try {
        el.style.setProperty('width', w.toFixed(2) + 'px', 'important');
        el.style.setProperty('height', h.toFixed(2) + 'px', 'important');
      } catch (err) { }
      if (t < 1) {
        el.__mrBoxRaf = requestAnimationFrame(step);
      } else {
        el.__mrBoxRaf = 0;
      }
    }
    /* v83：当前帧先同步写一次起始宽高，避免第一帧按 CSS 全宽闪一下 */
    try {
      el.style.setProperty('width', fromW.toFixed(2) + 'px', 'important');
      el.style.setProperty('height', fromH.toFixed(2) + 'px', 'important');
    } catch (err) { }
    el.__mrBoxRaf = requestAnimationFrame(step);
  }

  function clearRowBoxAnim(el) {
    if (!el) return;
    if (el.__mrBoxRaf) { try { cancelAnimationFrame(el.__mrBoxRaf); } catch (e) { } el.__mrBoxRaf = 0; }
    try { el.style.removeProperty('width'); el.style.removeProperty('height'); } catch (e) { }
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
      /* v83：底栏槽宽 260 / 顶部条宽 316，只做 translate 会在起飞/落位时瞬间变宽变窄。
         width/height 用 animateRowBox 内联驱动（WAAPI 的 width 会被 CSS !important 盖掉）。 */
      animateRowBox(actions, r0.width, r0.height, r1.width, r1.height, MR_DUR);
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
    if (!slot || !trackDocked) return null;
    var r1 = actions.getBoundingClientRect();
    /* v83：目标 = 入栏后行会填充的 #controls 矩形（实测入栏行 rect 与 #controls 完全一致），
       不再用 slot（占位符尺寸和行不同）也不用临时插拔 DOM。 */
    var ctrl = controlsEl();
    var cr = ctrl ? ctrl.getBoundingClientRect() : null;
    var rs = cr ? { left: cr.left, top: cr.top, width: cr.width, height: r1.height } : slot.getBoundingClientRect();
    var dx = Math.round((rs.left - r1.left) * 100) / 100;
    var dy = Math.round((rs.top - r1.top) * 100) / 100;
    try {
      /* v83：回程把 width/height 一起收到底栏槽尺寸，
         否则落位时 dockTrackImmediate 换 DOM 会「缩一下」（用户看到的闪烁）。 */
      animateRowBox(actions, r1.width, r1.height, rs.width, rs.height, MR_DUR);
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
      clearRowBoxAnim(actions);
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
    clearRowBoxAnim(actions);
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
          if (anyOverlayOpen()) {
            /* v90：从搜索结果/歌单里直接点歌播放时，宿主会关掉首页但搜索浮层还开着，
               旧逻辑在这里 return 导致「歌在放、界面却留在首页」。真在播放就收起浮层并进播放页。 */
            try { if (hasPlaybackSignal()) enterPlayerFromHostHide(); } catch (e) { }
            return res;
          }
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

  /* v82：只关两个 4UI 弹层（不动在线歌词模态） */
  function closeAllPopovers() {
    var refs = popoverRefs();
    if (refs.volCtl && refs.volCtl.__mrPopOpen) closePopover(refs.volCtl, refs.volPop);
    if (refs.lyrCtl && refs.lyrCtl.__mrPopOpen) closePopover(refs.lyrCtl, refs.lyrPop);
    if (refs.volCtl) refs.volCtl.__mrPopOpen = false;
    if (refs.lyrCtl) refs.lyrCtl.__mrPopOpen = false;
    hidePopover(refs.volPop);
    hidePopover(refs.lyrPop);
  }

  /* v82：两个弹层互斥——打开一个就先收起另一个。
     （原来「词」和「音量」可以同时展开，在底栏上方叠成一团。） */
  function closeOtherPopover(keepKey) {
    var refs = popoverRefs();
    if (keepKey !== 'vol' && refs.volCtl && refs.volCtl.__mrPopOpen) closePopover(refs.volCtl, refs.volPop);
    if (keepKey !== 'lyr' && refs.lyrCtl && refs.lyrCtl.__mrPopOpen) closePopover(refs.lyrCtl, refs.lyrPop);
    if (!keepKey) {
      /* 只收 4UI 弹层；在线歌词模态不在这个函数里动（否则看门狗每 500ms 会把它关掉） */
      return;
    }
  }

  function togglePopover(which) {
    var refs = popoverRefs();
    var ctl = which === 'vol' ? refs.volCtl : refs.lyrCtl;
    var pop = which === 'vol' ? refs.volPop : refs.lyrPop;
    if (!ctl || !pop) return;
    closeOtherPopover(which);
    var openNow = !ctl.__mrPopOpen;
    ctl.__mrPopOpen = openNow;
    ctl.classList.toggle('mr-open', openNow);
    if (openNow) {
      /* 打开前再确认另一个是关的（closePopover 有 80ms 延迟兜底，这里立即隐藏） */
      var otherCtl = which === 'vol' ? refs.lyrCtl : refs.volCtl;
      var otherPop = which === 'vol' ? refs.lyrPop : refs.volPop;
      if (otherCtl) { otherCtl.__mrPopOpen = false; otherCtl.classList.remove('mr-open'); }
      hidePopover(otherPop);
      placePopover(ctl, pop);
    } else {
      closePopover(ctl, pop);
    }
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
        togglePopover('vol');
        return;
      }
      var isLyr = t && t.closest ? t.closest('#lyrics-toggle-btn') : null;
      if (isLyr && refs.lyrCtl && refs.lyrPop) {
        ev.stopPropagation();
        try { ev.preventDefault(); } catch (e) { }
        togglePopover('lyr');
        return;
      }
      /* 点其它地方：把已展开的弹层收起 */
      if (refs.volCtl && refs.volCtl.__mrPopOpen && !(t && t.closest && t.closest('.volume-popover'))) closePopover(refs.volCtl, refs.volPop);
      if (refs.lyrCtl && refs.lyrCtl.__mrPopOpen && !(t && t.closest && t.closest('#lyric-timing-popover'))) closePopover(refs.lyrCtl, refs.lyrPop);
    }, true);
  }

  /* v82：宿主「搜索歌词」打开在线歌词模态前，先收掉 4UI 弹层 / DIY 面板，
     否则模态（z-index 原本只有 260）会被 4UI 弹层（z-index 9600）盖住。 */
  function patchLyricOnlineSearch() {
    if (window.__mrLyricSearchPatched) return true;
    if (typeof window.openLyricOnlineSearch !== 'function') return false;
    window.__mrLyricSearchPatched = 1;
    var raw = window.openLyricOnlineSearch;
    window.openLyricOnlineSearch = function () {
      try { closeAllPopovers(); } catch (e) { }
      try { if (window.__mrDiyOpen) setDiyPanel(false); } catch (e) { }
      return raw.apply(this, arguments);
    };
    return true;
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
    /* v91：没有可见通知时直接返回，省掉每 500ms 一次 .mr-top-track 查询 + rect */
    var stackHas = refs.stack && refs.stack.children.length > 0;
    var noticeShown = refs.notice && refs.notice.classList.contains('show');
    if (!stackHas && !noticeShown) return;
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

  /* v86：歌单面板吸顶偏移——面板头部（标题/切页签）吸顶后，展开歌单的标题也要紧贴它吸顶 */
  function updatePlaylistStickyVars() {
    try {
      var panel = document.getElementById('playlist-panel');
      if (!panel) return;
      if (!panel.classList.contains('show') && !panel.classList.contains('peek')) return;
      var head = panel.querySelector('.playlist-panel-sticky');
      var h = head ? Math.round(head.getBoundingClientRect().height) : 0;
      if (h > 0) panel.style.setProperty('--mr-pl-head-h', h + 'px');
    } catch (e) { }
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
    /* v102: close top discovery/lyric panels first (with closing animation) */
    try {
      var mrTopIds = ['home-platform-recommend-mask', 'daily-recommend-panel', 'listen-history-panel', 'lyric-online-modal'];
      for (var mri = 0; mri < mrTopIds.length; mri++) {
        var mrEl = document.getElementById(mrTopIds[mri]);
        if (!mrEl || !mrEl.classList.contains('show')) continue;
        if (mrTopIds[mri] === 'lyric-online-modal') { try { closeLyricOnlineSearch(); } catch (e2) { } return true; }
        if (typeof mrPanelOpenAnimatedClose === 'function') return mrPanelOpenAnimatedClose(mrTopIds[mri]);
        mrEl.classList.remove('show');
        return true;
      }
      var mrUp = document.getElementById('upload-panel');
      if (mrUp && mrUp.classList.contains('show')) { try { closeUploadPanel(); } catch (e3) { mrUp.classList.remove('show'); } return true; }
    } catch (e0) { }
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
    mrLocalStorageBoot();
    installApiFetchCache();
    try { installPlaylistFullRender(); } catch (e) { }
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
    bindSearchPlayEnter();
    try { patchHomeHeroMedia(); } catch (e) { }
    try { patchProgressiveSearch(); } catch (e) { }
    try { patchLikeStatusSync(); } catch (e) { }
    try { patchHotkeyRemoval(); } catch (e) { }
    try { patchHomeLibraryEntry(); } catch (e) { }
    try { patchDiscoveryPanelsAnimation(); } catch (e) { }
    try { patchUiHideControls(); } catch (e) { }
    try { patchHomeQuickCards(); } catch (e) { }
    try { patchImportMenuButton(); } catch (e) { }
    try { patchSearchPauseForVoice(); } catch (e) { }
    try { window.setTimeout(function () {
      try { patchUiHideControls(); } catch (e) { }
      try { patchHomeQuickCards(); } catch (e) { }
      try { patchImportMenuButton(); } catch (e) { }
      try { patchSearchPauseForVoice(); } catch (e) { }
    }, 2500); } catch (e) { }
    try { patchPlatformPanelAnimation(); } catch (e) { }
    try { patchHomeBlankDismiss(); } catch (e) { }
    try { window.setTimeout(function () { try { patchHotkeyRemoval(); } catch (e) { } try { patchPlatformPanelAnimation(); } catch (e) { } try { patchHomeBlankDismiss(); } catch (e) { } }, 2000); } catch (e) { }
    try { patchNetStatsUi(); } catch (e) { }
    try { window.setTimeout(function () { try { patchLikeStatusSync(); } catch (e) { } try { patchNetStatsUi(); } catch (e) { } }, 2500); } catch (e) { }
    try { patchNextTrackPrefetch(); } catch (e) { }
    try { window.setTimeout(function () { try { patchProgressiveSearch(); } catch (e) { } mrWarmConnections(); }, 3000); } catch (e) { }
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
