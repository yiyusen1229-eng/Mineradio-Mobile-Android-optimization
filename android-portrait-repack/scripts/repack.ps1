#requires -Version 5.1
<#
  Mineradio Timing APK -> 竖屏 repack 一键脚本
  用法示例：
    .\repack.ps1 -BaseApk ..\..\base.apk `
                 -PatchDir ..\..\web\mr-phone `
                 -Jdk "E:\...\jdk-17" `
                 -Apktool "E:\...\apktool_2.10.0.jar" `
                 -BuildTools "E:\...\android-sdk\build-tools\34.0.0"
  产物：<WorkDir>\signed.apk
#>
param(
  [Parameter(Mandatory = $true)][string]$BaseApk,
  [string]$PatchDir = (Join-Path $PSScriptRoot '..\web\mr-phone'),
  [string]$WorkDir  = (Join-Path $PSScriptRoot 'out'),
  [string]$Jdk      = $env:JAVA_HOME,
  [string]$Apktool  = 'apktool.jar',
  [string]$BuildTools = '',
  [string]$Keystore = (Join-Path $PSScriptRoot 'debug.keystore')
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Assert-Path([string]$p, [string]$what) {
  if (-not (Test-Path $p)) { throw "找不到 $what : $p" }
}

Assert-Path $BaseApk '原 APK'
Assert-Path $PatchDir 'mr-phone 补丁目录'
$java = Join-Path $Jdk 'bin\java.exe'
Assert-Path $java 'JAVA_HOME/bin/java.exe'
Assert-Path $Apktool 'apktool.jar'
if (-not $BuildTools) { throw '请用 -BuildTools 指定 build-tools/34.0.0 目录' }
$zipalign = Join-Path $BuildTools 'zipalign.exe'
$apksigner = Join-Path $BuildTools 'apksigner.bat'
Assert-Path $zipalign 'zipalign.exe'
Assert-Path $apksigner 'apksigner.bat'

New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
$decoded = Join-Path $WorkDir 'decoded'
$unsigned = Join-Path $WorkDir 'unsigned.apk'
$aligned = Join-Path $WorkDir 'aligned.apk'
$signed = Join-Path $WorkDir 'signed.apk'

# 0) 调试证书
if (-not (Test-Path $Keystore)) {
  & (Join-Path $Jdk 'bin\keytool.exe') -genkeypair -v -keystore $Keystore -alias androiddebugkey `
    -storepass android -keypass android -keyalg RSA -keysize 2048 -validity 10000 `
    -dname 'CN=Android Debug,O=Android,C=US' | Out-Null
  Write-Host "已生成调试证书: $Keystore"
}

# 1) 解包（保留 dex）
Write-Host '[1/6] apktool 解包...'
if (Test-Path $decoded) { Remove-Item $decoded -Recurse -Force }
& $java -Xmx4g -jar $Apktool d -s -f $BaseApk -o $decoded
if ($LASTEXITCODE -ne 0) { throw 'apktool 解包失败' }

# 2) 解锁屏幕方向
Write-Host '[2/6] 修改 AndroidManifest 方向...'
$manifestPath = Join-Path $decoded 'AndroidManifest.xml'
$m = [IO.File]::ReadAllText($manifestPath)
if ($m -notmatch 'android:screenOrientation="landscape"') { Write-Warning 'manifest 里没有 landscape，跳过' }
$m = $m.Replace('android:screenOrientation="landscape"', 'android:screenOrientation="unspecified"')
[IO.File]::WriteAllText($manifestPath, $m, $utf8)

# 3) 替换“虚拟桌面缩放”脚本为自然视口
Write-Host '[3/6] 替换缩放脚本...'
$htmlPath = Join-Path $decoded 'assets\public\index.html'
Assert-Path $htmlPath 'assets/public/index.html'
$html = [IO.File]::ReadAllText($htmlPath)
$marker = $html.IndexOf('mineradio-ui-scale-v1')
if ($marker -lt 0) {
  Write-Warning '未找到缩放假脚本标记（可能已处理过）'
} else {
  $start = $html.LastIndexOf('<script', $marker)
  $end = $html.IndexOf('</script>', $marker)
  $natural = @'
<script>
    /* portrait repack: 自然视口 */
    (function () {
      var meta = document.querySelector('meta[name="viewport"]');
      if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.appendChild(meta); }
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
      window.__mrApplyUiScale = function () { return 1; };
      window.__mrUiScale = 1;
    })();
  </script>
'@
  $html = $html.Substring(0, $start) + $natural + $html.Substring($end + 9)
}

# 4) 注入 mr-phone 资源与标签
Write-Host '[4/6] 注入 mr-phone...'
$publicDir = Join-Path $decoded 'assets\public'
Copy-Item $PatchDir (Join-Path $publicDir 'mr-phone') -Recurse -Force
$meta = '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'
if ($html.Contains($meta) -and $html.IndexOf('mr-phone-early.js') -lt 0) {
  $headInject = $meta + "`n  <script src=`"mr-phone/mr-phone-early.js`"></script>" +
    "`n  <link rel=`"stylesheet`" href=`"mr-phone/mobile-shell.css`">" +
    "`n  <link rel=`"stylesheet`" href=`"mr-phone/mobile-home.css`">" +
    "`n  <link rel=`"stylesheet`" href=`"mr-phone/mobile-touch.css`">"
  $html = $html.Replace($meta, $headInject)
}
if ($html.IndexOf('mr-phone/mr-phone.js') -lt 0) {
  $html = $html.Replace('</body>', '<script src="mr-phone/mr-phone.js"></script>' + "`n</body>")
}
[IO.File]::WriteAllText($htmlPath, $html, $utf8)

# 5) 回编译
Write-Host '[5/6] 回编译...'
& $java -Xmx4g -jar $Apktool b $decoded -o $unsigned
if ($LASTEXITCODE -ne 0) { throw 'apktool 回编译失败' }

# 6) 对齐 + 签名
Write-Host '[6/6] zipalign + apksigner...'
& $zipalign -p -f 4 $unsigned $aligned
& $apksigner sign --ks $Keystore --ks-pass pass:android --key-pass pass:android --out $signed $aligned
if ($LASTEXITCODE -ne 0) { throw '签名失败' }

Write-Host ''
Write-Host "完成: $signed"
Write-Host '安装提醒：签名变了，必须先卸载旧包（会清空 App 数据）：'
Write-Host '  adb uninstall Mineradio.timing'
Write-Host "  adb install -r `"$signed`""
