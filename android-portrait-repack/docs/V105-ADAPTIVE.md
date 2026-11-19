# V105：自适应布局硬化（红米 Note 12 Turbo 暴露的越界 + DIY 面板重塑）

> 用户反馈（2026-11-19）：红米 Note 12 Turbo 上「底部播放栏 UI 超出边框」「在线歌词搜索框不正常」「DIY 视觉控制台重塑：框里只留居中标题、删小横条、删副标题、打开别跳」。
> 用户确认目标层次：**这是「自适应布局」任务，不是给某一台机型打补丁**。
> 本轮交付：`Mineradio竖屏-v105-自适应布局.apk`（75,972,415 B，SHA256 `4D5A2EAA…AFF11`）。

## 1. 为什么"自适应布局做过"还会出问题（根因链）

V67b（提交 `0f50902`，v67-v69）确实建了自适应体系：

```css
--mr-row-h / --mr-gap / --mr-bar-pad-x / --mr-transport-gap / --mr-ctrl-size  (clamp)
+ 断点 ≤340 / ≤360 / ≥600 / 横屏≤520 + JS ResizeObserver 维护 --mr-bar-h
```

但三层原因让它"看起来生效、实际没生效"：

1. **关键尺寸被更早的硬编码用更高特异性压住**
   - `body.phone-shell #bottom-bar #controls > .control-cluster.transport > .ctrl-btn{width:42px!important}`（`ab6f9c5` LAYOUT_CSS，特异性 0,2,4,1）
   - 压过 V67b 的 `#controls .ctrl-btn{width:var(--mr-ctrl-size)}`（0,2,2,1）
   - 红米实测证据：同一底栏里 **DIY 钮 = 39.4px（走变量）**，**传输键 = 42.0px（硬编码）**
2. **底栏内边距也被双 id 规则写死**：`#bottom-bar#bottom-bar{padding:8px 12px 10px}`（0,2,1,1）压过 `padding-left/right:var(--mr-bar-pad-x)` → 375 下仍是 12px 而不是 8.25px
3. **旧审计判据看不见这类问题**：`adaptive-test.js` 只检查 `right > vw+2`（越出**视口**），不检查越出**容器**。红米 375 下 ☰ 右缘 373.1 < 375+2 → 10 组视口全绿，但底栏右缘只有 366.8 → 实际出栏 6.3px

数值对齐：375 CSS 宽下底栏内容宽 333.5px，而 7×42 + 6×9.75 = **352.5px**（溢出 19px）；
若走变量：7×39.375 + 6×9.75 = 334.1px（刚好放得下）。**修法不是再写一条 px，而是让变量真正接管。**

## 2. 改了什么

### ① 底栏（自适应核心）
- 删除传输键 `width/height:42px` 硬编码；改为
  `flex:1 1 0 + min-width:0 + width:auto + max-width:var(--mr-ctrl-size) + height:var(--mr-ctrl-size)`
  → 宽屏保持上限、窄屏等比收缩，任何宽度都不越出底栏
- 删除 `gap:0` / `gap:10px` / `gap:clamp(...)` 三处冲突，间距只留 `var(--mr-transport-gap)`
- 底栏 `padding` 交还 `--mr-bar-pad-x`（375 → 8.25px，窄屏自动收）
- 4UI 键（含 v103 音/译键）`40px` → `var(--mr-ctrl-size)`，整行加 `max-width:calc(100% - 16px)`

### ② 在线歌词搜索弹层
- 面板 `grid-template-columns:minmax(0,1fr)`（原来只有 `grid-template-rows`，隐式单列按 max-content 撑到 377.8px，超出内容宽 322.8px）
- `.lyric-online-results` / 行 / 文本列 `min-width:0`；标题 `nowrap + ellipsis`；标签与「应用」`flex:0 0 auto`

### ③ DIY 视觉控制台
- 删除 `#fx-panel.show/.peek::before` 小横条（实测 42×4 + margin 2/10 = **16px 布局高度**，只在 .show/.peek 时插入 → 打开时内容下跳 16px）；歌单面板的把手保留
- `.fx-sub`（MINERADIO VISUALS · 鼠标移开自动隐藏）隐藏
- `.fx-head` 居中 + 去 border-bottom；`.fx-head-main` flex 列居中；`.fx-title` 居中（实测 titleCenterOffset = 0）；空 `.fx-head-actions` 强制隐藏

### ④ 清理冲突 / 废弃布局规则（共 27 行删除）
| 删除项 | 原因 |
|---|---|
| transport `width:42px/height:42px` | 压过 `--mr-ctrl-size`，本次越界根因 |
| transport `gap:0` / `body.mr-player-page …{gap:10px}` / 横屏 `gap:clamp(4px,1.4vw,12px)` | 与 `var(--mr-transport-gap)` 争同一属性，全被覆盖 |
| `#mr-player-extras .ctrl-btn{40px}`、`.mr-aux-btn{40px}` | 同走变量，避免 4UI 与 DIY 尺寸不一致 |
| `#bottom-bar#bottom-bar{padding:8px 12px 10px;gap:6px}` | 双 id 压死变量（padding 交还 `--mr-bar-pad-x`） |
| 重复的 `#mr-player-extras{right:calc(...+6px)}`（V69 块） | 与通用规则重复且特异性更高 |
| 横屏两处重复的 extras `right/height` | 统一到一处 |
| 空 `@media (max-width:360px){ }`、`≤359` 冗余 36px 规则 | 死规则 |
| `#mr-player-extras{left:10px;right:10px}` | 已被 `left:8px` / `right:calc(...)` 覆盖 |

### ⑤ 验收工具升级
新增 `_tmp/verify2/adaptive-audit-v105.js`：判据从「是否越出视口」改为「**子元素是否越出所在容器**（底栏 border-box）+ 文档无横向滚动」，覆盖 320/360/375/390/393/412/430 + 横屏 844×390。
`regress-v78.js` 同步改为设备无关：点击/滑动走 CDP Input（MIUI 关闭「USB调试（安全设置）」时 adb input 被 INJECT_EVENTS 拒绝）、底栏高度改「跨页恒高」、面板几何改「80vw/右贴12」、返回键改手机层退场 API。

## 3. 真机验证（Redmi Note 12 Turbo / ad40d610 / Android 13 / WebView 157 / CSS 375×800）

| 项目 | 改前 | 改后 |
|---|---|---|
| 底栏内边距 | 12px（写死） | 8.25px（`--mr-bar-pad-x`） |
| 传输键尺寸 | 42px × 7 | 39.4px × 7（`--mr-ctrl-size`） |
| 最右 ☰ 右缘 / 底栏右缘 | 373.1 / 366.8（**出栏 6.3px**） | 357.9 / 366.8（**栏内 8.9px**） |
| 4UI 行最右 | 372.8（**出栏 6.0px**） | 314.8（栏内） |
| 歌词结果行宽 / 面板内容宽 | 377.8 / 322.8（**溢出 41.6px，按钮被裁**） | 321.5 / 348.8（行内，「应用」完整） |
| DIY 头部 titleCenterOffset | 未居中 | **0**（精确居中） |
| DIY `::before` | 42×4+12px margin | `content:none` |
| 打开面板内容位移 | 16px 跳变 | 连续 3 次开合 head y 只差 1.6px（面板滑入动画） |

视口矩阵（`adaptive-audit-v105.js`）：320/360/375/390/393/412/430/横屏 844 全部
`tOverflow L/R = -0.69/-0.69`（即完全在栏内）、`barChildOverflow = 0/0`、`docW == vw`。

回归：**23/23 PASS ×2**，0 JS 异常、0 console.error。

## 4. 产物

- APK：`Mineradio竖屏-v105-自适应布局.apk`（75,972,415 B，SHA256 `4D5A2EAA7A3A7CCAE6976661645A4787A3570AD6A82C16CBAAFF08DDF11AFF11`）
- 截图（红米真机）：底栏首页 / 底栏播放页 / 歌词搜索 / DIY 面板头部
- 补丁：`phone.css`（+95 −27 行），`mr-phone.js` 未改
- 回滚：`git revert` 本提交即可（纯 CSS 段 + 删除项，无 JS/资源改动）

## 5. 未做 / 下轮可继续

- 320 宽下收藏键仍按既有设计隐藏（`@media (max-width:340px)`），若要 7 键全保需另设计次级菜单
- 触摸目标在 375 为 39.4px、320 为 36px（低于 40px 通用建议），如要严格 ≥40 需改为「窄屏减键」方案
- 字号下限 <10px 的小标签（v91 遗留，约 58 处）未在本轮处理

---

# 附录：v105b（320 窄屏弹层塌陷修复）

v105 交付后，用新写的 `panel-audit-v105.js` 把审计范围从「底栏」扩到「所有弹层/面板」，在 320 宽发现一处真问题：

| 项目 | 改前（v105） | 改后（v105b） |
|---|---|---|
| `.home-platform-recommend-tabs` 高度（320×568） | **5.8px** | **40px** |
| tab 按钮高度 | 40px（溢出容器，压住状态行 34px） | 40px（在容器内） |
| 按钮底 ↔ 状态行顶 | 重叠 −34px | 间隙 **+13px** |
| 横向滚动能力 | scrollW 357 / clientW 287（可滚） | 不变 |

**根因**：该 tab 条既是 flex 子项、又带 `overflow-x:auto`。按 CSS 规范，overflow 非 `visible` 时 flex item 的自动最小尺寸（`min-height:auto`）失效 → 弹层内容在 320×568 高度不足时把这一行压到 5.8px。

**修法**（phone.css v105 段 ①b）：
```css
body.phone-shell #home-platform-recommend-mask .home-platform-recommend-tabs{
  flex:0 0 auto!important; min-height:40px!important; height:auto!important; align-items:center!important;
}
```

**验证**：v105b APK 装机后 CDP 实测 320×568 与 375×800；`panel-audit-v105.js` 在 320/360/375/393/430 × 歌单/平台推荐/今日聆听/播放控制台/导入 共 25 组全部 `FLAGGED=0`；底栏矩阵仍全在栏内；回归 23/23 PASS ×2（一次「双击回正」误触 Wallpaper Engine 提示属已知偶发）。

**产物**：`Mineradio竖屏-v105b-自适应布局.apk`（75,972,415 B，SHA256 `688DBCAC7D3208CDBE0A372EB49DFF4DD66767B86F45F4033780421C3A441162`）。
