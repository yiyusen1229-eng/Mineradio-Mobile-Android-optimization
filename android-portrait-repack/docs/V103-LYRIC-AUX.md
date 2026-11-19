# v103：歌词注音（音/译）——只显示歌词文件自带的注音行

## 为什么改

用户口径（本轮已确认，不可再偏离）：

1. 歌词界面的「音」**根本不对**：v99/v101 显示的是「假名 → 罗马音」规则推导产物，并且按 ±0.6s
   最近时间贴行，出现 `kono想ino全て` 这种乱码 + 错行（用户第一张截图）。
   要求：显示**歌词文件里自带的注音行**（网易云 romalrc / yromalrc、QQ roma），按歌词文件
   自身行结构一行对一行挂在原文歌词下方，用「译文」那套小字行显示，原样显示文件内容
   （保留大小写/空格）。**绝不做假名→罗马音规则推导**，没有注音就不显示「音」。
2. 「音/译」按钮要**并入 App 已有 4UI 同款**：40×40、border-radius 12px、
   background `rgba(10,16,18,.55)`、color `rgba(255,255,255,.7)`、font-size 13.33px、
   同排 gap 10px；active 态同 `controls-hide-btn.active`（`color: rgba(210,244,241,.9)`）。
   不要再做 34px 圆形。

## 做法

### 1) 删掉的旧实现（宁删不叠）

- `MR_ROMA_TABLE` / `MR_ROMA_COMBOS` / `mrKanaToRomaji` / `mrHasKana` / `mrApplyRomajiLines`
  —— 规则推导整段删除，不留兜底；
- `mrParseLrcMap` + `mrApplyProviderRoma`（±0.6s 最近时间贴行）+ `mrApplyRomaForState` /
  `mrRomaFetchFromProvider`（直连外网 + 「最近时间」贴行）删除；
- v100 的 34px 圆形按钮 / 独立 `#mr-lyric-aux` 容器样式删除。

### 2) 新数据通路（文件 → 解析 → 显示）

```
宿主歌词取词/解析
  /api/lyric（网易云）              → 正常应带 romalrc / yromalrc
  /api/qq/lyric（QQ）               → 正常应带 roma
  /api/kugou/lyric（酷狗）          → 只有 lyric/trans，天生没有注音
        ↓
补丁层在 window.parseLyricResponseToOriginalState(song, response) 处截获「同一份响应」，
优先取 response.romalrc / response.yromalrc（对象或字符串皆可）/ response.roma；
若宿主链路没给注音（见下方「Android 实况」），用 App 自带 __mrBridgeRequest 走同一个
平台接口取回 romalrc/roma —— 只取文件里自带的注音字符串，不做任何推导。
        ↓
mrParseRomaText(text)：
  ① [mm:ss.xx] 行级 LRC → 一行一条；同一物理行多个时间标签（逐词/分段）→ 拼回一整行；
  ② [start,dur](off,dur,0)字 的 YRC/QRC 逐字格式 → 交给宿主 parseYrcText 拼回整行；
  只去首尾空白，不改大小写、不合并中间空格。
        ↓
按 song key 缓存（内存 + localStorage `mr-lyric-roma-v3`，7 天，最多 80 首；
每条同时缓存 roma 行和同一份响应的 lrc 行，供 YRC 主歌词做中转）
        ↓
mrAlignRomaToLines(baseLines, romaLines, source, lrcLines)：严格一对一配对
  ① 主歌词是 LRC：romalrc 与 lrc 同一份文件、时间戳完全相同 → 按时间戳 1:1（实测网易云
     10 首日文歌 100% 命中）；
  ② 主歌词是 YRC（逐字，行首时间比 lrc 晚 0.1~0.3s，例：1160ms vs 1000ms）：
     用同一份响应里的 lrc 行做中转，先把注音按时间戳贴到 lrc 行（同一份文件，1:1），
     再把 lrc 行对到 yrc 行：
       ②-0 两边行数相同 → 按行序平移（同一份歌词文件的两种编码）；
       ②-1 整行文字相同；②-1b 假名骨架相同（神話/神话、蒼い/苍い 这类繁简/异体差异）；
       ②-2 剩下按 ±0.45s 唯一就近补，仍要求一对一；
  ③ 最后才允许 ±0.12s 唯一一对一（时间取整差异）。
  全程不按顺序猜行、不生成内容；配不上留空，命中率 <50% 就不显示「音」。
        ↓
写进 line.translation（宿主小字行渲染的字段）→
setOriginalLyricsState(...)（音开时清掉宿主译文，保证音/译互斥）→
applyPreferredLyricsForCurrent(true) 重绘；fx.lyricTranslationMode = 'multi' 显示小字行。
```

### 3) Android 实况（重要，和桌面 server.js 不同）

桌面 `server.js` 的 `/api/lyric` 已返回 `romalrc`/`yromalrc`，但 **Android 包的 `assets/public/js/ported/ref/netease.js` `handleLyric`
请求 `/api/song/lyric/v1` 后只回 `lyric/tlyric/yrc`，romalrc/yromalrc 在 shim 层就被丢掉**；
QQ 同理（legacy fcg 接口无 roma）。真机 `fetch('/api/lyric?id=657680')` 实测返回
`{lyric,tlyric,yrc,source}`，没有 romalrc。因此补丁层保留了两条取数路径：

1. 截获宿主响应里的 romalrc/roma（如果哪天 shim/服务端补齐，自动优先命中）；
2. 没有时用 `window.__mrBridgeRequest`（App 自带原生 HTTP）请求同一个网易云/QQ 歌词接口，
   取回 `romalrc`（=同一份歌词文件自带的注音），解析规则与显示完全一致。

这仍然满足「直接显示歌词文件里自带的注音行」，只是取数绕过了 App 内被裁剪的 shim。
**建议**后续由宿主侧（`ported/ref/netease.js` / `qq.js`）把 romalrc/roma 一起返回，
补丁层即可完全走内网 /api，不再需要 bridge 取数。

### 4) 音/译按钮（4UI 同款同排）

- DOM：`mr-phone.js` 把两个 `button.ctrl-btn.mr-aux-btn` 插进
  `#mr-player-extras > .control-cluster.modes`，紧跟「词」按钮（同一 flex 行、gap 10px）；
- 样式：40×40 / radius 12px / `rgba(10,16,18,.55)` / color `rgba(255,255,255,.7)` /
  font-size 13.33px；active = `color rgba(210,244,241,.9)` + 青色 text-shadow
  （与 `.ctrl-btn.active`、`controls-hide-btn.active` 一致）；
- 显隐：只在 `body.mr-player-page` 且非开屏/非转场时显示；不可用按钮加 `.mr-aux-hidden`
  （`display:none!important`）；两个都不可用 → 整组自然消失；
- 状态：本地保存 `mr-lyric-aux-mode-v2`（off/roma/trans）；音/译互斥；切歌时从新的
  base 歌词状态重建，不残留上一首；播放页进入/退出由 body class 监听刷新。

## 真机验证（v103，设备 1440×3200 / 392dp）

- 包：`_tmp/build-v62/v62-signed.apk`（最终为 active 态修正版 SHA256 `77B72A8D…`；截图
  来自上一版 `B4BEA1A…`，两版仅差「不可用时不留 active 态」一行，视觉一致）
- 歌：网易云《残酷な天使のテーゼ (Director's Edit.Version)》id 657680、
  《千本桜》22677433、《群青》1472480890；酷狗《抛弃》（无注音）

| 断言 | 结果 |
| --- | --- |
| 音开：注音行与 romalrc 原文逐行一致 | 48/48 行全部等于文件原文（独立复核：按假名骨架把基础行映射回同一份 lrc 行，44/44 checked 全对，0 错配） |
| 音开：不混入译文 | 0 行含中文；所有注音行 100% 能在 romalrc 原文里找到（不存在的行数 = 0） |
| 无规则推导产物 | 全歌搜索「汉字+罗马音混排」「假名混罗马音」命中 0 |
| 音关 | fx.lyricTranslationMode='off'，小字行消失，音按钮去除 active |
| 译开 | 47 行全部来自 tlyric 原文，0 行来自 romalrc |
| 切歌（音开→《群青》） | 75 行全部来自新歌 romalrc，上一首残留 0 行 |
| 《千本桜》 | 音开 50 行全部来自其 romalrc 原文 |
| 酷狗《抛弃》 | 音/译均 `display:none`（整组隐藏），无 active，hostMode='off' |
| 首页 / 开屏 | #mr-player-extras visibility:hidden opacity:0，两个按钮 display:none |
| 按钮 vs 4UI | y 相同（716）、40×40、radius 12px、bg `rgba(10,16,18,0.55)`、font-size 13.33px、display:flex；同排顺序 词→音→译→隐藏UI→沉浸→音量 |
| 排布不溢出 | 6 键 290px，容器 x=17 w=313，最左 x=40，无裁切 |

截图（`_tmp/work/shots/`）：

- `v103-i-final-roma-on.png` 音开（「窓辺からやがて飛び立つ / ma do be ka ra ya ga te to bi ta tsu」）
- `v103-k-final-roma-off.png` 音关
- `v103-l-final-trans-on.png` 译开（「ずっと眠ってる / 一直沉睡在」）
- `v103-b-roma-on.png` / `v103-c-trans-on.png` / `v103-a-off.png`（上一版同款 UI 佐证）

离线自测：`_tmp/work/test-v103-aux.js`（抽真实 mr-phone.js 代码 + 宿主解析函数，
10 首网易云真实 romalrc 样本逐行比对 + 多时间标签合并 + 繁简骨架 + 错版本拒绝 + 互斥），
32 项全过；样本在 `_tmp/work/roma-samples/`。

## 遗留风险

1. Android shim 仍不返回 romalrc/roma，补丁层依赖 `__mrBridgeRequest` 取数；若某天 bridge 被移除，
   需宿主侧补字段（见 §3）。
2. QQ 的 `roma` 走 legacy fcg 接口，登录态/曲库差异下可能为空 → 该曲不显示「音」（按需求隐藏）。
3. 酷狗/汽水等平台天生无注音 → 「音」永远隐藏（预期行为）。
4. YRC 主歌词的 lrc 中转按行序/假名骨架/唯一就近，极端情况下命中率 <50% 会整首不显示「音」（宁缺勿错）。
5. 译文行是否为「每行都显示」取决于宿主 `fx.lyricTranslationMode='multi'` 与显示行数模式；
   音/译按钮接管该开关，不再写 layout 持久化（避免与视觉控制台互相覆盖）。
