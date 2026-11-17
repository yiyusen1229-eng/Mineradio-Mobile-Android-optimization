# v2 迭代记录（2026-11-17）

## 问题

上一版（v1）把网页版的手机布局直接叠在底座工程的移动 UI 上，出现两套手机 UI 打架：

- 底座的 `android-mobile.js` 自己有一套 dock（搜索/歌单/队列/视觉/本地）+ 移动面板；
- 我们的 `phone-shell` 又渲染一套网页版手机布局；
- 结果：浮动按钮重叠内容、「…」菜单和 dock 并存、页面底部被 dock 遮住。

## v2 改动

| 文件 | 改动 |
|---|---|
| `app/src/main/assets/index.html` | **移除** `<script src="android-mobile.js">`（不再加载底座 dock/移动面板层） |
| `web/mr-phone/mr-phone.js` | 1) 隐藏底座遗留浮动入口 `#android-local-entry` / `#android-online-button`；2) 「…」菜单增加「本地」（转发点击隐藏的本地入口）；3) 补菜单按钮样式；4) 抬高本地面板 z-index |
| 其余 | 不变（3 个 mobile CSS + early 脚本 + 手机壳注入） |

## 构建与安装

```powershell
cd Y:\mineradio-portrait\base\mineradio-android
.\gradlew.bat --no-daemon assembleDebug "-PmineradioBuildRoot=Y:/build-out"
adb install -r ..\..\dist\Mineradio-portrait-v2-debug.apk
```

- 产物：`dist/Mineradio-portrait-v2-debug.apk`（10.5 MB）
- **本机 `adb install` 已可用**（之前 MIUI 拦截已放开）

## 真机结果（Xiaomi 14 Ultra，竖屏）

- 启动页 → 进入后是**手机单列布局**：顶部搜索栏 + 右上「…」、卡片（我的歌单/每日推荐/推荐歌曲/继续听/听歌画像/更多歌曲）、卡片区可滚动
- 「…」菜单：首页 / 登录 / 本地
- 登录页：竖排（网易云 / QQ 音乐），布局正常
- 无 dock、无浮动按钮重叠

截图：`verify/v2-home.png`、`verify/v2-menu.png`、`verify/v2-splash.png`

## 待处理

1. 登录页报「官方服务请求或私有凭据存储失败，请稍后重试」——底座后端的接口请求失败，需要看 logcat 定位（网络 / 域名 / 凭据存储）。
2. 首页卡片封面是占位圆图（底座资源缺少网页版封面图），可后续替换。
3. 播放链路（本地导入 / 在线播放）在竖屏布局下的 UI 需实测。
