# 原版 Timing APK 竖屏化（repack）流程

目标：不改界面、不换底座，直接把 **你原来那个 114 MB 的 `Mineradio.timing`** 改成竖屏手机布局。

- 产物：`dist/Mineradio-portrait-repack.apk`（112.9 MB，debug 证书签名）
- 已完成并在 Xiaomi 14 Ultra 真机验证：竖屏启动、手机单列布局、底部播放条、右上「…」菜单、登录面板竖排

## 改了什么

| 位置 | 改动 |
|---|---|
| `AndroidManifest.xml` | `android:screenOrientation="landscape"` → `"unspecified"`（跟随手机方向） |
| `assets/public/index.html` | 把内联的「虚拟桌面缩放」脚本（定位标记 `mineradio-ui-scale-v1`）替换为**自然视口**脚本（`device-width / initial-scale=1`） |
| `assets/public/mr-phone/` | 新增手机布局补丁：3 个 mobile CSS + `mr-phone-early.js` + `mr-phone.js` |
| `assets/public/index.html` | `<head>` 注入 early 脚本 + 3 个 CSS；`</body>` 前注入 `mr-phone.js` |

## 工具

- JDK 17（本机：`_tmp/tools/jdk/jdk-17.0.21+9`）
- apktool 2.10.0（`_tmp/tools/apktool_2.10.0.jar`）
- Android build-tools 34.0.0（`zipalign` / `apksigner`）
- 调试证书：`repack/debug.keystore`（alias `androiddebugkey`，storepass/keypass 都是 `android`）

## 复现步骤

```powershell
$env:JAVA_HOME = "<jdk17>"
$apktool = "<apktool.jar>"
$bt = "<build-tools>/34.0.0"

# 1. 从手机拉原包（或用手上的 base.apk）
adb shell pm path Mineradio.timing
adb pull /data/app/.../base.apk .\base.apk

# 2. 解包（-s 保留 dex，不反编译 smali，快且稳）
java -jar $apktool d -s -f base.apk -o decoded

# 3. 改 orientation
(Get-Content decoded\AndroidManifest.xml -Raw).Replace(
  'android:screenOrientation="landscape"',
  'android:screenOrientation="unspecified"'
) | Set-Content decoded\AndroidManifest.xml -Encoding utf8

# 4. 替换缩放脚本：用 'mineradio-ui-scale-v1' 定位它所在的 <script> 整块，替换为自然视口脚本
#    （脚本见 repack/repack.ps1 的 Patch-Html 函数）

# 5. 注入 mr-phone
Copy-Item .\web\mr-phone decoded\assets\public\mr-phone -Recurse -Force
#    在 meta viewport 后插入 early + 3 个 CSS；在 </body> 前插入 mr-phone.js
#    （见 repack/repack.ps1）

# 6. 回编译 + 对齐 + 签名
java -jar $apktool b decoded -o unsigned.apk
& "$bt\zipalign.exe" -p -f 4 unsigned.apk aligned.apk
& "$bt\apksigner.bat" sign --ks repack\debug.keystore --ks-pass pass:android --key-pass pass:android --out signed.apk aligned.apk

# 7. 安装（签名变了：必须先卸载旧包，会清空 App 数据）
adb uninstall Mineradio.timing
adb install -r signed.apk
```

## 注意事项

- **必须卸载重装**：签名从原作者的密钥换成调试证书，系统不允许覆盖安装；App 内登录状态/设置会清空。
- MIUI 上 `adb install` 偶发 `INSTALL_FAILED_USER_RESTRICTED`：先 `adb shell input keyevent KEYCODE_WAKEUP` 唤醒屏幕再装，或手动点安装。
- 上游更新后要重新走一遍：拉新包 → 改 manifest → 替换缩放脚本 → 注入 mr-phone → 重签名。
- 这是**第三方改包自用**，不要公开分发（原包作者未授权、且涉及音乐平台接口）。
- 手机布局补丁来源：mineradio.art 的 `styles/mobile-*.css`（GPL-3.0，Mineradio by XxHuber）。
