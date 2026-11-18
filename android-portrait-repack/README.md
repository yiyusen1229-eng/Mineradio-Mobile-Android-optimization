# Mineradio 竖屏 Android 重打包（二次本地构建）

本目录记录把 **Mineradio 官方 2.2.2 timing APK** 重打包成「安卓系统手机竖屏适配优化」版本的完整成果：
手机层补丁源码、对官方 APK 的修改 diff、逐版开发日志、真机验证截图。

> **免责声明**：本项目仅为个人学习 / 自用而做的重打包，非原作者发布。
> Mineradio 的代码与素材版权归原作者所有，分发时请遵循本仓库的 `LICENSE`（GPL-3.0）与 `NOTICE.md`。
> 手机层样式参考自 mineradio.art 的移动端页面，仅做本地适配。

## 目录结构

```
android-portrait-repack/
├─ patch-layer/web/mr-phone/     # 注入的手机层补丁源码（核心）
│  ├─ phone.css                  # 样式：底栏/播放页/登录/开屏/转场动画（合并后单文件）
│  └─ mr-phone.js                # 逻辑：布局重排、状态切换、手势、缓存、转场
├─ patches/                      # 对官方 APK 解码目录的修改 diff
│  ├─ AndroidManifest.xml.patch  # 竖屏 / extractNativeLibs
│  ├─ MainActivity.smali.patch   # 全屏/状态栏/textZoom 原生补丁
│  ├─ styles*.patch              # windowFullscreen 等
│  └─ index.html.patch           # 注入 phone.css / mr-phone.js / 早期缓存脚本
├─ docs/                         # 逐版开发日志 V10 → V61
├─ verify/                       # 真机截图（已缩放）
└─ scripts/repack.ps1            # 重打包脚本
```

## 下载

APK 通过 **GitHub Releases** 发布，仓库本身不存二进制：

- 最新版：见 [Releases](https://github.com/yiyusen1229-eng/Mineradio-paused/releases)
- v61：约 83 MB（原包 113 MB，原生库压缩后减小 30 MB），debug keystore 签名，可直接覆盖安装。

## 构建步骤

准备：JDK 17、apktool 2.10.0、Android build-tools 34.0.0、官方 `base.apk`（Mineradio timing 2.2.2）。

```powershell
# 1. 解码官方 APK
java -jar apktool_2.10.0.jar d base.apk -o decoded

# 2. 应用 patches/（也可手动照 diff 改）
#    - AndroidManifest.xml：screenOrientation="unspecified"、extractNativeLibs="true"
#    - MainActivity.smali：applyFullscreen() 去掉全屏 flag、状态栏白色图标、setTextZoom(100)
#    - res/values*/styles.xml：windowFullscreen=false
#    - assets/public/index.html：注入手机层脚本（见 patch）

# 3. 覆盖手机层
Copy-Item patch-layer\web\mr-phone\* decoded\assets\public\mr-phone\ -Force -Recurse

# 4. 回编译
java -jar apktool_2.10.0.jar b decoded -o unsigned.apk

# 5. 压缩原生库（extractNativeLibs=true 时 lib/*.so 可用 Deflate）
#    用 Java ZipOutputStream 重写 zip：lib/*.so DEFLATED，其余保持原方式

# 6. 对齐 + 签名
zipalign.exe -p -f 4 unsigned.apk aligned.apk
apksigner.bat sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --out signed.apk aligned.apk

# 7. 安装
adb install -r signed.apk
```

> 注意：不要用 zip 直接替换 assets（会破坏 dex/FileProvider），每次都要走完整 apktool 回编译。

## 关键改动概览

| 类别 | 内容 |
|---|---|
| 屏幕方向 | Manifest 改 `unspecified`，竖屏 WebView |
| 状态栏 | 原生去掉全屏 flag，状态栏显示 + 白色图标（`setSystemBarsAppearance`） |
| 系统字体缩放 | `setTextZoom(100)`，避免系统字体放大破坏布局 |
| 手机层布局 | 注入 `phone-shell`，重排 7 键底栏：循环/收藏/上一首/播放/下一首/自动混音/列表 |
| 播放页 | 歌曲信息条移到顶部；附加四键（词/音量/控制条/沉浸）独立一行；进度条带时间 |
| 转场 | 首页↔播放页：底栏滑入滑出（纯 transform/opacity transition）、歌曲信息行 max-height 收缩、顶部条/四键滑入滑出、淡入淡出 |
| DIY 按钮 | 底部悬浮，位置随页面状态平滑过渡，避让四键 |
| 歌单面板 | 居中显示、关闭按钮、禁止左边缘手势误开 |
| 提示条 | 来源回退提示改为顶部歌曲信息条下方 |
| 音频 | 暂停淡出设为 0（即时暂停）；确认并开启原生音频缓存 |
| 网络缓存 | 早期包装原生 bridge 请求，歌单/推荐等 GET/POST 结果缓存 15 分钟；fetch 层 `/api/*` 缓存兜底 |
| 性能 | 渲染像素比限制 1.0；去掉 backdrop-filter；转场期间暂停布局轮询 |

## 已验证设备

- Xiaomi 14 Ultra（24031PN0DC），Android 16 / API 36，1440×3200，density 588
- CSS 视口 391×870（DPR≈3.675）
- 安装包名：`Mineradio.timing`

更详细的每版问题与修复见 `docs/` 与 `DEVLOG.md`。
