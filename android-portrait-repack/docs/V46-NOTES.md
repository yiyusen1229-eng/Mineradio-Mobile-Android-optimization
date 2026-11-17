# v46：代码/资源清理 + 架构整理 + 体积优化

## 1. 手机层重构（轻量化、模块化）

| 之前 | 现在 |
|---|---|
| 4 段 CSS 以 JS 字符串数组存在 `mr-phone.js` 里，运行时逐个 `<style>` 注入 | 全部抽成 **一个 `mr-phone/phone.css`**（静态文件，浏览器缓存、无运行时注入） |
| 3 个从网页抄来的 `mobile-shell.css / mobile-home.css / mobile-touch.css` | 合并进 `phone.css`（同文件、分段注释，少 2 个请求、少 2 个文件） |
| `mr-phone-early.js` 独立小文件 | 内联到 `index.html`（少 1 个请求） |
| `mr-phone.js` 57 KB | **32 KB**（-44%），删除 CSS 数组、`injectFixCss()`、重复的 `styleNotice()` 等死代码 |
| APK 里残留 `README.md` 等非运行文件 | 已删 |

现在手机层只有两个文件：

```
assets/public/mr-phone/
  phone.css     （合并后的样式，分段：base / fix / login / splash / layout）
  mr-phone.js   （单一 IIFE，按 状态→布局→交互→监听 分段）
```

## 2. APK 体积：112.9 MB → 83.0 MB（-29.9 MB，-26%）

`lib/arm64-v8a/libscenejni.so` 原来以**未压缩 STORED** 方式存进 APK（41.9 MB 占满）。

处理：

1. `AndroidManifest.xml`：`android:extractNativeLibs` 改为 `true`（安装时解压，运行正常）
2. 用 Java Zip 重打包：`lib/*.so` 改用 **Deflate**，其余条目保持原压缩方式（STORED 条目仍 STORED，避免破坏 resources.arsc）
3. `zipalign -p -f 4` + `apksigner` 重新签名

结果：**83,001,388 字节**（旧 112,890,240），已验证安装、启动、原生库加载正常。

> 剩余大头是运行时视觉素材（`assets/fonts` 22 MB、`assets/materials` 35 MB），属于 App 粒子/字体资源，删了会缺素材，未动。

## 3. 运行效率

- 手机层 JS 体积减半（解析/执行步骤更少）
- 不再每轮启动时创建/注入 4 个 `<style>`，样式一次性静态加载
- 轮询已降到 1500ms；提示条用单独 300ms 轻量轮询（只查一个容器）
- 布局函数带状态缓存，顺序/位置没变就完全跳过 DOM 操作

## 4. 验证（v46）

- 安装压缩版 APK 成功，启动正常（无 `Failed to open dex` / `ClassNotFoundException`）
- 开屏干净；首页：搜索框、头像按钮、底栏 7 键、DIY 按钮齐全
- 播放页：顶部歌曲信息、附加行 4 键、底栏 7 键、进度条两侧时间正常
- `phone.css`、`mr-phone.js` 均加载成功，原生 `.so` 解压运行正常

## 产物

`dist/Mineradio-portrait-repack.apk`（v46，83 MB，同签名覆盖安装）
