# Mineradio 竖屏 Android 构建方案（C1）

目标：基于开源 Android 移植工程，产出**竖屏手机布局**的 Mineradio APK。

- 补丁：`web/mr-phone/`（已接入，见本文第 2 节）
- 底座：`base/mineradio-android/`（`git clone https://github.com/bolaosi/Mineradio-Android`）
- 验证截图：`verify/validated-portrait.png`

## 1. 为什么选这个底座

| 候选 | 说明 | 选择 |
|---|---|---|
| `bolaosi/Mineradio-Android` | Capacitor 壳 + Kotlin 原生音源/播放器；`device-width` 视口；Manifest **没有**锁横屏 | ✅ 本项目底座 |
| `Hao-Yu-Chen/Mineradio` | Capacitor + 内嵌 Node 运行时；Android 版也是横屏 UI | 备选 |
| 官方 `Mineradio-paused` | 只有桌面 Electron 源码，没有 Android 工程 | 不选 |
| 已装的 `Mineradio.timing` 2.2.2 | 第三方改包，原生壳无源码、锁横屏 | 只能改包，不选 |

关键点：bolaosi 的 `MainActivity` 里**没有** `setRequestedOrientation(...)`，Manifest 也没有 `screenOrientation`，所以系统会跟随手机方向 —— 竖屏可用，**不需要**改原生方向代码。

## 2. 已完成的改动

`base/mineradio-android/` 里相对上游的改动：

| 文件 | 改动 |
|---|---|
| `app/src/main/assets/mr-phone/*` | 新增 5 个文件（early js / 3 个 CSS / mr-phone.js） |
| `app/src/main/assets/index.html` | `<head>` 加 early 脚本 + 3 个 CSS；`</body>` 前加 mr-phone.js |

`index.html` 插入点（约 L6-L9 与 L26943）：

```html
<script src="mr-phone/mr-phone-early.js"></script>
<link rel="stylesheet" href="mr-phone/mobile-shell.css">
<link rel="stylesheet" href="mr-phone/mobile-home.css">
<link rel="stylesheet" href="mr-phone/mobile-touch.css">
...
<script src="mr-phone/mr-phone.js"></script>
</body>
```

## 3. 构建环境

- JDK 17（Temurin 或 Android Studio 自带）
- Android SDK：platform 34、build-tools 34.0.0、platform-tools
- Gradle 8.5（仓库自带 wrapper，首次构建自动下载）

```powershell
# 环境变量
$env:JAVA_HOME  = "<jdk17 路径>"
$env:ANDROID_HOME = "<android-sdk 路径>"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

# 构建 debug APK
cd base/mineradio-android
.\gradlew.bat --no-daemon assembleDebug

# 产物
# app/build/outputs/apk/debug/app-debug.apk
```

## 4. 真机验收清单

1. `adb install -r app-debug.apk`
2. 手机竖屏打开 → 首屏应是手机布局（搜索栏 + 卡片单列 + 底部播放条），不旋转横屏
3. 右上「更多」→ 首页 / 登录可用
4. 登录页竖排平台列表可点
5. 底部播放条播放时布局不塌
6. 横屏 / 平板切回桌面布局（`mr-phone-early.js` 不会给平板加类）
7. 键盘弹出时搜索框不被遮挡（`android:windowSoftInputMode="adjustResize"` 已有）

## 5. 已知风险

- 底座版本与 Timing 2.2.2 的 DOM 不完全一致：手机 CSS 是给 2.2.x 前端写的，个别选择器可能不命中，需要按截图微调（调整点都在 `mr-phone.js` 的 `FIX_CSS` 里）。
- 底座自带 `android-mobile.js` / `android-ui.css` 可能与手机 CSS 叠加，若首屏有冲突，优先关闭底座的移动端补丁，只留 `mr-phone`。
- 播放/音源走底座自身的 Kotlin 实现，与手机布局无关；布局修好后不影响播放链路。
- 许可：底座无 LICENSE 文件、上游是 GPL-3.0；若公开分发，请补齐 GPL-3.0 与 NOTICE，并注明基于 Mineradio。
