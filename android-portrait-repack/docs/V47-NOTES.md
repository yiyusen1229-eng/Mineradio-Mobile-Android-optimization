# v47：首页 ↔ 播放页 过渡动画（参照原 App 的转场节奏）

之前是瞬间切换（class 一加就变），所以看起来“咔”一下很生硬。现在按你描述的流程做了完整转场。

## 首页 → 播放页

| 元素 | 动画 |
|---|---|
| 搜索框 | 向上滑出 + 淡出（`translateY(-64px)`，0.3s） |
| 首页内容（`#empty-home`） | 向下滑出 + 淡出（0.34s，ease-out） |
| 底栏 | 先向下收起再回来（`mrBarFold` keyframe：0% 原位 → 42% 下移 135% 淡出 → 100% 回位），歌曲信息随之被“收走” |
| 顶部歌曲信息条 | 从屏幕上方滑入（`translateY(-160%)` → 0）+ 淡入，延迟 60ms |
| 四个附加按钮 | 从右侧滑入（`translateX(150%)` → 0）+ 淡入，延迟 120ms |

## 播放页 → 首页（反向）

- 顶部歌曲信息条：向上滑走 + 淡出
- 四个附加按钮：向右滑走 + 淡出
- 底栏：同样做一次收起/回位
- 随后首页内容向上滑入、搜索框从上方滑回，全部淡入
- 用 `mr-return-home` 类先跑 320ms 退场动画，再切回首页布局，保证顺序正确

## 实现方式

- 全部用 **CSS transition / keyframes**（只动 `transform` + `opacity`，走合成层，不触发布局）
- 关键元素加 `will-change: transform,opacity`
- 统一缓动 `cubic-bezier(.22,.9,.25,1)`，时长 0.3–0.56s
- 搜索框/右上角不再用 `display:none` 切换，改成透明度+位移过渡，才能淡出淡入

## 验证（v47）

- 进播放页：`#search-area` 有 2 个过渡、`#bottom-bar` 跑 `mrBarFold`、`.mr-top-track` 跑 `mrTopIn`、`#mr-player-extras` 跑 `mrRightIn`
- 按返回：body 出现 `mr-return-home`，顶部条/附加行各 1 个退场动画；320ms 后首页恢复（`empty-home-active`、opacity 1）
- 最终布局、底栏 7 键、顶部歌曲信息、附加四键均正常

## 产物

`dist/Mineradio-portrait-repack.apk`（v47，83 MB，同签名覆盖安装）
