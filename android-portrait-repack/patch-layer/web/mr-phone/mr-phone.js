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
 *   §8 缓存/调优      mrMigrateApiCacheV104（v104 删 v88 缓存层）/ tuneAudioFade / tuneRendererOnce / patchHomeToast
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

  /* ===== v104-search：搜索空包判定（缓存层与渐进搜索共用）=====
     真机证据：v88 那层 localStorage 缓存把 v94 的 `MR_SEARCH_TIMEOUT` 哨兵和真空包
     也当正常结果存了 6 小时，之后同一关键词 2~4ms 就返回空包 → 宿主把空列表渲染成
     「没有找到相关歌曲」。v88 层已由 v104-net P1 删除；这里补两道保险：
     1) v94 缓存永远不写「没有 songs 的搜索响应」，命中也视为未命中；
     2) 渐进搜索把任何空包/错误包当「不可信」，带 mrrerun 重取一次再决定是否显示空态。 */
  function mrSearchPayloadSongs(data) {
    if (!data || typeof data !== 'object') return 0;
    var cands = [data.songs, data.tracks];
    if (data.value && typeof data.value === 'object') cands.push(data.value.songs);
    if (data.result && typeof data.result === 'object') cands.push(data.result.songs);
    if (data.data && typeof data.data === 'object') cands.push(data.data.songs);
    for (var i = 0; i < cands.length; i++) {
      if (Array.isArray(cands[i]) && cands[i].length) return cands[i].length;
    }
    return 0;
  }

  function mrSearchPayloadEmpty(data) {
    try {
      if (!data || typeof data !== 'object') return true;
      if (data.error) return true;
      if (data.ok === false) return true;
      return mrSearchPayloadSongs(data) === 0;
    } catch (e) { return true; }
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
        urlMem: Object.create(null),
        /* v104-net：失败的取址结果短负缓存 + 同 URL 在途请求合并表。
           urlNegById 额外按「平台+hash/mid/id」记一份：宿主切音质/重试会换 URL，
           只按完整 URL 记负缓存挡不住，同一首歌会反复等 4.7s 才失败。 */
        urlNeg: Object.create(null),
        urlNegById: Object.create(null),
        lyricNeg: Object.create(null),
        inflight: Object.create(null)
      };
      window.__mrApiCacheState = state;
      window.__mrApiCacheInstalled = 1;
    }
    if (window.fetch === state.wrapped) return true;

    var STATUS_TTL = 10 * 60 * 1000;
    /* v104-net：song/url 内存 10min（宿主换歌复用），落盘只留 6min（CDN 签名地址会过期，
       跨重启只服务"刚听过又回来"；过期地址由 audio error 事件作废） */
    var SONG_URL_TTL = 10 * 60 * 1000;
    var SONG_URL_DB_TTL = 6 * 60 * 1000;
    var LYRIC_DB_TTL = 20 * 60 * 1000;
    /* 失败取址/空歌词的短负缓存：宿主 fallback 会重试同一条 URL，命中可省一次完整往返，
       但过期后必须放开，避免平台恢复后还一直拿旧失败 */
    var SONG_URL_NEG_TTL = 90 * 1000;
    var LYRIC_EMPTY_NEG_TTL = 120 * 1000;
    /* 按 song 身份（平台+hash/mid/id）的失败记忆：登录/登出、audio 报错都会清空 */
    var SONG_URL_ID_NEG_TTL = 180 * 1000;
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
    /* 去掉时间戳类易变参数，否则每次 key 都不同 → 缓存永远不命中
       v104：mrrerun 也归一化掉；带 mrrerun 的请求只「跳过读缓存」，成功结果仍写回
       归一化 key —— 这样 cache-buster 重取既能绕过旧空包，又能把新结果缓存给下次用。 */
    function normalizeCacheKey(url) {
      try {
        var u = new URL(url, location.href);
        var drop = ['t', '_', '_t', 'ts', 'timestamp', 'cachebuster', 'rnd', 'random', 'mrrerun'];
        drop.forEach(function (k) { if (u.searchParams.has(k)) u.searchParams.delete(k); });
        return u.href;
      } catch (e) { return url; }
    }
    function hasCacheBuster(url) {
      return /[?&]mrrerun=/.test(url);
    }
    function classify(url) {
      if (/\/status(\?|$)|\/login\/status/.test(url)) return 'status';
      if (/\/song\/url(\?|$)/.test(url)) return 'songurl';
      if (/\/lyric(\?|$)/.test(url)) return 'lyric';
      if (/\/search(\?|$)|\/cloudsearch\/pc/.test(url)) return 'search';
      return 'other';
    }
    /* v104-net：按 kind 决定落盘 TTL（旧条目没有 k 字段时按本次请求的 kind 现算） */
    function ttlForKind(kind) {
      if (kind === 'songurl') return SONG_URL_DB_TTL;
      if (kind === 'lyric') return LYRIC_DB_TTL;
      return state.ttl;
    }
    /* v104-net：失败包判定——无播放地址的取址响应、空歌词不进正式缓存 */
    function isSongUrlFailure(d) {
      try { return !(d && d.url); } catch (e) { return true; }
    }
    function isEmptyLyricPayload(d) {
      try { return !(d && (d.lyric || d.yrc || d.ytlrc || d.tlyric)); } catch (e) { return true; }
    }
    function shouldNegCache(kind, d) {
      if (kind === 'songurl') return isSongUrlFailure(d);
      if (kind === 'lyric') return isEmptyLyricPayload(d);
      return false;
    }
    /* v104-net：取址请求的「平台+歌」身份（酷狗 hash / QQ mid / 其它 id） */
    function songUrlIdentity(url) {
      try {
        var u = new URL(url, location.href);
        var m = /\/api\/([^/]+)\/song\/url/.exec(u.pathname);
        var provider = m ? m[1] : (u.pathname === '/api/song/url' ? 'netease' : '');
        var id = u.searchParams.get('hash') || u.searchParams.get('mid') || u.searchParams.get('id') || '';
        if (!provider || !id) return '';
        return provider + '|' + id;
      } catch (e) { return ''; }
    }
    function clearAuthStatus() {
      try {
        Object.keys(state.statusMem).forEach(function (k) {
          if (/\/status|login/.test(k)) delete state.statusMem[k];
        });
      } catch (e) { }
      /* v104-net：登录态变了，之前的取址失败可能只是缺权限 → 负缓存全部作废 */
      try {
        state.urlNeg = Object.create(null);
        state.urlNegById = Object.create(null);
        state.lyricNeg = Object.create(null);
      } catch (e2) { }
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
      var bust = hasCacheBuster(absUrl);
      var now = Date.now();
      var self = this;
      /* v104-net：从进入 fetch 就计时（原来的 t0 在 await 之后才取 → 全部记成 0ms） */
      var tReq = performance.now();

      function isSentinelPayload(d) {
        try { return !!(d && (d.error === 'MR_SEARCH_TIMEOUT' || d.__mrTimeout)); } catch (e) { return false; }
      }
      /* v104：【搜索】空包/错误包一律不可信：不读、不写、命中视为未命中 */
      function isUntrustedSearchPayload(d) {
        return kind === 'search' && mrSearchPayloadEmpty(d);
      }

      if (kind === 'status') {
        var st = state.statusMem[key];
        if (st && now - st.t < STATUS_TTL) {
          var stResp = makeJsonResponse(st.d);
          if (stResp) return Promise.resolve(stResp);
        }
      } else if (kind === 'songurl') {
        var su = state.urlMem[key];
        if (su && now - su.t < SONG_URL_TTL && !isSongUrlFailure(su.d)) {
          var suResp = makeJsonResponse(su.d);
          if (suResp) { try { mrNetRec(kind, key, performance.now() - tReq, true, 'mem'); } catch (e) { } return Promise.resolve(suResp); }
        }
        var sn = state.urlNeg[key];
        if (sn && now - sn.t < SONG_URL_NEG_TTL) {
          var snResp = makeJsonResponse(sn.d);
          if (snResp) { try { mrNetRec(kind, key, performance.now() - tReq, true, 'neg'); } catch (e) { } return Promise.resolve(snResp); }
        }
        var sid = songUrlIdentity(absUrl);
        var snId = sid ? state.urlNegById[sid] : null;
        if (snId && now - snId.t < SONG_URL_ID_NEG_TTL) {
          var snIdResp = makeJsonResponse(snId.d);
          if (snIdResp) { try { mrNetRec(kind, key, performance.now() - tReq, true, 'neg'); } catch (e) { } return Promise.resolve(snIdResp); }
        }
      } else if (kind === 'lyric') {
        var ln = state.lyricNeg[key];
        if (ln && now - ln.t < LYRIC_EMPTY_NEG_TTL) {
          var lnResp = makeJsonResponse(ln.d);
          if (lnResp) { try { mrNetRec(kind, key, performance.now() - tReq, true, 'neg'); } catch (e) { } return Promise.resolve(lnResp); }
        }
      }
      /* 登录 / 登出：清掉状态缓存，避免刚登录仍显示未登录 */
      if (/\/login\/|\/logout/.test(absUrl)) clearAuthStatus();

      function storeResult(data) {
        try {
          if (kind === 'status') state.statusMem[key] = { t: Date.now(), d: data };
          else if (kind === 'songurl') {
            if (!isSongUrlFailure(data)) {
              state.urlMem[key] = { t: Date.now(), d: data };
              var okId = songUrlIdentity(absUrl);
              if (okId) delete state.urlNegById[okId];
            }
          }
        } catch (e) { }
      }

      return (async function () {
        var hit = bust ? null : state.mem[key];
        var hitKind = (hit && hit.k) || kind;
        if (hit && (isSentinelPayload(hit.d) || shouldNegCache(hitKind, hit.d))) { delete state.mem[key]; hit = null; }
        if (hit && isUntrustedSearchPayload(hit.d)) {
          /* 旧版本可能缓存过搜索空包：当作未命中并清掉，重新请求 */
          delete state.mem[key];
          hit = null;
        }
        if (hit && now - hit.t < ttlForKind(hitKind)) {
          storeResult(hit.d);
          var cachedResp = makeJsonResponse(hit.d);
          if (cachedResp) { try { mrNetRec(kind, key, performance.now() - tReq, true, 'mem'); } catch (e) { } return cachedResp; }
        }
        /* v95-C1：like/check 全部已知 → 本地合成 */
        if (kind === 'other' && /like\/check|\/like\b/.test(absUrl)) {
          try {
            var synth = mrLikeSynthesize(absUrl);
            if (synth) {
              mrNetStat.likeSkip += 1;
              mrNetRec('like', absUrl, performance.now() - tReq, true, 'like');
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
        if (!hit && !bust) {
          var db0 = await ensureDb();
          if (db0) {
            var rec = await dbGet(db0, key);
            var recKind = (rec && rec.kd) || (rec && rec.k) || kind;
            if (rec && isSentinelPayload(rec.d)) { rec = null; }
            if (rec && isUntrustedSearchPayload(rec.d)) { rec = null; }
            if (rec && shouldNegCache(recKind, rec.d)) { rec = null; }
            if (rec && rec.t && Date.now() - rec.t < ttlForKind(recKind)) {
              state.mem[key] = { t: rec.t, d: rec.d, k: recKind };
              storeResult(rec.d);
              var resp1 = makeJsonResponse(rec.d);
              if (resp1) { try { mrNetRec(kind, key, performance.now() - tReq, true, 'db'); } catch (e) { } return resp1; }
            }
          }
        }

        /* v104-net：同一 URL 并发请求合并（下一首预解析 + 用户立刻点播放会同时打同一条取址） */
        if ((kind === 'songurl' || kind === 'lyric') && state.inflight[key]) {
          try { mrNetStat.dedupe = (mrNetStat.dedupe || 0) + 1; } catch (e) { }
          return state.inflight[key].then(function (r) {
            try { return r && r.clone ? r.clone() : r; } catch (e) { return r; }
          });
        }
        var netPromise = (async function () {
        var fetchPromise = rawFetch.call(self, input, init);
        var res;
        if (kind === 'search') {
          /* 搜索：硬超时，先让其它平台出结果，不让最慢的平台拖整页 */
          res = await Promise.race([
            fetchPromise.catch(function (e) { return { __mrErr: e }; }),
            new Promise(function (resolve) { setTimeout(function () { resolve({ __mrTimeout: 1 }); }, SEARCH_TIMEOUT); })
          ]);
          if (res && res.__mrTimeout) { try { mrNetRec(kind, key, performance.now() - tReq, false, 'timeout'); } catch (e) { } return makeJsonResponse(emptySearchPayload()); }
          if (res && res.__mrErr) { try { mrNetRec(kind, key, performance.now() - tReq, false, 'err'); } catch (e) { } throw res.__mrErr; }
        } else {
          try {
            res = await fetchPromise;
          } catch (err) {
            try { mrNetRec(kind, key, performance.now() - tReq, false, 'err'); } catch (e) { }
            throw err;
          }
        }
        try {
          if (res && res.ok) {
            var clone = res.clone();
            clone.json().then(function (data) {
              try { mrNetRec(kind, key, performance.now() - tReq, false, 'net'); } catch (e) { }
              if (kind === 'other' && /like\/check|\/like\b/.test(absUrl)) mrLikeRememberFromResponse(data);
              if (isSentinelPayload(data)) return;
              /* v104：搜索空包永不进缓存（否则同一关键词 20 分钟内都空） */
              if (isUntrustedSearchPayload(data)) return;
              /* v104-net：失败包不进正式缓存（原来 url_unavailable / 空歌词会被缓存 20min） */
              if (shouldNegCache(kind, data)) {
                try {
                  if (kind === 'songurl') {
                    state.urlNeg[key] = { t: Date.now(), d: data };
                    var failId = songUrlIdentity(absUrl);
                    if (failId) state.urlNegById[failId] = { t: Date.now(), d: data };
                    delete state.urlMem[key];
                  } else if (kind === 'lyric') {
                    state.lyricNeg[key] = { t: Date.now(), d: data };
                  }
                  mrNetStat.negStore = (mrNetStat.negStore || 0) + 1;
                } catch (e) { }
                return;
              }
              try {
                if (kind === 'songurl') {
                  delete state.urlNeg[key];
                  var okId2 = songUrlIdentity(absUrl);
                  if (okId2) delete state.urlNegById[okId2];
                }
                if (kind === 'lyric') delete state.lyricNeg[key];
              } catch (e) { }
              var item = { t: Date.now(), d: data, k: kind };
              state.mem[key] = item;
              storeResult(data);
              ensureDb().then(function (db2) {
                if (!db2) return;
                dbPut(db2, { k: key, t: item.t, d: item.d, kd: kind });
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
          } else if (res) {
            try { mrNetRec(kind, key, performance.now() - tReq, false, 'http' + res.status); } catch (e) { }
          }
        } catch (e) { }
        return res;
        })();
        if (kind === 'songurl' || kind === 'lyric') {
          state.inflight[key] = netPromise;
          var clearInflight = function () {
            try { if (state.inflight[key] === netPromise) delete state.inflight[key]; } catch (e) { }
          };
          netPromise.then(clearInflight, clearInflight);
        }
        return netPromise;
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

  /* ===== v104-search：搜索渐进策略（全平台并行 / 短预算 / 空包重取 / 失败可重试）=====
     旧实现（v94）真机问题：
       1) 酷狗先跑，6.5s 预算；失败再带 mrrerun 重试一次 6.5s → 冷缓存时 13s 才开始拉别的平台，
         再串行等 6s → 用户最长看到 19s「正在搜索」；
       2) 任何平台返回空包（含 v88 旧缓存里的 MR_SEARCH_TIMEOUT 哨兵）都被当成「没有结果」，
          宿主直接渲染「没有找到相关歌曲」——这就是「明明有歌却一输入就空」的主因。
     新实现：
       1) 所有平台同一时刻并发（酷狗 3.8s、其它允许到 10.5s），谁的 songs 先到先渲染；
          首个结果最多等 4s，其它平台后台增量补（mrMergeBackgroundSearch，不重排不闪烁）；
       2) 4s 内没有任何歌时**不判空**：先把空态换成「网络较慢，仍在搜索…」+ 可点重试，
          继续等第一轮在途请求（最多 11.2s，跨网实测网易云偶发 11.6s 才回）；
       3) 只有「所有平台都正常返回空」才算真空态；「快速失败」（全部在本机 2.6s 内返回
          错误/空包，通常是旧空包缓存残留）才带 mrrerun 自动重试一次 4s；
       4) 终态失败时 window.searchProviderNotice 设成「网络较慢，点此重试」，
          patchSearchFailSemantics 再把空态换成可点击重试按钮（带 mrrerun 重搜）。 */
  var MR_SEARCH_LIMIT_DEFAULT = 12;
  var MR_SEARCH_KUGOU_BUDGET = 3800;      /* 酷狗慢是常态：只给短预算，别拖整页 */
  var MR_SEARCH_PROVIDER_BUDGET = 10500;  /* 其它平台允许慢（跨网实测网易云偶发 11.6s） */
  var MR_SEARCH_FIRST_BUDGET = 4000;      /* 4s 内有歌立刻渲染；没有则先给「仍在搜索」提示 */
  var MR_SEARCH_TOTAL_BUDGET = 11200;     /* 第一轮最多等这么久（低于缓存层 12s 哨兵） */
  var MR_SEARCH_RETRY_BUDGET = 4000;
  var MR_SEARCH_FAST_FAIL_MS = 2600;      /* 全套失败都发生在这个时间内 → 可能是旧空包缓存 */

  function mrSearchBustUrl(url, stamp) {
    if (!url) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'mrrerun=' + (stamp || Date.now());
  }

  function mrSearchItemSongs(item) {
    if (!item || !item.value) return [];
    return Array.isArray(item.value.songs) ? item.value.songs : [];
  }

  /* 响应是否可信：超时、异常、{error}、非对象一律不可信（空包在缓存层已不存，这里再兜底） */
  function mrSearchItemTrustworthy(item) {
    if (!item) return false;
    if (item.timeout || item.error) return false;
    if (!item.value || typeof item.value !== 'object') return false;
    if (item.value.error || item.value.ok === false) return false;
    return true;
  }

  /* 单平台请求：限时 + 超时/错误结构化（不冒泡），bustSeed 非 0 时带 mrrerun 绕过缓存 */
  function mrSearchRunProvider(provider, q, budget, bustSeed) {
    var limit = MR_SEARCH_PAGE_LIMITS[provider] || MR_SEARCH_LIMIT_DEFAULT;
    var url = '';
    try { url = window.searchProviderUrl(provider, q, limit, 0); } catch (e) { url = ''; }
    if (!url) return Promise.resolve({ provider: provider, limit: limit, value: null, error: 'NO_URL', ms: 0 });
    if (bustSeed) url = mrSearchBustUrl(url, bustSeed);
    var t0 = performance.now();
    return Promise.race([
      mrNetApiJson(url, budget).then(function (value) {
        return { provider: provider, limit: limit, value: value || {}, url: url, ms: Math.round(performance.now() - t0) };
      }).catch(function (err) {
        return { provider: provider, limit: limit, value: null, url: url, ms: Math.round(performance.now() - t0), error: String((err && err.message) || err) };
      }),
      mrNetSearchTimeout(budget + 300).then(function () {
        return { provider: provider, limit: limit, value: null, url: url, ms: Math.round(performance.now() - t0), timeout: true };
      })
    ]);
  }

  function mrSearchBuildResult(items, q) {
    var pp = {};
    var pools = { netease: [], qq: [], kugou: [], qishui: [], spotify: [] };
    var extra = [];
    (items || []).forEach(function (item) {
      if (!item || !item.value) return;
      var songs = Array.isArray(item.value.songs) ? item.value.songs : [];
      pp[item.provider] = mrNetProviderPageInfo(item.value, item.limit);
      if (pools[item.provider]) pools[item.provider] = pools[item.provider].concat(songs);
      else extra = extra.concat(songs);
    });
    var songs = [];
    try {
      songs = window.mergeSongSearchResults(pools.netease, pools.qq, pools.kugou, pools.qishui, pools.spotify, 60, q).concat(extra);
    } catch (e) { }
    return { songs: songs, providerPages: pp, hasMore: false };
  }

  function patchProgressiveSearch() {
    if (window.__mrProgressiveSearchV104) return true;
    if (typeof window.fetchMusicSearchResults !== 'function') return false;
    if (typeof window.searchProviderUrl !== 'function' || typeof window.activeSearchProvidersForMode !== 'function') return false;
    if (typeof window.mergeSongSearchResults !== 'function') return false;
    window.__mrProgressiveSearchV104 = 1;
    window.__mrProgressiveSearch = 1;
    var raw = window.fetchMusicSearchResults;
    window.fetchMusicSearchResults = async function (q, mode, previousPages) {
      try {
        /* 翻页仍走宿主原逻辑（此时已有首屏结果，慢一点不影响） */
        if (previousPages) return raw.apply(this, arguments);
        var providers = window.activeSearchProvidersForMode(mode) || [];
        if (providers.length < 2) return raw.apply(this, arguments);
        var query = String(q || '').trim();
        var key = '';
        try { key = window.searchResultKey(query, mode); } catch (e) { key = ''; }
        var forceBust = Number(window.__mrSearchBust) || 0;
        if (forceBust) window.__mrSearchBust = 0;
        var outcome = {
          q: query, mode: mode, key: key, t0: performance.now(),
          anySongs: false, failed: false, bust: forceBust, doneMs: 0
        };
        window.__mrSearchOutcome = outcome;
        window.__mrSearchT0 = outcome.t0;
        window.searchProviderNotice = '';

        function finish(items, failed) {
          var result = mrSearchBuildResult(items, query);
          outcome.doneMs = Math.round(performance.now() - outcome.t0);
          if (result.songs.length) {
            outcome.anySongs = true;
            try { mrNetStat.searchMs.push(outcome.doneMs); if (mrNetStat.searchMs.length > 20) mrNetStat.searchMs.shift(); } catch (e) { }
            var doneSet = {};
            (items || []).forEach(function (it) { if (it && it.provider) doneSet[it.provider] = 1; });
            var rest = providers.filter(function (p) { return !doneSet[p]; });
            if (key && rest.length) {
              window.setTimeout(function () { mrMergeBackgroundSearch(query, mode, key, result.providerPages, rest); }, 80);
            }
          } else {
            outcome.failed = !!failed;
            if (failed) window.searchProviderNotice = '网络较慢，点此重试';
          }
          return result;
        }

        /* ---- 第一轮：全平台同时发，先有歌先渲染 ---- */
        var items = [];
        var first = await Promise.race([
          new Promise(function (resolve) {
            var remaining = providers.length;
            var settled = false;
            providers.forEach(function (p) {
              var budget = p === 'kugou' ? MR_SEARCH_KUGOU_BUDGET : MR_SEARCH_PROVIDER_BUDGET;
              mrSearchRunProvider(p, query, budget, forceBust).then(function (item) {
                items.push(item);
                if (settled) return;
                if (item.value && mrSearchItemSongs(item).length) { settled = true; resolve(item); }
                else if (--remaining === 0) { settled = true; resolve(null); }
              });
            });
          }),
          mrNetSearchTimeout(MR_SEARCH_FIRST_BUDGET).then(function () { return undefined; })
        ]);
        if (first) {
          /* 给「几乎同时到」的平台 ~200ms 汇合，尽量一次渲染，减少二次 append */
          await Promise.race([
            mrNetSearchTimeout(220),
            new Promise(function (resolve) {
              (function check() {
                if (items.filter(function (it) { return it && it.value; }).length >= providers.length) return resolve();
                window.setTimeout(check, 40);
              })();
            })
          ]);
          return finish(items, false);
        }

        /* ---- 4s 内没有歌：不急着判空，先给「网络较慢，仍在搜索」的可重试提示，继续等在途请求 ---- */
        try { mrSearchShowSlowHint(query); } catch (e) { }
        var slowHit = await Promise.race([
          new Promise(function (resolve) {
            (function check() {
              for (var i = 0; i < items.length; i++) {
                if (items[i] && items[i].value && mrSearchItemSongs(items[i]).length) return resolve(items[i]);
              }
              if (items.length >= providers.length) return resolve(null);
              window.setTimeout(check, 60);
            })();
          }),
          mrNetSearchTimeout(Math.max(800, MR_SEARCH_TOTAL_BUDGET - MR_SEARCH_FIRST_BUDGET)).then(function () { return undefined; })
        ]);
        if (slowHit) return finish(items, false);
        var allSettled = items.length >= providers.length;
        var allValidEmpty = allSettled && items.every(function (it) {
          return mrSearchItemTrustworthy(it) && mrSearchItemSongs(it).length === 0;
        });
        if (allValidEmpty) return finish(items, false);
        /* 只有「快速失败」才自动带 mrrerun 重试一次：慢网络下重试只会加重排队，直接给可重试提示 */
        var elapsed = performance.now() - outcome.t0;
        if (elapsed < MR_SEARCH_FAST_FAIL_MS) {
          outcome.autoRetried = true;
          var retrySeed = Date.now();
          var retryItems = [];
          var retryFirst = await Promise.race([
            new Promise(function (resolve) {
              var remaining = providers.length;
              var settled = false;
              providers.forEach(function (p) {
                mrSearchRunProvider(p, query, MR_SEARCH_RETRY_BUDGET, retrySeed).then(function (item) {
                  retryItems.push(item);
                  if (settled) return;
                  if (item.value && mrSearchItemSongs(item).length) { settled = true; resolve(item); }
                  else if (--remaining === 0) { settled = true; resolve(null); }
                });
              });
            }),
            mrNetSearchTimeout(MR_SEARCH_RETRY_BUDGET + 500).then(function () { return undefined; })
          ]);
          var merged = items.concat(retryItems);
          if (retryFirst) return finish(merged, false);
          var retryValidEmpty = retryItems.length >= providers.length && retryItems.every(function (it) {
            return mrSearchItemTrustworthy(it) && mrSearchItemSongs(it).length === 0;
          });
          return finish(merged, !retryValidEmpty);
        }
        return finish(items, true);
      } catch (e) {
        return raw.apply(this, arguments);
      }
    };
    return true;
  }

  /* ---- v104-search：空态语义 + 可点击重试 ----
     宿主 doSearch 在 songs 为空时渲染「没有找到相关歌曲」（或 searchProviderNotice）。
     我们只在「所有平台明确返回空」时保留原文案；超时/失败时换成可重试提示，
     点击带 mrrerun 重搜（window.__mrSearchBust 由渐进搜索消费）。 */
  function mrSearchEsc(s) {
    try { if (typeof window.escHtml === 'function') return window.escHtml(String(s == null ? '' : s)); } catch (e) { }
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mrSearchBindRetryBtn(btn, query) {
    if (!btn) return;
    btn.addEventListener('click', function (ev) {
      try { ev.preventDefault(); ev.stopPropagation(); } catch (e) { }
      window.__mrSearchBust = Date.now();
      var inp = document.getElementById('search-input');
      var target = query || String((inp && inp.value) || '').trim();
      if (!target) return;
      try { if (typeof window.doSearch === 'function') window.doSearch(target); } catch (e) { }
    });
  }

  /* 慢网络中间态：4s 还没歌时先把「正在搜索」换成可重试提示（结果到了宿主会直接覆盖） */
  function mrSearchShowSlowHint(q) {
    var res = document.getElementById('search-results');
    if (!res || res.querySelector('.search-result')) return;
    var box = res.querySelector('.search-empty:not(.search-load-more)');
    if (!box || box.querySelector('.mr-search-slow')) return;
    box.classList.add('mr-search-slow');
    box.innerHTML = '<div class="mr-search-slow-text">网络较慢，仍在搜索 “' + mrSearchEsc(q) + '”…</div>' +
      '<button type="button" class="mr-search-retry-btn mr-search-slow-btn">点此重试</button>';
    mrSearchBindRetryBtn(box.querySelector('.mr-search-slow-btn'), q);
  }

  function mrSearchDecorateEmpty(q) {
    var o = window.__mrSearchOutcome;
    if (!o || !o.failed) return;
    var query = String(q || '').trim();
    if (query && o.q && query !== o.q) return;
    var res = document.getElementById('search-results');
    if (!res || res.querySelector('.search-result')) return;
    var box = res.querySelector('.search-empty:not(.search-load-more)');
    if (!box || box.querySelector('.mr-search-retry')) return;
    box.classList.add('mr-search-retry');
    box.innerHTML = '<div class="mr-search-retry-title">网络较慢，没能加载到歌曲</div>' +
      '<button type="button" class="mr-search-retry-btn">点此重试</button>' +
      (o.autoRetried ? '<div class="mr-search-retry-sub">已自动重试过一次</div>' : '');
    mrSearchBindRetryBtn(box.querySelector('.mr-search-retry-btn'), query);
  }

  function patchSearchFailSemantics() {
    if (window.__mrSearchSemantics) return true;
    if (typeof window.doSearch !== 'function') return false;
    window.__mrSearchSemantics = 1;
    var rawDoSearch = window.doSearch;
    window.doSearch = async function (q) {
      var args = arguments;
      var input = document.getElementById('search-input');
      var query = String(q != null ? q : (input && input.value) || '').trim();
      try {
        return await rawDoSearch.apply(this, args);
      } finally {
        try { mrSearchDecorateEmpty(query); } catch (e) { }
      }
    };
    return true;
  }

  /* v104-net：下一首歌词/封面预取（起播让路，播放稳定后空闲期才打） */
  var mrPrefetchAuxState = { lyricUrl: '', coverUrl: '' };
  function mrNextQueueSongForPrefetch() {
    try {
      var q = window.playQueue;
      var idx = window.currentIdx;
      if (!q || !q.length || typeof idx !== 'number' || idx < 0) return null;
      var next = q[idx + 1];
      if (!next) return null;
      if (next.type === 'local' || next.source === 'local' || next.localUrl) return null;
      return next;
    } catch (e) { return null; }
  }
  function mrPrefetchNextLyric() {
    try {
      var next = mrNextQueueSongForPrefetch();
      if (!next) return;
      if (typeof window.lyricEndpointForSong !== 'function') return;
      var url = '';
      try { url = window.lyricEndpointForSong(next); } catch (e) { url = ''; }
      if (!url || mrPrefetchAuxState.lyricUrl === url) return;
      mrPrefetchAuxState.lyricUrl = url;
      /* 走补丁缓存层：切歌时宿主再请求同一条 URL 就是 0ms 命中（冷歌词实测 1.9s） */
      try { fetch(url).catch(function () { }); } catch (e) { }
    } catch (e) { }
  }
  function mrPrefetchNextCover() {
    try {
      if (typeof window.__mrLoadCoverObjectUrl !== 'function') return;
      var next = mrNextQueueSongForPrefetch();
      if (!next) return;
      var src = '';
      try { src = typeof window.songCoverSrc === 'function' ? window.songCoverSrc(next, 400) : ''; } catch (e) { src = ''; }
      if (!src || src.indexOf('http') !== 0) return;
      if (mrPrefetchAuxState.coverUrl === src) return;
      mrPrefetchAuxState.coverUrl = src;
      /* 原生桥取字节 → dataURI；shim 内有 24 条缓存，切歌时封面直接命中 */
      try { window.__mrLoadCoverObjectUrl(src).catch(function () { }); } catch (e) { }
    } catch (e) { }
  }

  /* v104-net P3：冷启动空闲期预取当前曲（用户点播放时取址已是缓存命中） */
  var mrBootPrefetchState = { done: '', timer: 0, info: null };
  function mrPrefetchCurrentTrack(reason) {
    try {
      if (document.hidden) return false;
      if (typeof window.resolveAlbumGaplessPlaybackData !== 'function') return false;
      if (mrPlayPending.at) return false;          /* 用户正在起播：让宿主自己解析，别重复 */
      var q = window.playQueue;
      var idx = window.currentIdx;
      if (!q || !q.length || typeof idx !== 'number' || idx < 0) return false;
      var cur = q[idx];
      if (!cur) return false;
      if (cur.type === 'local' || cur.source === 'local' || cur.localUrl) return false;
      var a = window.audio;
      if (a && !a.paused && (a.currentTime || 0) > 0) return false;
      var key = String(cur.hash || cur.mid || cur.id || '') + '|' + String(cur.name || '') + '|' + idx;
      if (mrBootPrefetchState.done === key) return false;
      mrBootPrefetchState.done = key;
      var t0 = performance.now();
      window.resolveAlbumGaplessPlaybackData(cur).then(function (data) {
        var info = { key: key, ms: Math.round(performance.now() - t0), ok: !!(data && data.url), reason: reason };
        mrBootPrefetchState.info = info;
        try { mrNetStat.bootPrefetch = info; } catch (e) { }
      }).catch(function () {
        mrBootPrefetchState.info = { key: key, ms: Math.round(performance.now() - t0), ok: false, err: 1, reason: reason };
        try { mrNetStat.bootPrefetch = mrBootPrefetchState.info; } catch (e) { }
      });
      return true;
    } catch (e) { return false; }
  }
  function mrScheduleBootPrefetch() {
    /* v104 实测：跨网（柏林→国内 350ms RTT）冷启 4.5s 预取一次耗时 5.8s 且失败，
       而原生桥是串行的（并发 3 条 wall 1394ms），会占用首屏之后的请求通道 → **默认关闭**。
       需要时置 window.__mrBootPrefetch = 1 打开（v105 计划改成「进入播放页/点播放时才预取」）。 */
    if (!window.__mrBootPrefetch) return;
    if (mrBootPrefetchState.timer) return;
    mrBootPrefetchState.timer = 1;
    /* 4.5s：首屏网络（首页推荐/歌单）基本结束；9s：队列恢复晚或首发失败时补一枪 */
    window.setTimeout(function () { try { mrPrefetchCurrentTrack('boot-4.5s'); } catch (e) { } }, 4500);
    window.setTimeout(function () { try { mrPrefetchCurrentTrack('boot-9s'); } catch (e) { } }, 9000);
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
      /* v104-net：播放稳定后再预取下一首歌词/封面，避免抢起播的 /api 往返 */
      window.setTimeout(mrPrefetchNextLyric, 2300);
      window.setTimeout(mrPrefetchNextCover, 2800);
    }, true);
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#play-btn, .control-prev, .control-next, .song-next, .queue-item')) {
        mrPrefetchState.key = '';
        mrPrefetchAuxState.lyricUrl = '';
        mrPrefetchAuxState.coverUrl = '';
        window.setTimeout(mrPrefetchNextTrack, 2500);
      }
    }, true);
    return true;
  }


  /* ===== v95：网络计时（F）+ 关键路径瘦身（C） =====
     C1：like/check 合并防抖 + 按 hash 记忆（同一批 hash 再次出现直接本地合成响应）；
     C2：歌词请求在「正在起播」期间延后到真正出声之后（最多 2.5s）。
     F ：把 /api 请求耗时、搜索首条耗时、起播耗时、音频缓存状态收在一张小面板里（三点菜单→网络）。 */
  var MR_NET_KEEP = 200;
  var mrNetStat = (window.__mrNetStats = window.__mrNetStats || {
    reqs: [], searchMs: [], playMs: [], likeSkip: 0, lyricDeferred: 0,
    dedupe: 0, negHit: 0, negStore: 0, err: 0, timeout: 0,
    hits: { mem: 0, db: 0, neg: 0, like: 0 }
  });
  try {
    /* 老会话（升级前已创建）补齐 v104-net 新字段 */
    if (!mrNetStat.hits) mrNetStat.hits = { mem: 0, db: 0, neg: 0, like: 0 };
    if (mrNetStat.dedupe == null) mrNetStat.dedupe = 0;
    if (mrNetStat.negHit == null) mrNetStat.negHit = 0;
    if (mrNetStat.negStore == null) mrNetStat.negStore = 0;
    if (mrNetStat.err == null) mrNetStat.err = 0;
    if (mrNetStat.timeout == null) mrNetStat.timeout = 0;
  } catch (e) { }

  /* v104-net：机器可读的网络摘要（真机脚本/回归直接读，不必解析面板 DOM） */
  function mrNetSummary() {
    var st = mrNetStat;
    var agg = {};
    (st.reqs || []).forEach(function (r) {
      var k = r.k || 'other';
      if (!agg[k]) agg[k] = { n: 0, hits: 0, netMs: 0, netN: 0 };
      agg[k].n += 1;
      if (r.c) agg[k].hits += 1;
      else { agg[k].netN += 1; agg[k].netMs += (r.ms || 0); }
    });
    Object.keys(agg).forEach(function (k) {
      var a = agg[k];
      a.avgNetMs = a.netN ? Math.round(a.netMs / a.netN) : 0;
      delete a.netMs;
    });
    return {
      total: (st.reqs || []).length,
      hits: st.hits || {}, dedupe: st.dedupe || 0, negHit: st.negHit || 0,
      negStore: st.negStore || 0, err: st.err || 0, timeout: st.timeout || 0,
      likeSkip: st.likeSkip || 0, lyricDeferred: st.lyricDeferred || 0,
      playMs: (st.playMs || []).slice(-10), searchMs: (st.searchMs || []).slice(-10),
      byKind: agg
    };
  }
  try { window.__mrNetSummary = mrNetSummary; } catch (e) { }

  function mrNetRec(kind, url, ms, cached, src) {
    try {
      var list = mrNetStat.reqs;
      var msR = Math.round(ms);
      var from = src || '';
      list.push({ k: kind, u: String(url || '').slice(0, 120), ms: msR, c: !!cached, s: from, t: Date.now() });
      if (list.length > MR_NET_KEEP) list.splice(0, list.length - MR_NET_KEEP);
      var st = mrNetStat;
      if (!st.hits) st.hits = { mem: 0, db: 0, neg: 0, like: 0 };
      if (cached) {
        if (from === 'db') st.hits.db += 1;
        else if (from === 'neg') st.hits.neg += 1;
        else if (from === 'like') st.hits.like += 1;
        else st.hits.mem += 1;
      }
      if (from === 'err') st.err = (st.err || 0) + 1;
      if (from === 'timeout') st.timeout = (st.timeout || 0) + 1;
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

  /* ---- v104-net：CDN 地址过期（audio 报错）→ 作废对应 song/url 缓存，防反复失败 ---- */
  var mrSongUrlInvalidateBound = 0;
  function mrBindSongUrlInvalidate() {
    if (mrSongUrlInvalidateBound) return true;
    mrSongUrlInvalidateBound = 1;
    document.addEventListener('error', function (ev) {
      var t = ev.target;
      if (!t || t.tagName !== 'AUDIO') return;
      try {
        var src = String(t.currentSrc || t.src || '');
        if (!src || src.indexOf('/api/') === 0) return;
        var st = window.__mrApiCacheState;
        if (!st) return;
        var dirty = [];
        Object.keys(st.urlMem || {}).forEach(function (k) {
          var rec = st.urlMem[k];
          if (rec && rec.d && rec.d.url === src) { delete st.urlMem[k]; dirty.push(k); }
        });
        Object.keys(st.mem || {}).forEach(function (k) {
          var rec = st.mem[k];
          if (rec && rec.d && rec.d.url === src) delete st.mem[k];
        });
        try { st.urlNeg = Object.create(null); } catch (e) { }
        try { st.urlNegById = Object.create(null); } catch (e) { }
        if (dirty.length && st.dbPromise) {
          st.dbPromise.then(function (db) {
            if (!db) return;
            try {
              var tx = db.transaction(st.store, 'readwrite');
              dirty.forEach(function (k) { try { tx.objectStore(st.store).delete(k); } catch (e) { } });
            } catch (e) { }
          });
        }
        try { mrNetRec('songurl', src, 0, false, 'invalidate'); } catch (e) { }
      } catch (e) { }
    }, true);
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
    var hits = st.hits || { mem: 0, db: 0, neg: 0, like: 0 };
    /* v104-net：按 kind 的实际网络耗时平均（不含缓存命中），起播/歌词/封面一眼可见 */
    var kindAgg = {};
    st.reqs.forEach(function (r) {
      if (r.c) return;
      var k = r.k || 'other';
      if (!kindAgg[k]) kindAgg[k] = { n: 0, ms: 0 };
      kindAgg[k].n += 1; kindAgg[k].ms += (r.ms || 0);
    });
    var kindAvgText = Object.keys(kindAgg).map(function (k) {
      return k + ' ' + Math.round(kindAgg[k].ms / kindAgg[k].n) + 'ms';
    }).slice(0, 4).join(' · ');
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
      '<div><b>' + cacheHits + ' / ' + st.reqs.length + '</b><small>缓存命中 mem ' + hits.mem + ' · db ' + hits.db + ' · neg ' + hits.neg + '</small></div>' +
      '<div><b>' + st.likeSkip + '</b><small>like 省掉 · 去重 ' + (st.dedupe || 0) + '</small></div>' +
      '</div>' +
      '<div class="mr-net-sec">平均网络耗时：' + (kindAvgText || '—') + (st.negStore ? ' · 失败未缓存 ' + st.negStore : '') + '</div>' +
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
          mrNetStat.dedupe = 0; mrNetStat.negHit = 0; mrNetStat.negStore = 0;
          mrNetStat.err = 0; mrNetStat.timeout = 0;
          mrNetStat.hits = { mem: 0, db: 0, neg: 0, like: 0 };
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


  /* ===== v103：v99/v101 的「假名→罗马音」规则推导与 ±0.6s 最近时间贴行已整段删除，
     注音改为只显示歌词文件自带的注音行，实现见下方 v103 区段。 ===== */

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


  /* ===== v103：音/译 —— 注音只显示歌词文件自带的注音行 =====

     用户口径（不可偏离）：歌词界面的「音」必须直接显示歌词文件里自带的注音行
     （网易云 romalrc / yromalrc、QQ roma），按歌词文件自身行结构一行对一行挂在原文
     下方，用宿主「译文」那套小字行渲染，原样显示文件内容（保留大小写/空格）。
     v99/v101 的「假名→罗马音」规则表（MR_ROMA_TABLE / MR_ROMA_COMBOS /
     mrKanaToRomaji / mrHasKana / mrApplyRomajiLines）与「±0.6s 最近时间贴行」
     （mrApplyProviderRoma / mrParseLrcMap）已整段删除，不留兜底生成路径。

     数据通路（全部走 App 内网 /api，不直连外网）：
       宿主 /api/lyric（网易云：romalrc / yromalrc 字符串）
       宿主 /api/qq/lyric（QQ：roma 字符串）
       宿主 /api/kugou/lyric（酷狗：只有 lyric/trans，没有注音 → 隐藏「音」）
         ↓ 在宿主 parseLyricResponseToOriginalState(song, response) 处截获同一份响应
       按 song key 解析出 [{t, text}]（逐词时间标签合并为一整行；只去首尾空白）
         ↓ 内存 + localStorage 缓存（7 天，最多 80 首）
       与当前歌词行按「同一份歌词文件的时间标签」严格一对一配对
       （① 时间戳完全相同；② 仅对未配上的行用 ±0.12s 唯一一对一补配；都不猜行）
         ↓ 写进 line.translation（宿主小字行渲染用的字段）
       宿主 setOriginalLyricsState + applyPreferredLyricsForCurrent 重绘；
       fx.lyricTranslationMode（off/multi）控制小字行显示。
     「音」与「译」互斥：开音时清掉宿主译文，关音恢复宿主原始译文状态；
     没有注音→隐藏「音」，没有译文→隐藏「译」，都没有→整组消失。 */

  var MR_AUX_MODE_KEY = 'mr-lyric-aux-mode-v2';
  var MR_ROMA_CACHE_KEY = 'mr-lyric-roma-v3';
  var MR_ROMA_CACHE_MAX = 80;
  var MR_ROMA_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
  var MR_ROMA_MISS_TTL = 10 * 60 * 1000;
  var MR_AUX_TIGHT_TOL = 0.12;
  var mrAux = {
    mode: 'off',
    state: null,
    applying: false,
    appliedSig: '',
    romaMem: Object.create(null),
    romaMissMem: Object.create(null),
    romaPending: Object.create(null),
    romaStore: null,
    btnRoma: null,
    btnTrans: null,
    refreshTimer: 0,
    applyTimer: 0,
    version: 0
  };

  function mrAuxCurrentSong() {
    try {
      if (typeof currentLyricSong === 'function') return currentLyricSong();
    } catch (e) { }
    try {
      var q = window.playQueue || [];
      var i = typeof currentIdx === 'number' ? currentIdx : window.currentIdx;
      return (i >= 0 && q[i]) ? q[i] : null;
    } catch (e2) { return null; }
  }
  function mrAuxSongKey(song) {
    song = song || {};
    try {
      if (typeof persistentLyricCacheKey === 'function') {
        var k = persistentLyricCacheKey(song);
        if (k) return String(k);
      }
    } catch (e) { }
    var provider = '';
    try {
      provider = String(typeof songProviderKey === 'function' ? songProviderKey(song) : (song.provider || song.source || ''));
    } catch (e2) { provider = String(song.provider || song.source || ''); }
    var id = song.id || song.mid || song.songmid || song.hash || '';
    if (!provider && !id) return '';
    return [provider, id, song.name || song.title || '', song.artist || ''].join('|');
  }
  function mrAuxCloneLine(line) {
    var copy = {};
    for (var k in line) {
      if (Object.prototype.hasOwnProperty.call(line, k)) copy[k] = line[k];
    }
    if (line && Array.isArray(line.words)) {
      copy.words = line.words.map(function (w) {
        var n = {};
        for (var k2 in w) { if (Object.prototype.hasOwnProperty.call(w, k2)) n[k2] = w[k2]; }
        return n;
      });
    }
    return copy;
  }
  function mrAuxCloneLines(lines) {
    return (Array.isArray(lines) ? lines : []).map(mrAuxCloneLine);
  }
  function mrAuxPlayerPage() {
    try { return document.body.classList.contains('mr-player-page'); } catch (e) { return false; }
  }
  function mrAuxToast(text) {
    try { if (typeof window.showToast === 'function') window.showToast(text); } catch (e) { }
  }

  /* ---- 注音行解析：只做「取时间标签 + 把同一物理行的多个标签拼回一整行」，不改写内容 ---- */
  function mrAuxRomaTextFromResponse(response) {
    response = response || {};
    function pick(value) {
      if (!value) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'object') return String(value.lyric || value.text || value.content || '');
      return '';
    }
    var table = [
      ['netease-romalrc', response.romalrc],
      ['qq-roma', response.roma],
      ['netease-yromalrc', response.yromalrc]
    ];
    for (var i = 0; i < table.length; i += 1) {
      var text = pick(table[i][1]);
      if (!text) continue;
      if (/\[\d{1,2}:\d{1,2}/.test(text) || /\[\d+,\d+\]/.test(text)) {
        return { text: text, source: table[i][0] };
      }
    }
    return { text: '', source: '' };
  }
  function mrAuxFinalizeRomaLines(lines) {
    var out = [];
    var seen = Object.create(null);
    (lines || []).forEach(function (line) {
      var t = Number(line && line.t);
      var text = String((line && line.text) || '').replace(/^\s+|\s+$/g, '');
      if (!isFinite(t) || t < 0 || !text) return;
      var ms = Math.round(t * 1000);
      if (seen[ms]) return;
      seen[ms] = 1;
      out.push({ t: ms / 1000, text: text });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }
  function mrParseRomaText(text) {
    var raw = String(text || '');
    if (!raw) return [];
    /* ① YRC / QRC 风格（[起始ms,时长ms](偏移,时长,0)字…）：交给宿主 parseYrcText 拼回整行 */
    if (/\[\d+,\d+\]/.test(raw) && typeof window.parseYrcText === 'function') {
      try {
        var yrcLines = window.parseYrcText(raw) || [];
        var out = [];
        yrcLines.forEach(function (line) {
          if (line && line.text) out.push({ t: Number(line.t) || 0, text: String(line.text) });
        });
        if (out.length) return mrAuxFinalizeRomaLines(out);
      } catch (e) { }
    }
    /* ② LRC 风格：同一物理行里可能带多个时间标签（逐词/分段打标签），必须拼回一整行 */
    var parsed = [];
    var tagReg = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    String(raw).split(/\r?\n/).forEach(function (line) {
      var tags = [];
      var m;
      tagReg.lastIndex = 0;
      while ((m = tagReg.exec(line))) {
        var t = (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
        if (m[3]) t += (parseInt(m[3], 10) || 0) / Math.pow(10, Math.min(3, m[3].length));
        tags.push({ t: t, start: m.index, end: tagReg.lastIndex });
      }
      if (!tags.length) return;
      var segs = [];
      for (var i = 0; i < tags.length; i += 1) {
        var seg = line.slice(tags[i].end, i + 1 < tags.length ? tags[i + 1].start : line.length);
        seg = seg.replace(/^\s+|\s+$/g, '');
        if (seg) segs.push(seg);
      }
      var full = segs.join(' ');
      if (!full) return;
      parsed.push({ t: tags[0].t, text: full });
    });
    return mrAuxFinalizeRomaLines(parsed);
  }

  /* ---- 注音缓存（内存 + localStorage；按 song key，TTL 7 天） ---- */
  function mrAuxStoreLoad() {
    if (mrAux.romaStore) return mrAux.romaStore;
    var data = null;
    try { data = JSON.parse(window.localStorage.getItem(MR_ROMA_CACHE_KEY) || '{}'); } catch (e) { data = null; }
    mrAux.romaStore = (data && typeof data === 'object') ? data : {};
    return mrAux.romaStore;
  }
  function mrAuxStoreGet(key) {
    if (!key) return null;
    var store = mrAuxStoreLoad();
    var item = store[key];
    if (!item || !item.l || !item.l.length) return null;
    if (item.at && Date.now() - item.at > MR_ROMA_CACHE_TTL) { delete store[key]; return null; }
    var lines = [];
    for (var i = 0; i < item.l.length; i += 1) {
      var pair = item.l[i];
      if (!pair || pair.length < 2) continue;
      var t = Number(pair[0]);
      var text = String(pair[1] || '').replace(/^\s+|\s+$/g, '');
      if (!isFinite(t) || !text) continue;
      lines.push({ t: t, text: text });
    }
    if (lines.length < 2) return null;
    var lrcLines = [];
    if (Array.isArray(item.lt)) {
      for (var j = 0; j < item.lt.length; j += 1) {
        var lpair = item.lt[j];
        if (!lpair || lpair.length < 2) continue;
        var lt = Number(lpair[0]);
        var ltext = String(lpair[1] || '').replace(/^s+|s+$/g, '');
        if (!isFinite(lt) || !ltext) continue;
        lrcLines.push({ t: lt, text: ltext });
      }
    }
    return { key: key, source: item.s || 'roma', lines: lines, lrcLines: lrcLines, at: item.at || 0 };
  }
  function mrAuxStorePut(key, rec) {
    if (!key || !rec || !rec.lines || rec.lines.length < 2) return;
    var store = mrAuxStoreLoad();
    store[key] = {
      s: rec.source || 'roma',
      at: Date.now(),
      l: rec.lines.map(function (line) {
        return [Math.round((Number(line.t) || 0) * 1000) / 1000, String(line.text || '')];
      }),
      lt: (rec.lrcLines || []).map(function (line) {
        return [Math.round((Number(line.t) || 0) * 1000) / 1000, String(line.text || '')];
      })
    };
    try {
      var keys = Object.keys(store);
      if (keys.length > MR_ROMA_CACHE_MAX) {
        keys.sort(function (a, b) { return (store[a] && store[a].at) - (store[b] && store[b].at); });
        var drop = keys.length - MR_ROMA_CACHE_MAX;
        for (var i = 0; i < drop; i += 1) delete store[keys[i]];
      }
      window.localStorage.setItem(MR_ROMA_CACHE_KEY, JSON.stringify(store));
    } catch (e) {
      /* 配额满了先丢本地持久化，内存里还有，不影响本次会话 */
      try { mrAux.romaStore = store; } catch (e2) { }
    }
  }
  function mrAuxRomaRec(key) {
    if (!key) return null;
    if (mrAux.romaMem[key]) return mrAux.romaMem[key];
    var rec = mrAuxStoreGet(key);
    if (rec) mrAux.romaMem[key] = rec;
    return rec || null;
  }
  function mrAuxMissSet(key) {
    if (key) mrAux.romaMissMem[key] = Date.now();
  }
  function mrAuxMissed(key) {
    var at = key && mrAux.romaMissMem[key];
    return !!(at && Date.now() - at < MR_ROMA_MISS_TTL);
  }

  /* ---- 从宿主歌词响应里截获注音（唯一来源；绝不由原文推导） ---- */
  function mrAuxCaptureRoma(song, response) {
    var key = mrAuxSongKey(song);
    if (!key || !response) return null;
    var found = mrAuxRomaTextFromResponse(response);
    if (!found.text) return null;
    var lines = mrParseRomaText(found.text);
    if (lines.length < 2) return null;
    var lrcLines = [];
    try {
      var lrcRaw = '';
      if (response) {
        if (typeof response.lyric === 'string') lrcRaw = response.lyric;
        else if (response.lyric && typeof response.lyric.lyric === 'string') lrcRaw = response.lyric.lyric;
        if (!lrcRaw && response.lrc && typeof response.lrc.lyric === 'string') lrcRaw = response.lrc.lyric;
      }
      if (lrcRaw && typeof window.parseLyricText === 'function') lrcLines = window.parseLyricText(lrcRaw);
    } catch (e) { lrcLines = []; }
    var rec = {
      key: key,
      source: found.source,
      lines: lines,
      lrcLines: Array.isArray(lrcLines) ? lrcLines : [],
      at: Date.now()
    };
    mrAux.romaMem[key] = rec;
    mrAuxStorePut(key, rec);
    delete mrAux.romaMissMem[key];
    var st = mrAux.state;
    if (st && st.key === key && mrAux.mode === 'roma') {
      st.romaChecked = false;
      st.roma = undefined;
      mrAuxScheduleApply(0);
    }
    return rec;
  }
  function mrAuxHookParse() {
    if (window.__mrLyricAuxParseHooked) return true;
    if (typeof window.parseLyricResponseToOriginalState !== 'function') return false;
    window.__mrLyricAuxParseHooked = 1;
    var rawParse = window.parseLyricResponseToOriginalState;
    window.parseLyricResponseToOriginalState = function (song, response) {
      var state = rawParse.apply(this, arguments);
      try { mrAuxCaptureRoma(song, response); } catch (e) { }
      return state;
    };
    return true;
  }

  function mrAuxTextKey(text) {
      return String(text || '').replace(/\s+/g, ' ').trim();
    }
    /* 假名骨架：同一句词在「YRC 主歌词」和「LRC 注音源歌词」里可能只是繁体/简体/异体字不同
       （例：神話/神话、蒼い/苍い），把汉字等非假名全部剔掉后骨架相同 → 认定为同一行。
       这只是在「同一首歌的两份歌词文本」之间找同一行，不参与任何注音内容生成。 */
    function mrAuxKanaKey(text) {
      var s = String(text || '');
      var out = '';
      for (var i = 0; i < s.length; i += 1) {
        var code = s.charCodeAt(i);
        if (code >= 0x3040 && code <= 0x30ff && s.charAt(i) !== '\u30fc') out += s.charAt(i);
      }
      return out;
    }
    /* ---- 严格一对一配对：注音行 ↔ 原歌词行（配对依据=歌词文件自身结构） ----
       ① 主歌词是 LRC 时：romalrc/roma 与 lrc 同一份文件、时间戳完全相同 → 按时间戳 1:1；
       ② 主歌词是 YRC（逐字，行首时间比 lrc 晚 0.1~0.3s）时：用同一份响应里的 lrc 行做中转，
          先把注音按时间戳贴到 lrc 行（同一份文件，仍然 1:1），再把 lrc 行对到 yrc 行：
          ②-0 两边行数相同 → 按行序平移；②-1 整行文字相同；②-1b 假名骨架相同；
          ②-2 剩下按 ±0.45s 唯一就近补，仍要求一对一；
       ③ 最后才允许 ±0.12s 唯一一对一（时间取整差异）。
       全程不做「按顺序猜行」的注音内容推导，配不上就留空，比例不足 50% 就不显示「音」。 */
    function mrAlignRomaToLines(lines, romaLines, source, lrcLines) {
      var base = Array.isArray(lines) ? lines : [];
      var roma = Array.isArray(romaLines) ? romaLines : [];
      if (base.length < 2 || roma.length < 2) return null;
      var romaByMs = Object.create(null);
      for (var r0 = 0; r0 < roma.length; r0 += 1) {
        var key0 = Math.round((Number(roma[r0].t) || 0) * 1000);
        if (!romaByMs[key0]) romaByMs[key0] = roma[r0];
      }
      var candidates = [];
      for (var i = 0; i < base.length; i += 1) {
        var line = base[i];
        if (!line || line.fallback) continue;
        var baseText = mrAuxTextKey(line.text);
        if (!baseText) continue;
        if (typeof window.isLyricCreditLineText === 'function') {
          try { if (window.isLyricCreditLineText(baseText)) continue; } catch (e) { }
        }
        candidates.push(i);
      }
      if (candidates.length < 2) return null;
      var assign = Object.create(null);
      var hits = 0;
      var phase = 'exact';
      function accept(idx, text) {
        var value = String(text || '').replace(/^\s+|\s+$/g, '');
        if (!value) return false;
        /* 注音行与原文完全同一句话（非日文歌的 romalrc 常见）→ 不算注音，宁可不显示 */
        if (mrAuxTextKey(value) === mrAuxTextKey(base[idx].text)) return false;
        assign[idx] = value;
        hits += 1;
        return true;
      }
      /* ① 时间戳完全相同 */
      var usedMs = Object.create(null);
      for (var c = 0; c < candidates.length; c += 1) {
        var idx = candidates[c];
        var ms = Math.round((Number(base[idx].t) || 0) * 1000);
        if (usedMs[ms]) continue;
        var hit = romaByMs[ms];
        if (hit && accept(idx, hit.text)) usedMs[ms] = 1;
      }
      /* ② 主歌词是 YRC：借同一份文件的 lrc 行做中转 */
      if (hits < candidates.length * 0.5 && Array.isArray(lrcLines) && lrcLines.length >= 2) {
        var lrcRoma = [];
        var lrcTextMap = Object.create(null);
        var lrcKanaMap = Object.create(null);
        for (var li = 0; li < lrcLines.length; li += 1) {
          var lline = lrcLines[li] || {};
          var lMs = Math.round((Number(lline.t) || 0) * 1000);
          var rHit = romaByMs[lMs];
          if (rHit) {
            var rText = String(rHit.text || '').replace(/^\s+|\s+$/g, '');
            if (rText && mrAuxTextKey(rText) !== mrAuxTextKey(lline.text)) lrcRoma[li] = rText;
          }
          var lKey = mrAuxTextKey(lline.text);
          if (lKey) lrcTextMap[lKey] = Object.prototype.hasOwnProperty.call(lrcTextMap, lKey) ? -1 : li;
          var lKana = mrAuxKanaKey(lline.text);
          if (lKana.length >= 2) lrcKanaMap[lKana] = Object.prototype.hasOwnProperty.call(lrcKanaMap, lKana) ? -1 : li;
        }
        var usedLrc = Object.create(null);
        /* ②-0 两份时间轴行数相同（同一份歌词文件的两个版本）→ 按行序 1:1 平移 */
        if (lrcLines.length === candidates.length) {
          var agree = 0;
          var checked = 0;
          for (var pi = 0; pi < candidates.length; pi += 1) {
            if (!lrcRoma[pi]) continue;
            checked += 1;
            var bKana = mrAuxKanaKey(base[candidates[pi]].text);
            var lKana = mrAuxKanaKey(lrcLines[pi].text);
            if (!bKana || !lKana || bKana === lKana) agree += 1;
          }
          if (checked >= 2 && agree >= checked * 0.6) {
            for (var pj = 0; pj < candidates.length; pj += 1) {
              var pIdx = candidates[pj];
              if (assign[pIdx] || !lrcRoma[pj]) continue;
              if (accept(pIdx, lrcRoma[pj])) usedLrc[pj] = 1;
            }
            phase = 'lrc-parallel';
          }
        }
        /* ②-1 整行文字相同 → 同一句词 */
        for (var c2 = 0; c2 < candidates.length; c2 += 1) {
          var idx2 = candidates[c2];
          if (assign[idx2]) continue;
          var lKey2 = mrAuxTextKey(base[idx2].text);
          var lIdx = lrcTextMap[lKey2];
          if (lIdx == null || lIdx < 0 || usedLrc[lIdx] || !lrcRoma[lIdx]) continue;
          if (accept(idx2, lrcRoma[lIdx])) { usedLrc[lIdx] = 1; if (phase === 'exact') phase = 'lrc-text'; }
        }
        /* ②-1b 假名骨架相同（繁体/简体/异体差异） */
        for (var c2b = 0; c2b < candidates.length; c2b += 1) {
          var idx2b = candidates[c2b];
          if (assign[idx2b]) continue;
          var bKana2 = mrAuxKanaKey(base[idx2b].text);
          if (bKana2.length < 2) continue;
          var lIdx2 = lrcKanaMap[bKana2];
          if (lIdx2 == null || lIdx2 < 0 || usedLrc[lIdx2] || !lrcRoma[lIdx2]) continue;
          if (accept(idx2b, lrcRoma[lIdx2])) { usedLrc[lIdx2] = 1; if (phase === 'exact') phase = 'lrc-kana'; }
        }
        /* ②-2 剩下按 ±0.45s 唯一一对一（同一首歌的两条时间轴） */
        for (var c3 = 0; c3 < candidates.length; c3 += 1) {
          var idx3 = candidates[c3];
          if (assign[idx3]) continue;
          var baseT = Number(base[idx3].t) || 0;
          var best = -1;
          var bestDelta = 0.46;
          for (var q = 0; q < lrcLines.length; q += 1) {
            if (usedLrc[q] || !lrcRoma[q]) continue;
            var delta = Math.abs((Number(lrcLines[q].t) || 0) - baseT);
            if (delta < bestDelta) { bestDelta = delta; best = q; }
          }
          if (best < 0) continue;
          var backCount = 0;
          var backIdx = -1;
          for (var c4 = 0; c4 < candidates.length; c4 += 1) {
            if (assign[candidates[c4]]) continue;
            if (Math.abs((Number(base[candidates[c4]].t) || 0) - (Number(lrcLines[best].t) || 0)) < 0.46) {
              backCount += 1;
              backIdx = candidates[c4];
            }
          }
          if (backCount !== 1 || backIdx !== idx3) continue;
          if (accept(idx3, lrcRoma[best])) { usedLrc[best] = 1; if (phase === 'exact' || phase === 'lrc-text' || phase === 'lrc-kana') phase = 'lrc-time'; }
        }
      }
      /* ③ ±0.12s 唯一一对一（时间取整差异），仍然不按顺序猜行 */
      if (hits < candidates.length) {
        var usedRoma = Object.create(null);
        for (var c5 = 0; c5 < candidates.length; c5 += 1) {
          var idx5 = candidates[c5];
          if (assign[idx5]) continue;
          var t5 = Number(base[idx5].t) || 0;
          var best5 = -1;
          var bestDelta5 = MR_AUX_TIGHT_TOL + 1;
          for (var r5 = 0; r5 < roma.length; r5 += 1) {
            if (usedRoma[r5]) continue;
            var d5 = Math.abs((Number(roma[r5].t) || 0) - t5);
            if (d5 <= MR_AUX_TIGHT_TOL && d5 < bestDelta5) { bestDelta5 = d5; best5 = r5; }
          }
          if (best5 < 0) continue;
          var backCount5 = 0;
          var backIdx5 = -1;
          for (var b5 = 0; b5 < candidates.length; b5 += 1) {
            if (Math.abs((Number(roma[best5].t) || 0) - (Number(base[candidates[b5]].t) || 0)) <= MR_AUX_TIGHT_TOL) {
              backCount5 += 1;
              backIdx5 = candidates[b5];
            }
          }
          if (backCount5 !== 1 || backIdx5 !== idx5) continue;
          if (accept(idx5, roma[best5].text)) { usedRoma[best5] = 1; if (phase === 'exact') phase = 'tight'; }
        }
      }
      if (hits < 2) return null;
      var ratio = hits / candidates.length;
      if (ratio < 0.5) return null;
      return {
        assign: assign,
        hits: hits,
        candidates: candidates.length,
        ratio: ratio,
        phase: phase,
        source: source || 'roma'
      };
    }

  /* ---- 基础歌词状态（宿主每次 setOriginalLyricsState 都留一份，音/译都从它重建） ---- */
  function mrAuxCaptureBase(lines, hasKaraoke, timingSource, translationLines, translationSource) {
    var safeLines = Array.isArray(lines) ? lines : [];
    var song = mrAuxCurrentSong();
    var key = mrAuxSongKey(song);
    mrAux.version += 1;
    mrAux.state = {
      key: key,
      version: mrAux.version,
      lines: mrAuxCloneLines(safeLines),
      hasKaraoke: !!hasKaraoke,
      timingSource: timingSource || 'fallback',
      translationLines: mrAuxCloneLines(Array.isArray(translationLines) ? translationLines : []),
      translationSource: translationSource || 'none',
      roma: undefined,
      romaChecked: false,
      romaFetching: 0
    };
    return mrAux.state;
  }
  function mrAuxAdoptHostState() {
    var st = mrAux.state;
    if (st && st.lines && st.lines.length) return false;
    var host = null;
    try { host = window.originalLyricsState; } catch (e) { host = null; }
    if (!host || !Array.isArray(host.lines) || !host.lines.length) return false;
    mrAuxCaptureBase(host.lines, host.hasNativeKaraoke, host.timingSource, host.translationLines, host.translationSource);
    mrAuxApplyNow(true);
    return true;
  }
  function mrAuxAlignedRoma(st) {
    st = st || mrAux.state;
    if (!st || !st.lines || st.lines.length < 2) return null;
    if (st.romaChecked) return st.roma;
    st.romaChecked = true;
    st.roma = null;
    var rec = st.key ? mrAuxRomaRec(st.key) : null;
    if (rec) st.roma = mrAlignRomaToLines(st.lines, rec.lines, rec.source, rec.lrcLines);
    if (!st.roma && st.key && mrAuxLooksJapanese(st) && !mrAuxMissed(st.key)) mrAuxKickRomaFetch(st);
    return st.roma;
  }
  function mrAuxHasTranslation(st) {
    st = st || mrAux.state;
    if (!st) return false;
    if (st.translationLines && st.translationLines.length) return true;
    return (st.lines || []).some(function (line) { return !!(line && String(line.translation || '').trim()); });
  }
  function mrAuxEffectiveMode(st) {
    st = st || mrAux.state;
    if (!st || !st.lines || !st.lines.length) return 'off';
    try { if (String(window.lyricSourceMode || '') === 'custom') return 'off'; } catch (e) { }
    if (mrAux.mode === 'roma') {
      var aligned = mrAuxAlignedRoma(st);
      return (aligned && aligned.hits >= 2 && aligned.ratio >= 0.5) ? 'roma' : 'off';
    }
    if (mrAux.mode === 'trans') {
      return mrAuxHasTranslation(st) ? 'trans' : 'off';
    }
    return 'off';
  }

  /* ---- 注音取数 ----
     Android 包内 /api/lyric 的 shim 实现（assets/public/js/ported/ref/netease.js）只回
     lyric/tlyric/yrc，romalrc/yromalrc 在服务端就被丢了（桌面 server.js 才带）；
     所以这里用 App 自带的 __mrBridgeRequest（原生 HTTP，走同一个网易云接口、同一份歌词文件）
     取回 romalrc —— 只取「文件里自带的注音行」，不做任何规则推导。
     若以后宿主 shim 补齐了 romalrc，parse 截获路径会优先命中，这里只是兜底。 */
  function mrAuxProviderOf(song) {
    song = song || {};
    try { if (typeof songProviderKey === 'function') return String(songProviderKey(song) || ''); } catch (e) { }
    return String(song.provider || song.source || '');
  }
  function mrAuxBridgeGet(url, headers, timeoutMs) {
    var bridge = window.__mrBridgeRequest;
    if (typeof bridge !== 'function') return Promise.reject(new Error('NO_BRIDGE'));
    return Promise.resolve(bridge({ url: url, method: 'GET', headers: headers || {}, timeoutMs: timeoutMs || 12000 }));
  }
  function mrAuxLooksJapanese(st) {
    var lines = (st && st.lines) || [];
    for (var i = 0; i < lines.length; i += 1) {
      if (/[\u3040-\u30ff]/.test(String((lines[i] && lines[i].text) || ''))) return true;
    }
    return false;
  }
  function mrAuxFetchRomaViaBridge(song) {
    var provider = mrAuxProviderOf(song);
    if (provider === 'netease') {
      var id = (song && (song.id || song.songId)) || '';
      if (!id) return Promise.resolve(null);
      var url = 'https://music.163.com/api/song/lyric?id=' + encodeURIComponent(id) + '&lv=-1&kv=-1&tv=-1&rv=1';
      return mrAuxBridgeGet(url, { 'Referer': 'https://music.163.com/', 'User-Agent': navigator.userAgent }).then(function (res) {
        var body = String((res && res.body) || '');
        if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1);
        var data = JSON.parse(body);
        return mrAuxCaptureRoma(song, data || {});
      });
    }
    if (provider === 'qq') {
      var mid = (song && (song.mid || song.songmid || song.mediaMid)) || '';
      if (!mid) return Promise.resolve(null);
      var qurl = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=' + encodeURIComponent(mid) +
        '&format=json&nobase64=1&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0';
      return mrAuxBridgeGet(qurl, { 'Referer': 'https://y.qq.com/', 'User-Agent': navigator.userAgent }).then(function (res) {
        var body = String((res && res.body) || '');
        body = body.replace(/^[^({]*\(/, '').replace(/\)\s*;?\s*$/, '');
        var data = JSON.parse(body);
        return mrAuxCaptureRoma(song, data || {});
      });
    }
    return Promise.resolve(null);
  }
  /* ---- 酷狗注音：歌词文件只有 [kana:] 逐字读音（假名），没有现成罗马音 ----
     实测 10 个候选只有 [ti/ar/al/by/offset] + [kana:]（+ 部分 [language:] 中文翻译），
     没有任何 roma 字段、也没有空格分隔的罗马音行；酷狗客户端自己按音节切分罗马音。
     这里复刻同样规则：汉字读音（假名）→ Hepburn → 每音节一个词（拗音合写、促音并入下一音节、
     ー 补元音、ん 独立 n），时间轴用同文件的对齐结果（宿主行 t 秒）。仅当其它平台 roma 拿不到时走这条。 */
  var MR_KG_UAM = 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile';
  var MR_KG_HDR = { 'Referer': 'https://www.kugou.com/', 'User-Agent': MR_KG_UAM };
  function mrKgB64Text(content) {
    try { return decodeURIComponent(escape(atob(String(content || '').trim()))); } catch (e) {
      try { return atob(String(content || '').trim()); } catch (e2) { return ''; }
    }
  }
  function mrKgBridgeGet(url) {
    var bridge = window.__mrBridgeRequest;
    if (typeof bridge !== 'function') return Promise.reject(new Error('NO_BRIDGE'));
    return Promise.resolve(bridge({ url: url, method: 'GET', headers: MR_KG_HDR, timeoutMs: 12000 })).then(function (res) {
      return String((res && res.body) || '');
    });
  }
  function mrKgKanaTagOf(text) {
    var m = String(text || '').match(/\[kana:([^\]]*)\]/i);
    return m ? m[1] : '';
  }
  /* kana 标签分隔符是数字 '1'，但时间戳 (20256,24) 里也有 1 → 只在括号外切 */
  function mrKgParseKanaTag(tag) {
    var groups = [], buf = '', depth = 0, i, ch;
    tag = String(tag || '');
    for (i = 0; i < tag.length; i += 1) {
      ch = tag.charAt(i);
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if (ch === '1' && depth === 0) { groups.push(buf); buf = ''; continue; }
      buf += ch;
    }
    if (buf) groups.push(buf);
    var readings = [];
    for (i = 0; i < groups.length; i += 1) readings.push(groups[i].replace(/\(\d+,\d+\)/g, ''));
    var anchor = -1, anchorMs = 0;
    for (i = 0; i < groups.length; i += 1) {
      var mm = groups[i].match(/\((\d+),/);
      if (mm) { anchor = i; anchorMs = Number(mm[1]); break; }
    }
    return { readings: readings, anchor: anchor, anchorMs: anchorMs };
  }
  var MR_KG_KANA = { 'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o', 'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko', 'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so', 'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to', 'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no', 'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho', 'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo', 'や': 'ya', 'ゆ': 'yu', 'よ': 'yo', 'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro', 'わ': 'wa', 'を': 'wo', 'ん': 'n', 'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go', 'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo', 'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do', 'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo', 'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po', 'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ゎ': 'wa', 'ゔ': 'vu', 'ゐ': 'i', 'ゑ': 'e' };
  var MR_KG_KANA2 = { 'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho', 'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho', 'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo', 'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo', 'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo', 'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo', 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo', 'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo', 'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo', 'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo' };
  var MR_KG_PUNCT = { '。': '.', '、': ',', '！': '!', '？': '?', '，': ',', '．': '.', '：': ':', '；': ';', '（': '(', '）': ')', '〜': '~', '～': '~' };
  /* 假名行 → 按音节空格分隔的罗马音（与酷狗客户端展示一致） */
  function mrKgKanaToRoma(kana) {
    kana = String(kana || '').replace(/[\u30a1-\u30f6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
    var tokens = [], geminate = false, lastKana = -1, i, c, two, token;
    for (i = 0; i < kana.length; i += 1) {
      c = kana.charAt(i);
      if (c === 'っ') { geminate = true; continue; }
      if (c === 'ー') {
        if (lastKana >= 0) { var prev = tokens[lastKana]; var v = prev.match(/[aeiou](?!.*[aeiou])/); tokens.push(v ? v[0] : ''); lastKana = tokens.length - 1; }
        continue;
      }
      two = kana.slice(i, i + 2);
      token = null;
      if (MR_KG_KANA2[two]) { token = MR_KG_KANA2[two]; i += 1; }
      else if (MR_KG_KANA[c] !== undefined) token = MR_KG_KANA[c];
      if (token !== null) {
        if (geminate) { token = token.charAt(0) + token; geminate = false; }
        tokens.push(token); lastKana = tokens.length - 1;
        continue;
      }
      if (MR_KG_PUNCT[c]) {
        if (c === '：' || c === '；') tokens.push(MR_KG_PUNCT[c]);
        else if (tokens.length) tokens[tokens.length - 1] += MR_KG_PUNCT[c];
        else tokens.push(MR_KG_PUNCT[c]);
        continue;
      }
      if (c === '「' || c === '」' || c === '『' || c === '』') continue;
      if (c === ' ' || c === '\u3000') { geminate = false; tokens.push(' '); continue; }
      if (/[A-Za-z0-9'’\-]/.test(c)) {
        if (tokens.length && /^[A-Za-z0-9'’\-]+$/.test(tokens[tokens.length - 1])) tokens[tokens.length - 1] += c;
        else tokens.push(c);
        lastKana = -1;
        continue;
      }
      tokens.push(c);
    }
    var s = '';
    for (i = 0; i < tokens.length; i += 1) {
      var t = tokens[i];
      if (t === ' ') { if (s && s.charAt(s.length - 1) !== ' ') s += ' '; continue; }
      if (!s) { s = t; continue; }
      if (/^[;:]/.test(t)) s += ' ' + t + ' ';
      else if (/^[.,!?~)]/.test(t)) s += t + ' ';
      else s += ' ' + t;
    }
    return s.replace(/\s+/g, ' ').trim();
  }
  /* 抓酷狗官方日语歌词的 [kana:] 并按宿主歌词行对齐 → 返回与 v103 roma 相同的缓存记录 */
  function mrAuxFetchKgKanaRoma(st, song) {
    if (!st || !st.key || !song) return Promise.resolve(null);
    if (mrAuxProviderOf(song) !== 'kugou') return Promise.resolve(null);
    var keyword = String(song.name || song.title || '').trim();
    if (!keyword) return Promise.resolve(null);
    var hash = String(song.hash || song.id || '');
    var titleOnly = keyword.replace(/^.*?\s*[-–—]\s*/, '').trim();
    var artistOnly = (keyword.match(/^(.*?)\s*[-–—]\s*/) || [, ''])[1].trim();
    var kws = [keyword, titleOnly, (titleOnly + ' ' + artistOnly).trim()];
    var durMs = Number(song.duration) || 0;
    if (durMs && durMs < 10000) durMs = durMs * 1000;
    var candMap = Object.create(null);
    function searchOne(kw, withHash) {
      var url = 'https://krcs.kugou.com/search?ver=1&man=yes&client=pc&lrctxt=1&keyword=' + encodeURIComponent(kw) +
        (withHash && hash ? ('&hash=' + encodeURIComponent(hash)) : '') +
        (durMs ? ('&duration=' + Math.round(durMs)) : '');
      return mrKgBridgeGet(url).then(function (body) {
        try {
          var j = JSON.parse(body);
          (j.candidates || []).forEach(function (c) { if (c && c.id) candMap[String(c.id)] = c; });
        } catch (e) { }
      }).catch(function () { });
    }
    var jobs = [];
    for (var ki = 0; ki < kws.length; ki += 1) {
      var kw = String(kws[ki] || '').trim();
      if (!kw) continue;
      jobs.push(searchOne(kw, 1));
      jobs.push(searchOne(kw, 0));
    }
    return Promise.all(jobs).then(function () {
      var list = Object.keys(candMap).map(function (k) { return candMap[k]; });
      var score = function (c) {
        var s = 0;
        if (/日语|日語/.test(String(c.language || ''))) s += 4;
        if (String(c.contenttype) === '0') s += 2;
        if (String(c.krctype) === '1') s += 1;
        if (/官方/.test(String(c.product_from || ''))) s += 2;
        return s;
      };
      list.sort(function (a, b) { return score(b) - score(a); });
      var idx = 0;
      function next() {
        if (idx >= Math.min(list.length, 8)) return Promise.resolve(null);
        var c = list[idx]; idx += 1;
        return mrKgBridgeGet('https://lyrics.kugou.com/download?ver=1&client=pc&id=' + encodeURIComponent(c.id) +
          '&accesskey=' + encodeURIComponent(c.accesskey) + '&fmt=lrc&charset=utf8').then(function (body) {
          var d = {};
          try { d = JSON.parse(body); } catch (e) { d = {}; }
          var text = mrKgB64Text(d && d.content);
          if (!/\[kana:/i.test(text)) return next();
          return { text: text, cand: c };
        }).catch(function () { return next(); });
      }
      return next();
    }).then(function (hit) {
      if (!hit) return null;
      var parsed = mrKgParseKanaTag(mrKgKanaTagOf(hit.text));
      if (parsed.anchor < 0 || !parsed.readings.length) return null;
      var lrcLines = [];
      String(hit.text).split(/\r?\n/).forEach(function (line) {
        var m = line.match(/^\[(\d{1,2}):(\d{1,2})(?:\.(\d+))?\]/);
        if (!m) return;
        var ms = (+m[1]) * 60000 + (+m[2]) * 1000 + Math.round(Number('0.' + (m[3] || '0')) * 1000);
        lrcLines.push({ ms: ms, text: line.replace(/^\[[^\]]+\]/, '') });
      });
      if (lrcLines.length < 2) return null;
      var hostLines = (st.lines || []).slice();
      if (hostLines.length < 2) return null;
      var startIdx = -1;
      for (var hi = 0; hi < hostLines.length; hi += 1) {
        if (Math.round((Number(hostLines[hi].t) || 0) * 1000) >= parsed.anchorMs - 120) { startIdx = hi; break; }
      }
      if (startIdx < 0) return null;
      var NEED = /[\u3400-\u4dbf\u4e00-\u9fff\u3005]/;
      var ri = parsed.anchor, outLines = [], mapped = 0;
      for (var li = startIdx; li < hostLines.length; li += 1) {
        var src = String(hostLines[li].text || '');
        var kana = '';
        for (var ci = 0; ci < src.length; ci += 1) {
          var ch = src.charAt(ci);
          if (NEED.test(ch)) { var rd = parsed.readings[ri]; ri += 1; kana += (rd || ch); }
          else kana += ch;
        }
        var roma = mrKgKanaToRoma(kana);
        if (roma) { outLines.push({ t: Number(hostLines[li].t) || 0, text: roma }); mapped += 1; }
      }
      if (mapped < 4 || mapped < hostLines.length * 0.35) return null;
      var key = st.key;
      var rec = { key: key, source: 'kg-kana', lines: outLines, lrcLines: [], at: Date.now() };
      mrAux.romaMem[key] = rec;
      try { mrAuxStorePut(key, rec); } catch (e) { }
      delete mrAux.romaMissMem[key];
      var stNow = mrAux.state;
      if (stNow && stNow.key === key && mrAux.mode === 'roma') {
        stNow.romaChecked = false;
        stNow.roma = undefined;
        mrAuxScheduleApply(0);
      }
      return rec;
    }).catch(function () { return null; });
  }

  /* ---- 缺注音时按 song key 补取一次（先 bridge 取文件注音，再宿主 /api 兜底） ---- */
  function mrAuxFetchRoma(st) {
    var key = st && st.key;
    if (!key) return Promise.resolve(null);
    if (mrAux.romaPending[key]) return mrAux.romaPending[key];
    var song = mrAuxCurrentSong();
    if (!song || mrAuxSongKey(song) !== key) return Promise.resolve(null);
    var endpoint = '';
    try {
      if (typeof lyricEndpointForSong === 'function') endpoint = lyricEndpointForSong(song);
    } catch (e) { endpoint = ''; }
    if (!endpoint || typeof window.apiJson !== 'function') {
      /* 没有宿主 /api 通道也还能走酷狗 [kana:] 兜底（v105d） */
      if (mrAuxProviderOf(song) !== 'kugou') return Promise.resolve(null);
      var kgOnly = mrAuxFetchKgKanaRoma(st, song).catch(function () { return null; });
      mrAux.romaPending[key] = kgOnly;
      return kgOnly.then(function (rec) { delete mrAux.romaPending[key]; if (!rec) mrAuxMissSet(key); return rec; });
    }
    var task = Promise.resolve()
      .then(function () { return mrAuxFetchRomaViaBridge(song); })
      .catch(function () { return null; })
      .then(function (rec) {
        if (rec) return rec;
        return Promise.resolve(window.apiJson(endpoint, { timeoutMs: 6500 }))
          .then(function (data) { return mrAuxCaptureRoma(song, data || {}); })
          .catch(function () { return null; });
      })
      .then(function (rec) {
        /* v105d：酷狗没有 romalrc/roma 字段，但官方日语歌词带 [kana:] 逐字读音 →
           本地转「按音节分隔」的罗马音（与酷狗客户端展示一致），走同一条 roma 管线 */
        if (rec) return rec;
        return mrAuxFetchKgKanaRoma(st, song);
      })
      .then(function (rec) {
        if (!rec) mrAuxMissSet(key);
        delete mrAux.romaPending[key];
        return rec;
      });
    mrAux.romaPending[key] = task;
    return task;
  }
  function mrAuxKickRomaFetch(st) {
    if (!st || !st.key || st.romaFetching) return;
    if (mrAux.romaPending[st.key]) return;
    st.romaFetching = 1;
    var version = st.version;
    mrAuxFetchRoma(st).then(function (rec) {
      st.romaFetching = 0;
      if (mrAux.state !== st || st.version !== version) return;
      if (!rec) { mrAuxRefresh(); return; }
      st.romaChecked = false;
      st.roma = undefined;
      var aligned = mrAuxAlignedRoma(st);
      if (!aligned) { mrAuxRefresh(); return; }
      if (mrAux.mode === 'roma' && mrAuxPlayerPage()) mrAuxApplyNow(true);
      else mrAuxRefresh();
    }).catch(function () { st.romaFetching = 0; });
  }

  /* ---- 把选中的 aux 文本写回宿主渲染通道 ---- */
  function mrAuxSetHostTranslationMode(mode) {
    mode = mode === 'multi' ? 'multi' : 'off';
    var current = 'off';
    try { current = String((window.fx && window.fx.lyricTranslationMode) || 'off'); } catch (e) { current = 'off'; }
    if (current === mode) return false;
    try { if (window.fx) window.fx.lyricTranslationMode = mode; } catch (e) { }
    try {
      if (typeof window.updateLyricTranslationModeControls === 'function') window.updateLyricTranslationModeControls();
    } catch (e2) { }
    return true;
  }
  function mrAuxRomaState(st) {
    var assign = (st && st.roma && st.roma.assign) || {};
    var lines = [];
    var translationLines = [];
    var src = (st && st.lines) || [];
    for (var i = 0; i < src.length; i += 1) {
      var line = src[i] || {};
      var copy = mrAuxCloneLine(line);
      if (Object.prototype.hasOwnProperty.call(assign, i)) {
        copy.translation = assign[i];
      } else {
        /* 音/译互斥：开音时不能把宿主译文顺带塞进来 */
        delete copy.translation;
        delete copy.translationTime;
        delete copy.translationSource;
        delete copy.translationMatch;
      }
      lines.push(copy);
      if (Object.prototype.hasOwnProperty.call(assign, i)) {
        translationLines.push({
          t: Number(line.t) || 0,
          duration: Number(line.duration) || 0,
          text: assign[i],
          source: 'roma'
        });
      }
    }
    return { lines: lines, translationLines: translationLines };
  }
  /* 译文：宿主的 tlyric 正常已在 base.lines 的 .translation 上；个别路径只给了 translationLines，
     这里用宿主自己的 attachLyricTranslations 补挂一次（仍是文件自带译文，不做生成） */
  function mrAuxTransState(st) {
    var lines = st.lines;
    var translationLines = st.translationLines || [];
    var attached = (st.lines || []).some(function (line) { return !!(line && line.translation); });
    if (!attached && translationLines.length && typeof window.attachLyricTranslations === 'function') {
      try { lines = window.attachLyricTranslations(mrAuxCloneLines(st.lines), mrAuxCloneLines(translationLines)); } catch (e) { lines = st.lines; }
    }
    return { lines: lines, translationLines: translationLines, translationSource: st.translationSource || 'translation' };
  }
  function mrAuxSig(st, effective) {
    var romaPart = '';
    if (effective === 'roma' && st && st.roma) {
      romaPart = [st.roma.phase, st.roma.hits, st.roma.source].join(':');
    }
    return [st && st.version, effective, romaPart].join('|');
  }
  function mrAuxWriteHost(effective, options) {
    options = options || {};
    var st = mrAux.state;
    if (!st) return false;
    var wantMode = effective === 'off' ? 'off' : 'multi';
    var modeChanged = mrAuxSetHostTranslationMode(wantMode);
    var lines = st.lines;
    var translationLines = st.translationLines || [];
    var translationSource = st.translationSource || 'none';
    if (effective === 'roma') {
      var built = mrAuxRomaState(st);
      lines = built.lines;
      translationLines = built.translationLines;
      translationSource = 'roma:' + ((st.roma && st.roma.source) || 'file');
    } else if (effective === 'trans') {
      var transState = mrAuxTransState(st);
      lines = transState.lines;
      translationLines = transState.translationLines;
      translationSource = transState.translationSource;
    }
    mrAux.applying = true;
    try {
      if (typeof window.setOriginalLyricsState === 'function') {
        window.setOriginalLyricsState(lines, st.hasKaraoke, st.timingSource, translationLines, translationSource);
        if (options.render !== false && typeof window.applyPreferredLyricsForCurrent === 'function') {
          window.applyPreferredLyricsForCurrent(true);
        }
      }
    } finally {
      mrAux.applying = false;
    }
    mrAux.appliedSig = mrAuxSig(st, effective);
    if (modeChanged && options.render !== false && typeof window.refreshStageLyricDisplayMode === 'function') {
      try { window.refreshStageLyricDisplayMode(); } catch (e) { }
    }
    return true;
  }
  function mrAuxApplyNow(force) {
    var st = mrAux.state;
    if (!st || !st.lines || !st.lines.length) {
      mrAuxSetHostTranslationMode('off');
      mrAux.appliedSig = '';
      mrAuxRefresh();
      return;
    }
    if (!mrAuxPlayerPage()) { mrAuxRefresh(); return; }
    var effective = mrAuxEffectiveMode(st);
    var wantMode = effective === 'off' ? 'off' : 'multi';
    var hostMode = 'off';
    try { hostMode = String((window.fx && window.fx.lyricTranslationMode) || 'off'); } catch (e) { hostMode = 'off'; }
    var sig = mrAuxSig(st, effective);
    if (!force && sig === mrAux.appliedSig && hostMode === wantMode) { mrAuxRefresh(); return; }
    mrAuxWriteHost(effective, { render: true });
    mrAuxRefresh();
  }
  function mrAuxScheduleApply(delay) {
    try {
      if (mrAux.applyTimer) window.clearTimeout(mrAux.applyTimer);
      mrAux.applyTimer = window.setTimeout(function () {
        mrAux.applyTimer = 0;
        try { mrAuxApplyNow(false); } catch (e) { }
      }, typeof delay === 'number' ? delay : 40);
    } catch (e) { }
  }

  /* ---- 音/译按钮：并进 #mr-player-extras 那一排 4UI（同款 ctrl-btn / 同排 / gap 10） ---- */
  function mrAuxCreateButton(kind, label, title) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctrl-btn mr-aux-btn';
    btn.id = 'mr-lyric-aux-' + kind;
    btn.setAttribute('data-aux', kind);
    btn.setAttribute('aria-pressed', 'false');
    btn.title = title;
    btn.textContent = label;
    btn.addEventListener('click', function (ev) {
      try { ev.preventDefault(); ev.stopPropagation(); } catch (e) { }
      mrAuxToggle(kind);
    });
    return btn;
  }
  function mrAuxModesCluster() {
    var extras = document.getElementById('mr-player-extras');
    if (!extras) return null;
    for (var i = 0; i < extras.children.length; i += 1) {
      var child = extras.children[i];
      if (child && child.classList && child.classList.contains('control-cluster') && child.classList.contains('modes')) return child;
    }
    return null;
  }
  function mrAuxPlaceButtons() {
    if (!mrAux.btnRoma) mrAux.btnRoma = mrAuxCreateButton('roma', '音', '注音（歌词文件自带罗马音）');
    if (!mrAux.btnTrans) mrAux.btnTrans = mrAuxCreateButton('trans', '译', '译文（歌词文件自带翻译）');
    var cluster = mrAuxModesCluster();
    if (!cluster) {
      try {
        window.__mrStructDirty = 1;
        if (typeof ensureStructure === 'function') ensureStructure();
        if (typeof layoutPlayerExtrasPos === 'function') layoutPlayerExtrasPos();
      } catch (e) { }
      cluster = mrAuxModesCluster();
    }
    if (!cluster) return null;
    var anchor = null;
    for (var i = 0; i < cluster.children.length; i += 1) {
      if (cluster.children[i] && cluster.children[i].id === 'lyric-timing-control') { anchor = cluster.children[i]; break; }
    }
    var roma = mrAux.btnRoma;
    var trans = mrAux.btnTrans;
    var wantRomaPrev = anchor || null;
    if (roma.parentNode !== cluster || roma.previousElementSibling !== wantRomaPrev) {
      try { cluster.insertBefore(roma, anchor ? anchor.nextSibling : cluster.firstChild); } catch (e) { }
    }
    if (trans.parentNode !== cluster || trans.previousElementSibling !== roma) {
      try { cluster.insertBefore(trans, roma.nextSibling); } catch (e) { }
    }
    return cluster;
  }
  function mrAuxApplyButtonState(btn, kind, available) {
    if (!btn) return;
    /* 不可用时不要留 active 态（没有注音的歌不该显示「音」为选中） */
    var active = !!available && mrAux.mode === kind;
    btn.classList.toggle('mr-aux-hidden', !available);
    btn.classList.toggle('active', active);
    try { btn.setAttribute('aria-pressed', active ? 'true' : 'false'); } catch (e) { }
  }
  function mrAuxRefresh() {
    mrAuxPlaceButtons();
    var available = { roma: false, trans: false };
    try {
      var st = mrAux.state;
      if (st && st.lines && st.lines.length) {
        var custom = false;
        try { custom = String(window.lyricSourceMode || '') === 'custom'; } catch (e) { }
        if (!custom) {
          var aligned = mrAuxAlignedRoma(st);
          available.roma = !!(aligned && aligned.hits >= 2 && aligned.ratio >= 0.5);
          available.trans = mrAuxHasTranslation(st);
        }
      }
    } catch (e) { }
    mrAuxApplyButtonState(mrAux.btnRoma, 'roma', available.roma);
    mrAuxApplyButtonState(mrAux.btnTrans, 'trans', available.trans);
    return available;
  }
  function mrAuxToggle(kind) {
    kind = kind === 'roma' ? 'roma' : (kind === 'trans' ? 'trans' : 'off');
    var next = mrAux.mode === kind ? 'off' : kind;
    var available = mrAuxRefresh();
    if (next === 'roma' && !available.roma) {
      mrAuxToast('这首歌的歌词文件没有自带注音');
      return;
    }
    if (next === 'trans' && !available.trans) {
      mrAuxToast('这首歌的歌词文件没有自带译文');
      return;
    }
    mrAux.mode = next;
    try { window.localStorage.setItem(MR_AUX_MODE_KEY, next); } catch (e) { }
    mrAuxApplyNow(true);
    if (next === 'roma') mrAuxToast('注音：按歌词文件自带罗马音显示（无则自动隐藏）');
    else if (next === 'trans') mrAuxToast('译文：按歌词文件自带翻译显示');
    else mrAuxToast('音/译已关闭');
    mrAuxRefresh();
  }

  /* ---- 安装：截获宿主歌词响应 + 包 setOriginalLyricsState + 观察播放页/底栏变化 ---- */
  function mrAuxHookSetState() {
    if (window.__mrLyricAuxSetHooked) return true;
    var rawSet = window.setOriginalLyricsState;
    if (typeof rawSet !== 'function') return false;
    window.__mrLyricAuxSetHooked = 1;
    window.setOriginalLyricsState = function (lines, hasKaraoke, timingSource, translationLines, translationSource) {
      if (mrAux.applying) return rawSet.apply(this, arguments);
      try {
        mrAuxCaptureBase(lines, hasKaraoke, timingSource, translationLines, translationSource);
      } catch (e) { }
      var st = mrAux.state;
      var player = mrAuxPlayerPage();
      var effective = 'off';
      if (player) {
        try { effective = mrAuxEffectiveMode(st); } catch (e) { effective = 'off'; }
      }
      var modeChanged = false;
      if (player) {
        try { modeChanged = mrAuxSetHostTranslationMode(effective === 'off' ? 'off' : 'multi'); } catch (e) { }
      }
      var result;
      if (player && effective === 'roma') {
        var built = mrAuxRomaState(st);
        mrAux.applying = true;
        try {
          result = rawSet.call(this, built.lines, hasKaraoke, timingSource, built.translationLines, 'roma:' + ((st.roma && st.roma.source) || 'file'));
        } finally {
          mrAux.applying = false;
        }
        mrAux.appliedSig = mrAuxSig(st, 'roma');
      } else if (player && effective === 'trans') {
        var transState = mrAuxTransState(st);
        mrAux.applying = true;
        try {
          result = rawSet.call(this, transState.lines, hasKaraoke, timingSource, transState.translationLines, transState.translationSource);
        } finally {
          mrAux.applying = false;
        }
        mrAux.appliedSig = mrAuxSig(st, 'trans');
      } else {
        result = rawSet.apply(this, arguments);
        mrAux.appliedSig = player ? mrAuxSig(st, effective) : '';
      }
      if (modeChanged) {
        try {
          window.setTimeout(function () {
            try { if (typeof window.refreshStageLyricDisplayMode === 'function') window.refreshStageLyricDisplayMode(); } catch (e) { }
          }, 0);
        } catch (e2) { }
      }
      mrAuxScheduleApply(30);
      return result;
    };
    return true;
  }
  function mrAuxBindObservers() {
    if (window.__mrLyricAuxObservers) return;
    window.__mrLyricAuxObservers = 1;
    var soon = function () {
      try {
        if (mrAux.refreshTimer) return;
        mrAux.refreshTimer = window.setTimeout(function () {
          mrAux.refreshTimer = 0;
          try { mrAuxRefresh(); } catch (e) { }
          try {
            if (mrAuxPlayerPage()) mrAuxApplyNow(false);
          } catch (e2) { }
        }, 120);
      } catch (e) { }
    };
    try {
      if (window.MutationObserver && document.body) {
        new MutationObserver(soon).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (e) { }
    try {
      var bar = document.getElementById('bottom-bar');
      if (bar && window.MutationObserver) {
        new MutationObserver(soon).observe(bar, { childList: true, subtree: true });
      }
    } catch (e2) { }
    try {
      document.addEventListener('click', function () {
        try { window.setTimeout(mrAuxRefresh, 60); } catch (e) { }
      }, true);
    } catch (e3) { }
  }
  /* 每 2s（看门狗里调用）：补装被宿主换掉的钩子 + 状态自愈 + 轻量刷新 */
  function mrAuxTick() {
    try {
      if (!window.__mrLyricAuxParseHooked) mrAuxHookParse();
      if (!window.__mrLyricAuxSetHooked) mrAuxHookSetState();
    } catch (e) { }
    try {
      if (!mrAux.state || !mrAux.state.lines || !mrAux.state.lines.length) mrAuxAdoptHostState();
      else mrAuxApplyNow(false);
    } catch (e2) {
      try { mrAuxRefresh(); } catch (e3) { }
    }
  }
  if (typeof window !== 'undefined') {
    window.__mrLyricAuxDebug = function () {
      var st = mrAux.state;
      var rec = st && st.key ? mrAuxRomaRec(st.key) : null;
      var aligned = st ? mrAuxAlignedRoma(st) : null;
      return {
        mode: mrAux.mode,
        player: mrAuxPlayerPage(),
        key: st && st.key,
        baseLines: st && st.lines ? st.lines.length : 0,
        baseTs: st && st.timingSource,
        translationLines: st && st.translationLines ? st.translationLines.length : 0,
        japanese: st ? mrAuxLooksJapanese(st) : false,
        recLines: rec && rec.lines ? rec.lines.length : 0,
        recLrcLines: rec && rec.lrcLines ? rec.lrcLines.length : 0,
        recSource: rec && rec.source,
        aligned: aligned ? { hits: aligned.hits, candidates: aligned.candidates, ratio: aligned.ratio, phase: aligned.phase } : null,
        appliedSig: mrAux.appliedSig,
        hostMode: (window.fx && window.fx.lyricTranslationMode) || '',
        missed: st && st.key ? mrAuxMissed(st.key) : false,
        pending: Object.keys(mrAux.romaPending),
        hasTranslation: st ? mrAuxHasTranslation(st) : false
      };
    };
  }
  function patchLyricAux() {
    if (window.__mrLyricAuxPatched) {
      try { mrAuxTick(); } catch (e) { }
      return true;
    }
    if (typeof window.setOriginalLyricsState !== 'function' || typeof window.applyPreferredLyricsForCurrent !== 'function') return false;
    window.__mrLyricAuxPatched = 1;
    mrAux.mode = 'off';
    try {
      var saved = window.localStorage.getItem(MR_AUX_MODE_KEY);
      if (saved === 'roma' || saved === 'trans') mrAux.mode = saved;
    } catch (e) { }
    mrAuxHookSetState();
    mrAuxHookParse();
    mrAuxBindObservers();
    mrAuxRefresh();
    mrAuxAdoptHostState();
    try {
      window.setTimeout(function () { try { mrAuxRefresh(); } catch (e) { } }, 900);
    } catch (e2) { }
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
  /* ===== v104-net P1：删除 v88 的 localStorage /api 缓存层 =====
     v88 这层（TTL 6h、key 不归一化、失败/空包也缓存）叠在 v94 的 mem+IndexedDB 缓存
     【内层】：v94 未命中时会先落到它，于是 6 小时前的旧包/空包被当成"新鲜数据"，再被
     v94 缓存 20 分钟。真机实测：259 条 mr-api-cache: 里 109 条是搜索，其中多条是
     {ok:false, error:'MR_SEARCH_TIMEOUT', songs:[]} —— v94 明确拒绝缓存的超时空包被它
     存了下来，这是「明明有歌却提示没有找到相关歌曲」持续复现的另一半根因。
     处理：只保留 v94 的 mem+IndexedDB 缓存（__mrApiCacheState，TTL 20min）作为唯一
     /api 缓存层；升级时把老用户机器上 `mr-api-cache:` 前缀的键全部清掉（否则旧空包
     还能继续毒 6 小时）。搜索的空包/TTL 策略由 search-dev 负责，这里只删缓存层，
     不动 kind==='search' 判定。 */
  var MR_LEGACY_API_CACHE_PREFIX = 'mr-api-cache:';
  var MR_API_CACHE_MIGRATE_KEY = 'mr-api-cache-migrate-v104';
  function mrMigrateApiCacheV104() {
    try {
      if (localStorage.getItem(MR_API_CACHE_MIGRATE_KEY) === '1') return 0;
    } catch (e) { }
    var removed = 0;
    var bytes = 0;
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(MR_LEGACY_API_CACHE_PREFIX) === 0) keys.push(k);
      }
      for (var j = 0; j < keys.length; j++) {
        try { bytes += keys[j].length + (localStorage.getItem(keys[j]) || '').length; } catch (e2) { }
        try { localStorage.removeItem(keys[j]); removed += 1; } catch (e3) { }
      }
      try { localStorage.setItem(MR_API_CACHE_MIGRATE_KEY, '1'); } catch (e4) { }
    } catch (e5) { }
    try {
      window.__mrLegacyApiCachePurged = (window.__mrLegacyApiCachePurged || 0) + removed;
      window.__mrLegacyApiCachePurgedBytes = (window.__mrLegacyApiCachePurgedBytes || 0) + bytes;
    } catch (e6) { }
    return removed;
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

  /* ===== v104：面板打开动画期间的重渲染时序（平台推荐 / 歌单·音乐库）=====
     用户反馈「打开面板时动画会卡一下」。2026-11 真机 CDP Trace 归因（帧间隔 × 渲染线程对齐）：
       1) 平台推荐/音乐发现：.show 触发 0.34s sheet 动画的同时，宿主立刻 loadHomePlatformRecommendations()，
          缓存命中后 60~90ms 内就重建整份列表 innerHTML（6 歌单卡 + 12 首日推 + 6 电台，封面是
          background-image）。Trace 里这段同时出现 ImageDecodeTask 54.6ms + GpuImageDecodeCache::UploadImage
          24.3ms + 渲染线程 DrawFn_DrawGL 31.4ms → 打开动画里掉 1~2 帧（最坏 148ms 空档）。
       2) 歌单/音乐库：打开时宿主 refreshUserPlaylists 的异步链在 100ms 内连续调用
          renderUserPlaylistsList 5 次（v87 全量模式下每次 15~27ms，合计约 68ms），全落在动画窗口里。
     改法（不改动画时长与手感，sheet 仍是 0.34s cubic-bezier(.22,.9,.25,1)）：
       a) 平台推荐：列表里已有上次渲染的内容时，打开动画期间一律不重建（直接复用旧 DOM，不闪 loading），
          等 460ms（0.34s 动画 + 120ms 余量）后再重建一次；列表为空（冷启动后首开）时只立即渲染
          一次 loading 态（很便宜），其余同样推迟。关闭面板会丢弃挂起的重建。
       b) 歌单列表：面板打开后 800ms 窗口内，第一次调用延迟到下一个 rAF 立即执行（首屏不空），
          其余重复调用只保留最后一次参数、合并后在 150ms 尾随定时器里执行一次。
          reset / preserveScroll 这类会改变滚动位置的语义保守取并集（任一调用要求 reset 就 reset）。
     风险：a) 面板打开后 460ms 内先点平台 tab，新平台的列表重建也会等到窗口结束（旧列表先显示）；
           b) 打开后 800ms 内的列表渲染最多延后 150ms（对用户操作无感，滚动不会触发重建）。
           两处都可回滚：删掉 patchMotionPanelRender 调用即恢复原时序。 */
  function patchMotionPanelRender() {
    if (window.__mrMotionRenderPatched) return true;
    window.__mrMotionRenderPatched = 1;

    /* --- a) 平台推荐 / 音乐发现面板 --- */
    if (typeof window.openHomePlatformRecommendations === 'function'
      && typeof window.renderHomePlatformRecommendations === 'function'
      && !window.__mrPlatformRenderDefer) {
      window.__mrPlatformRenderDefer = 1;
      var platRawOpen = window.openHomePlatformRecommendations;
      var platRawRender = window.renderHomePlatformRecommendations;
      var platState = { opening: false, deferAll: false, renders: 0, pending: false, timer: 0 };
      var platFlush = function () {
        platState.opening = false;
        platState.deferAll = false;
        platState.renders = 0;
        if (platState.timer) { try { window.clearTimeout(platState.timer); } catch (e) { } platState.timer = 0; }
        if (!platState.pending) return;
        platState.pending = false;
        var mask = document.getElementById('home-platform-recommend-mask');
        if (!mask || !mask.classList.contains('show')) return;   /* 已经关了就不补渲染，别在关闭动画里加活 */
        try { platRawRender.call(window); } catch (e) { }
      };
      window.openHomePlatformRecommendations = function () {
        var list = document.getElementById('home-platform-recommend-list');
        /* 有上次渲染的内容 → 动画期间直接复用，不重建；空列表 → 先给一次 loading 态 */
        platState.deferAll = !!(list && list.children && list.children.length > 0
          && !list.querySelector('.home-platform-recommend-loading'));
        platState.opening = true;
        platState.renders = 0;
        platState.pending = false;
        if (platState.timer) { try { window.clearTimeout(platState.timer); } catch (e) { } platState.timer = 0; }
        platState.timer = window.setTimeout(platFlush, 460);
        return platRawOpen.apply(this, arguments);
      };
      window.renderHomePlatformRecommendations = function () {
        if (platState.opening) {
          platState.renders++;
          /* 只在「列表已有上次渲染内容、直接复用旧 DOM」时推迟；冷启动首开（列表空）
             保持宿主原时序（loading 态 + 立刻渲染），避免把重建推迟到动画结束后单独卡一下。 */
          if (platState.deferAll) {
            platState.pending = true;
            return undefined;
          }
        }
        return platRawRender.apply(this, arguments);
      };
      /* 关闭时清掉挂起的重建（下次打开会重新 loadHomePlatformRecommendations） */
      if (typeof window.closeHomePlatformRecommendations === 'function') {
        var platRawClose = window.closeHomePlatformRecommendations;
        window.closeHomePlatformRecommendations = function () {
          platState.pending = false;
          platState.opening = false;
          platState.deferAll = false;
          if (platState.timer) { try { window.clearTimeout(platState.timer); } catch (e) { } platState.timer = 0; }
          return platRawClose.apply(this, arguments);
        };
      }
    }

    /* --- b) 歌单 / 音乐库面板 --- */
    if (typeof window.renderUserPlaylistsList === 'function' && !window.__mrPlRenderCoalesce) {
      window.__mrPlRenderCoalesce = 1;
      /* 记录歌单面板打开时刻（打开后的重渲染才合并，平时渲染语义不变） */
      if (typeof window.setPeek === 'function' && !window.__mrPlOpenStamp) {
        window.__mrPlOpenStamp = 1;
        var rawSetPeek = window.setPeek;
        window.setPeek = function (elem, on, key) {
          if (on && (key === 'pl' || (elem && elem.id === 'playlist-panel'))) window.__mrPlOpenAt = Date.now();
          return rawSetPeek.apply(this, arguments);
        };
      }
      var plRawRender = window.renderUserPlaylistsList;
      var plPending = null;
      var plRaf = 0;
      var plTail = 0;
      var plRun = function (args) { try { plRawRender.apply(window, args); } catch (e) { } };
      var plCoalesceActive = function () {
        return !!(window.__mrPlOpenAt && (Date.now() - window.__mrPlOpenAt) < 800);
      };
      var plMergeArgs = function (older, newer) {
        try {
          var a = older && older[0];
          var b = newer && newer[0];
          if (a && b && typeof a === 'object' && typeof b === 'object') {
            var out = {};
            for (var k in b) { if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k]; }
            if (a.reset && !out.reset) { out.reset = true; out.preserveScroll = false; }
            return [out];
          }
        } catch (e) { }
        return newer;
      };
      window.renderUserPlaylistsList = function () {
        /* 平时（非打开窗口）保持原样同步渲染：宿主可能在 render 之后立刻量 DOM */
        if (!plCoalesceActive()) {
          if (plPending) { plPending = null; return undefined; }
          return plRawRender.apply(this, arguments);
        }
        var args = [].slice.call(arguments);
        if (plPending) {                       /* 已有排队：只留最后一次参数（合并滚动语义） */
          plPending = plMergeArgs(plPending, args);
          return undefined;
        }
        plPending = args;
        if (plRaf || plTail) return undefined;
        plRaf = window.requestAnimationFrame(function () {
          plRaf = 0;
          if (!plPending) { if (plTail) { try { window.clearTimeout(plTail); } catch (e) { } plTail = 0; } return; }
          var a = plPending;
          plPending = null;
          plRun(a);
          plTail = window.setTimeout(function () {
            plTail = 0;
            if (!plPending) return;
            var b = plPending;
            plPending = null;
            plRun(b);
          }, 150);
        });
        return undefined;
      };
    }
    return true;
  }

  /* ---- §14 入口 ---- */
  ready(function () {
    window.__mrStructDirty = 1;
    ensureClasses();
    mrLocalStorageBoot();
    installApiFetchCache();
    try { mrBindSongUrlInvalidate(); } catch (e) { }
    try { installPlaylistFullRender(); } catch (e) { }
    buildChrome();
    initDiyConsole();
    startStructureObserver();
    startBarHeightWatch();
    bindPanelKeyboardFit();
    ensureStructure();
    patchHostHooks();
    startWatchdog();
    try { patchLyricAux(); } catch (e) { }
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
    try { patchSearchFailSemantics(); } catch (e) { }
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
    try { patchMotionPanelRender(); } catch (e) { }
    try { patchHomeBlankDismiss(); } catch (e) { }
    try { window.setTimeout(function () { try { patchHotkeyRemoval(); } catch (e) { } try { patchPlatformPanelAnimation(); } catch (e) { } try { patchHomeBlankDismiss(); } catch (e) { } }, 2000); } catch (e) { }
    try { patchNetStatsUi(); } catch (e) { }
    try { window.setTimeout(function () { try { patchLikeStatusSync(); } catch (e) { } try { patchNetStatsUi(); } catch (e) { } }, 2500); } catch (e) { }
    try { patchNextTrackPrefetch(); } catch (e) { }
    try { mrScheduleBootPrefetch(); } catch (e) { }
    try { window.setTimeout(function () { try { patchProgressiveSearch(); } catch (e) { } try { patchSearchFailSemantics(); } catch (e) { } mrWarmConnections(); }, 3000); } catch (e) { }
    bindHostNavTriggers();
    bindStageGuard();
    bindDiyTap();
    bindFab(document.getElementById('fx-fab'));
    bindStageDrag();
    patchPlaylistEdgeTrigger();
    bindPlayerPopovers();
    try { mrMigrateApiCacheV104(); } catch (e) { }
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
