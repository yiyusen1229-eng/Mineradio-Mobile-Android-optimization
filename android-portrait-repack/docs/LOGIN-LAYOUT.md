# 登录面板竖屏重排（repack v2）

## 问题

原版登录面板是桌面版「节点图」布局，竖屏下直接叠上去后：

- 面板整体比屏幕高，顶部被挤出屏幕（header 在 y=-93）
- 「退出登录 / ×」浮在右侧，压住第一行平台
- 平台行带拖拽把手、右侧「拖到 MR」端口、SVG 连线，手机上全是干扰
- 二维码抽屉展开后被裁掉，底部按钮点不到
- 右上「…」手机壳按钮压在弹层上

## 处理（全部在 `web/mr-phone/mr-phone.js` 的 `LOGIN_CSS`，只对 `body.phone-shell` 生效）

| 项 | 做法 |
|---|---|
| 弹层 | 固定为屏幕内卡片：`display:flex` 居中、`max-height:100%`、圆角 18、背景 `rgba(6,16,14,.97)` |
| 头部 | `login-panel-head` 变成 sticky 顶栏（退出登录 / × 一行） |
| 平台列表 | `#login-node-graph` 改为纵向 flex 列表，行高 52，接口不再绝对定位 |
| 干扰元素 | 隐藏拖拽把手、`flow-port` 端口、SVG 连线 |
| 抽屉 | `#login-auth-drawer` 进入滚动流，二维码/按钮随内容滚动，不再被裁 |
| MR 卡按钮 | `.login-mode-node` 固定 118px、12px 字号，Cookie 不再截断 |
| 手机壳 | `body:has(#login-modal.show) .phone-chrome-slot{display:none}`，弹层打开时隐藏「…」 |

## 结果

真机（Xiaomi 14 Ultra，391×870）验证：

- 顶栏「退出登录 / ×」固定在顶部，不压内容
- 平台列表 6 行 + MR 卡完整可见，可滚动
- 选中平台后二维码抽屉在下方展开，按钮（先搜索一首歌 / Cookie 导入 / 刷新二维码）都点得到
- 弹层打开时右上「…」自动隐藏

截图：`verify/repack-login.png`

## 产物

`dist/Mineradio-portrait-repack.apk`（重新构建并已覆盖安装到手机；同签名，升级不需要卸载）
