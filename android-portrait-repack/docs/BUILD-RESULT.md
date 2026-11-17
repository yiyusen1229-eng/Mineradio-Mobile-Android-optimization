# 构建结果与安装说明

## 产物

| 文件 | 说明 |
|---|---|
| `dist/Mineradio-portrait-debug.apk` | 已接入手机布局补丁的 debug 包，10.1 MB（`com.mineradio.android` v1.2.3-debug，minSdk 24 / target 34） |

APK 内已确认包含：

```
assets/mr-phone/mobile-home.css
assets/mr-phone/mobile-shell.css
assets/mr-phone/mobile-touch.css
assets/mr-phone/mr-phone-early.js
assets/mr-phone/mr-phone.js
assets/index.html   (已插入 6 处 mr-phone 引用)
```

## 构建环境（本机已就绪）

- JDK 17：`_tmp/tools/jdk/jdk-17.0.21+9`
- Android SDK：`_tmp/tools/android-sdk`（platforms;android-34、build-tools;34.0.0、platform-tools）
- Gradle 8.5（wrapper 自动下载）
- 构建命令：

```powershell
# 把工作目录映射成 Y: 以避开中文路径（Gradle 对非 ASCII 路径敏感）
subst Y: "E:\IDM下载目录\DSH工作产生文件"

$env:JAVA_HOME      = "E:\IDM下载目录\DSH工作产生文件\_tmp\tools\jdk\jdk-17.0.21+9"
$env:ANDROID_HOME   = "Y:\_tmp\tools\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = "Y:\.gradle"

cd Y:\mineradio-portrait\base\mineradio-android
.\gradlew.bat --no-daemon assembleDebug "-PmineradioBuildRoot=Y:/build-out"
# 产物：Y:\build-out\app\outputs\apk\debug\app-debug.apk
```

## 安装（小米手机需要注意）

`adb install` 被 MIUI 拦下：`INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`。
解决办法二选一：

**A. 文件管理器安装（最快）**

APK 已经推到手机：`内部存储/Download/Mineradio-portrait-debug.apk`

文件管理 → 下载 → 点这个 APK → 允许「安装未知应用」→ 安装。

**B. 打开 USB 安装（要登录小米账号）**

设置 → 更多设置 → 开发者选项 → 打开「USB 安装」→ 电脑执行：

```powershell
adb install -r "E:\IDM下载目录\DSH工作产生文件\mineradio-portrait\dist\Mineradio-portrait-debug.apk"
```

## 安装后验收

1. 竖屏打开「Mineradio」→ 应是手机布局（搜索栏 + 卡片单列 + 底部播放条），**不旋转横屏**
2. 右上「更多」→ 首页 / 登录
3. 登录页为竖排平台列表
4. 播放一首本地/在线歌曲，看底部播放条与页面是否正常
5. 横过来拿手机，应回到桌面布局（补丁不会给平板/横屏加手机类）

如果布局有偏差，这个 debug 包默认可在 `chrome://inspect` 里直接调试（WebView 调试已开启），可以继续用 `verify/cdp.js` 实时改 CSS/JS，再重新打包。

## 已知待观察

- 底座（bolaosi/Mineradio-Android 1.2.3）与网页版 2.2.x 的 DOM 有差异，个别选择器可能不命中；调整点在 `web/mr-phone/mr-phone.js` 的 `FIX_CSS`。
- 底座自带的 `android-mobile.js` / `android-ui.css` 可能与手机 CSS 叠加，若首屏冲突，可先禁用底座移动补丁，只留 `mr-phone`。
