# v53：播放页歌曲信息条右侧空位填上账号头像

## 原因

- 歌曲信息条右侧留了 64px 给账号头像（`right:64px`）
- 但转场规则里 `body.phone-shell.mr-player-page .phone-chrome-slot{opacity:0}` 把右上角头像一起淡出了
- 结果：留了位置但头像不显示 → 右边空一块

## 修复

播放页强制头像可见：

```css
body.phone-shell.mr-player-page .phone-chrome-slot{opacity:1!important;transform:none!important;pointer-events:auto!important;}
```

真机验证：头像 44×44 在 (336,54)，正好填在歌曲信息条右侧留出的位置；点它仍然弹出「首页/登录/DIY/歌单」菜单。

## 产物

`dist/Mineradio-portrait-repack.apk`（v53，83 MB，同签名覆盖安装）
