#Requires -Version 5.1
<#
.SYNOPSIS
    DSH 受控更新守卫：锁定 / 解锁 / 校验 DSH Desktop 自带的「检查更新…」入口。

.DESCRIPTION
    为什么要这个脚本
    ----------------
    DSH Desktop 基座升级会改动 Harness 内部接口。已经踩过的坑（0.1.1-rc.2 -> 0.1.5-rc.2）：
      * IWorkspaces.connectWorkspace() 被整体移除
      * IWorkspaces.archiveSession(id) 改成 archiveSession({ sessionId })
      * WorkspaceSnapshot.recentWorkspaceId 被移除
      * @deepseek-ai/dsh-client-runtime 被拆分废弃
      * 2.0.10 取消 ASAR 归档，~/.dsh 下 247 个软链接目标路径全部失效
    这些都会让自建插件 dsh-finance-tools / dsh-ai-invest-sidebar 静默失效或部分失效。
    因此基座版本必须由我们主动、可测试、可回滚地推进，绝不能让使用者顺手点一下
    「检查更新…」就换掉。本脚本就是那个刹车。

    守卫落在哪一层（重要）
    ----------------------
    DSH 的 patch 层序（见 dsh/lib/profile-boot-*.js 的 composeLive）：
        bundlePatches  ->  profile cordis.patch.yml  ->  home cordis.patch.yml  ->  overlays
    更新插件 desktop-updates 由应用自带的 cordis.patch.yml 通过 loadOverlayPatches()
    注入，属于**最后的 overlays 层**。所以在 profile 层写 disabled 会被它压掉，不生效。
    唯一确定有效的落点就是应用自带的那个文件：
        <AppRoot>\resources\app\cordis.patch.yml  ->  desktop-updates 条目加 disabled: true
    这与官方自己禁用插件的写法一致（同一文件里 desktop-terminal 就用 disabled，
    官方 resolveTelemetryPatch() 也是产出 { id, disabled: true }）。

    代价与配套流程
    --------------
    这个文件属于应用安装目录，**覆盖安装会被还原**。所以：
        每次基座升级完成后，必须重新跑一次  -Action Lock
    把这一步当成升级流程的固定收尾动作，跟验证 247 个软链接是一个层级的事。

    同一文件里的第二件事：system prompt 收窄（2026-09-18 并入）
    ----------------------------------------------------------
    这个 app 层 patch 还承载「投研收窄」的 C 步 —— 把 web-runtime 的
    surfaceContext 改成 false。源码依据 dsh-web-app/lib/index.js:182
    `if (config.surfaceContext) { addHarnessSourceSection(...); ...webSurfacePrompt(...) }`
    它同时关掉三段只对「开发 DSH 的人」有意义的内容：
        * harness:source 段（讲 checkout 在 D:\Program Files\...）
        * app:web-surface 段（讲 Web GUI / client-plugin HMR / pnpm run dev:web）
        * shell 里的 DSH_WEB_URL 环境变量（已确认自建插件不读它）
    实测省约 339 token/轮（system prompt 1,830 的约 18%）。
    它与更新守卫落在**同一个文件、同一层**，升级后同样被还原，所以并入本脚本：
    一次 -Action Lock 同时固化两件事，一次 -Action Unlock 同时还原两件事。

    第三件事：应用图标（2026-09-18 并入）
    ------------------------------------
    DSH 的任务栏/窗口图标读 <AppRoot>\resources\app\build\app-icon.png，
    系统托盘读同目录的 tray-icon-blue.png 与 tray-icon-blue@2x.png。
    这三个文件同样躺在应用安装目录里，**覆盖安装会被还原成官方图标**——
    用户换好的 logo 就悄悄没了（而且不会有任何报错，很容易过了几天才发现）。
    用户自己的图标成品放在 ~/.dsh/icons/（用户目录，升级不受影响），
    所以 Lock 时顺手把这 3 个文件贴回去就行，不需要重新抠图或重新生成。

    注意快捷方式不在处理范围：桌面/开始菜单 .lnk 的图标字段存在 %USERPROFILE%
    下的 .lnk 文件里，指向 ~/.dsh/icons/dsh.ico，不随安装目录被还原，无需重贴。
    （万一它也被改坏了，用 切换DSH图标.py apply 重跑一次即可。）

    想换成别的图：
        1) python 抠白底生成透明logo.py <图>            # 白底图先抠成透明底
        2) python 切换DSH图标.py apply <透明图>          # 生成并贴到三层
        之后本脚本的 Lock 就会一直沿用这套图标。

    第四件事：app 包品牌文案（2026-09-19 并入）
    ------------------------------------------
    有些文案插件层根本够不到，只能改 app 包文件：
      * 托盘悬停提示 —— 主进程 `tray.setToolTip(spec.productName)`
      * 窗口初始标题 —— spec.windowTitle
      * 托盘右键菜单、原生确认框、恢复助手、首次设置向导
    这些同样躺在安装目录里，**覆盖安装会被还原**，所以和图标一样并入 Lock。
    实际替换交给 品牌文案补丁.py（幂等、带备份、带 node --check 语法自检），
    本脚本只负责"发现不同步 → 调它贴回 → 复查"。

    安全边界（脚本里已固化，别越线）：
      - 绝不改 DESKTOP_PRODUCT_NAME / app.setName() —— 它同时决定 userData 目录，
        改了会换目录、丢配置。只改运行时显示用的 spec.productName 参数。
      - 只在"中文语境"里替换产品名，英文段与代码标识符（data-dsh-boot 等）不动。
      - 找到 python 才执行；找不到就跳过并提示，不让 Lock 整体失败。

.PARAMETER Action
    Lock    锁上——一次固化四件事：
              ① 禁用更新插件（桌面「检查更新…」消失）
              ② 关闭 web-runtime 的 surfaceContext（system prompt 收窄）
              ③ 把自定义图标贴回 app 目录
              ④ 把 app 包品牌文案（托盘 / 窗口标题 / 向导 / 恢复助手）贴回
            幂等，可重复执行；基座升级后必做。
    Unlock  解锁——恢复官方更新入口，并把 surfaceContext 还原为 true。
            图标与品牌文案**保持用户自定义、不还原**（Unlock 是调试用的，不是撤销偏好）。
            仅在调试新基座时使用。
    Verify  只读校验（默认），不改任何文件。升级后先跑这个。

.PARAMETER AppRoot
    DSH Desktop 安装根目录。默认自动探测（常见路径 + 注册表卸载项）。

.PARAMETER Force
    解锁时遇到「disabled 不是本脚本写的」也直接删除，不再询问。
    用于非交互场景（CI / 脚本调用）—— 不加此参数时会 Read-Host 询问，可能挂起。

.EXAMPLE
    .\切换更新守卫.ps1                 # 校验当前状态
    .\切换更新守卫.ps1 -Action Lock     # 锁上（升级后必做）
    .\切换更新守卫.ps1 -Action Unlock   # 临时解锁（调试新基座）
    .\切换更新守卫.ps1 -Action Unlock -Force   # 非交互解锁
#>
[CmdletBinding()]
param(
    [ValidateSet('Lock', 'Unlock', 'Verify')]
    [string]$Action = 'Verify',

    [string]$AppRoot = '',

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$GUARD_TAG   = 'GUARD:LOCKED'
$ROW_ID      = 'desktop-updates'
$STATE_FILE  = Join-Path $PSScriptRoot '守卫状态.json'

# 第二件事：system prompt 收窄（同一文件、同一层，所以要一起固化）
$SLIM_ROW_ID = 'web-runtime'
$SLIM_FIELD  = 'surfaceContext'
$SLIM_TAG    = 'GUARD:SLIM'

# 第三件事：应用图标（成品放用户目录，Lock 时贴回 app 目录）
$ICON_HOME  = Join-Path $env:USERPROFILE '.dsh\icons'
$ICON_FILES = @('app-icon.png', 'tray-icon-blue.png', 'tray-icon-blue@2x.png')

# 第四件事：app 包品牌文案（托盘 / 窗口标题 / 向导 / 恢复助手），交给 python 脚本
$BRAND_PATCH_PY = Join-Path $PSScriptRoot '品牌文案补丁.py'

function Get-FileSha {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $h = (Get-FileHash -Path $Path -Algorithm SHA256).Hash
    return $h.ToLower()
}

function Get-IconState {
    <#
        Available  ~/.dsh/icons 里 3 件成品是否齐全
        InSync     app 目录里那 3 件是否与成品逐一一致
        Items      逐件明细，供 -Action Verify 打印
    #>
    param([string]$Root)

    $build = Join-Path $Root 'resources\app\build'
    $items = @()
    foreach ($n in $ICON_FILES) {
        $hs = Get-FileSha (Join-Path $ICON_HOME $n)
        $hd = Get-FileSha (Join-Path $build $n)
        $items += [pscustomobject]@{
            Name      = $n
            SrcExists = [bool]$hs
            DstExists = [bool]$hd
            Same      = [bool]($hs -and $hd -and $hs -eq $hd)
        }
    }
    $have      = @($items | Where-Object { $_.SrcExists }).Count
    $same      = @($items | Where-Object { $_.Same }).Count
    $available = ($have -eq $ICON_FILES.Count)
    $inSync    = ($same -eq $ICON_FILES.Count)

    if (-not $available) {
        $detail = "自定义图标成品不齐（$have/$($ICON_FILES.Count) 在 $ICON_HOME）"
    } elseif ($inSync) {
        $detail = "app 目录 3 件图标均为自定义版本"
    } else {
        $detail = "app 目录有 $($ICON_FILES.Count - $same) 件不是自定义图标"
    }
    return [pscustomobject]@{ Available = $available; InSync = $inSync; Detail = $detail; Items = $items }
}

function Sync-Icons {
    param([string]$Root)
    $build = Join-Path $Root 'resources\app\build'
    if (-not (Test-Path $build)) { throw "找不到 $build（安装布局可能变了）" }
    $done = 0
    foreach ($n in $ICON_FILES) {
        $src = Join-Path $ICON_HOME $n
        if (-not (Test-Path $src)) { continue }
        Copy-Item -Path $src -Destination (Join-Path $build $n) -Force
        $done++
    }
    return $done
}

function Get-PythonExe {
    foreach ($c in @('python', 'py')) {
        $cmd = Get-Command $c -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    return $null
}

function Invoke-BrandPatch {
    <#
        调 品牌文案补丁.py 处理 app 包里的托盘 / 窗口标题 / 向导 / 恢复助手文案。
        返回 @{ Available; Ok; Exit; Reason }
        Available=false 表示环境不具备（没 python 或没脚本）—— 调用方应"跳过并提示"，
        而不是让整个 Lock 失败：文案不是关键路径，图标和更新锁才是。
    #>
    param([string]$Root, [switch]$Write)

    if (-not (Test-Path $BRAND_PATCH_PY)) {
        return @{ Available = $false; Ok = $false; Exit = -1; Reason = "找不到 $BRAND_PATCH_PY" }
    }
    $py = Get-PythonExe
    if (-not $py) {
        return @{ Available = $false; Ok = $false; Exit = -1; Reason = 'PATH 里找不到 python' }
    }

    $appDir = Join-Path $Root 'resources\app'
    if (-not (Test-Path $appDir)) {
        return @{ Available = $false; Ok = $false; Exit = -1; Reason = "找不到 $appDir" }
    }

    $savedEnc = $env:PYTHONIOENCODING
    $env:PYTHONIOENCODING = 'utf-8'
    try {
        $argv = @($BRAND_PATCH_PY, '--app', $appDir)
        if ($Write) {
            $argv += '--write'
            & $py @argv                       # 落盘时透传输出，好看到逐条改动与语法自检
        } else {
            $argv += 'verify'
            & $py @argv | Out-Null            # 只读校验，调用方自己打印摘要
        }
        $code = $LASTEXITCODE
    } finally {
        if ($null -eq $savedEnc) { Remove-Item Env:PYTHONIOENCODING -ErrorAction SilentlyContinue }
        else { $env:PYTHONIOENCODING = $savedEnc }
    }

    $reason = if ($code -eq 0) { 'app 包已是品牌文案' } else { "app 包仍有未替换的品牌文案（退出码 $code）" }
    return @{ Available = $true; Ok = ($code -eq 0); Exit = $code; Reason = $reason }
}

function Write-Head([string]$t) {
    Write-Host ''
    Write-Host ('=' * 66) -ForegroundColor DarkCyan
    Write-Host "  $t" -ForegroundColor Cyan
    Write-Host ('=' * 66) -ForegroundColor DarkCyan
}

function Write-Ok([string]$m)   { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Write-Warn2([string]$m){ Write-Host "  [警告] $m" -ForegroundColor Yellow }
function Write-Err2([string]$m) { Write-Host "  [错误] $m" -ForegroundColor Red }
function Write-Info([string]$m) { Write-Host "  ·      $m" -ForegroundColor Gray }

function Resolve-AppRoot {
    param([string]$Explicit)

    if ($Explicit) {
        if (Test-Path (Join-Path $Explicit 'DSH Desktop.exe')) { return $Explicit.TrimEnd('\') }
        throw "指定的 -AppRoot 下找不到 DSH Desktop.exe：$Explicit"
    }

    $candidates = @(
        'D:\Program Files\DSH Desktop',
        'C:\Program Files\DSH Desktop',
        (Join-Path $env:LOCALAPPDATA 'Programs\DSH Desktop')
    )
    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c 'DSH Desktop.exe')) { return $c.TrimEnd('\') }
    }

    $uninstallKeys = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($k in $uninstallKeys) {
        $items = Get-ItemProperty $k -ErrorAction SilentlyContinue |
                 Where-Object { $_.DisplayName -like '*DSH Desktop*' -and $_.InstallLocation }
        foreach ($i in $items) {
            $loc = $i.InstallLocation.TrimEnd('\')
            if (Test-Path (Join-Path $loc 'DSH Desktop.exe')) { return $loc }
        }
    }
    return $null
}

function Resolve-PatchPath {
    param([string]$Root)

    $modern = Join-Path $Root 'resources\app\cordis.patch.yml'
    if (Test-Path $modern) { return $modern }

    $legacy = Join-Path $Root 'resources\app.asar.unpacked\cordis.patch.yml'
    if (Test-Path $legacy) { return $legacy }

    return $null
}

function Get-AppVersion {
    param([string]$Root)
    foreach ($rel in @('resources\app\package.json', 'resources\app.asar.unpacked\package.json')) {
        $p = Join-Path $Root $rel
        if (Test-Path $p) {
            try {
                return (Get-Content $p -Raw -Encoding UTF8 | ConvertFrom-Json).version
            } catch { }
        }
    }
    return 'unknown'
}

function Get-DshProcesses {
    return @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*DSH*' })
}

function Read-PatchLines {
    param([string]$Path)
    return ,([System.IO.File]::ReadAllLines($Path, [System.Text.Encoding]::UTF8))
}

function Save-PatchLines {
    param([string]$Path, [string[]]$Lines)

    # 先确认可写；不可写就明确告知要提权，而不是抛个看不懂的异常
    try {
        $probe = "$Path.__guardprobe"
        [System.IO.File]::WriteAllText($probe, 'x', (New-Object System.Text.UTF8Encoding($false)))
        Remove-Item $probe -Force
    } catch {
        throw "无权写入 $Path。请用「以管理员身份运行」的 PowerShell 重试本脚本。原始错误：$($_.Exception.Message)"
    }

    $text = ($Lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Find-Row {
    <#
        在 patch 行数组里定位指定 id 的条目。
        返回 @{ RowIndex; NameIndex; DisabledIndex; Fields; Indent }
        DisabledIndex 为 -1 表示该条目当前没有 disabled 字段。
        Fields 是「标量字段名 -> 行号」的表（例：Fields['surfaceContext']），
        只收 2 空格以上缩进的 `key:` 行，用来抓 config 里的子字段。
    #>
    param([string[]]$Lines, [string]$Id)

    $rowIndex = -1
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i] -match "^\s*-\s*id:\s*$([regex]::Escape($Id))\s*$") { $rowIndex = $i; break }
    }
    if ($rowIndex -lt 0) { return $null }

    $indent = ([regex]::Match($Lines[$rowIndex], '^\s*')).Value
    $nameIndex = -1
    $disabledIndex = -1
    $fields = @{}

    for ($j = $rowIndex + 1; $j -lt $Lines.Count; $j++) {
        $line = $Lines[$j]
        if ($line -match '^\s*-\s*id:') { break }              # 下一个条目，收手
        if ($line -match "^\s*-\s") { break }                   # 同层其他列表项
        if ($line -match '^\s*name:\s') { $nameIndex = $j }
        if ($line -match '^\s*disabled:\s') { $disabledIndex = $j }
        $fm = [regex]::Match($line, '^\s{2,}([A-Za-z_][\w]*):\s')
        if ($fm.Success -and -not $fields.ContainsKey($fm.Groups[1].Value)) {
            $fields[$fm.Groups[1].Value] = $j
        }
    }

    return @{
        RowIndex      = $rowIndex
        NameIndex     = $nameIndex
        DisabledIndex = $disabledIndex
        Fields        = $fields
        Indent        = $(if ($nameIndex -ge 0) {
                              ([regex]::Match($Lines[$nameIndex], '^\s*')).Value
                          } else { "$indent  " })
    }
}

function Find-UpdateRow {
    param([string[]]$Lines)
    return Find-Row -Lines $Lines -Id $ROW_ID
}

function Test-GuardState {
    <#
        返回 @{ Locked; Marked; Detail }
        Locked  该条目当前是否 disabled
        Marked  disabled 行是否由本脚本写入（带 GUARD:LOCKED 标记）
    #>
    param([string[]]$Lines)

    $row = Find-UpdateRow -Lines $Lines
    if ($null -eq $row) {
        return @{ Locked = $false; Marked = $false; Detail = "未找到 $ROW_ID 条目（可能该版本已移除该插件）"; Row = $null }
    }
    if ($row.DisabledIndex -lt 0) {
        return @{ Locked = $false; Marked = $false; Detail = "$ROW_ID 条目存在，但未设置 disabled"; Row = $row }
    }
    $line = $Lines[$row.DisabledIndex]
    $marked = $line -match [regex]::Escape($GUARD_TAG)
    $isTrue = $line -match 'disabled:\s*(true|!!js\s+true)'
    $detail = if ($isTrue) { "$ROW_ID 已 disabled" } else { "$ROW_ID 的 disabled 不是 true：$($line.Trim())" }
    if ($marked) { $detail += "（带守卫标记）" }
    return @{ Locked = $isTrue; Marked = $marked; Detail = $detail; Row = $row }
}

function Test-SlimState {
    <#
        返回 @{ Found; Off; Marked; Detail; LineIndex }
        Found  行里是否存在 web-runtime 条目
        Off    surfaceContext 是否已是 false（收窄生效）
        Marked 该行是否由本脚本写入（带 GUARD:SLIM 标记）
    #>
    param([string[]]$Lines)

    $row = Find-Row -Lines $Lines -Id $SLIM_ROW_ID
    if ($null -eq $row) {
        return @{ Found = $false; Off = $false; Marked = $false; LineIndex = -1
                  Detail = "未找到 $SLIM_ROW_ID 条目（该版本可能改了行结构，需人工确认）" }
    }
    $idx = -1
    if ($row.Fields.ContainsKey($SLIM_FIELD)) { $idx = $row.Fields[$SLIM_FIELD] }
    if ($idx -lt 0) {
        return @{ Found = $true; Off = $false; Marked = $false; LineIndex = -1
                  Detail = "$SLIM_ROW_ID 条目里没有 $SLIM_FIELD 字段（官方可能已改结构）" }
    }

    $line   = $Lines[$idx]
    $marked = $line -match [regex]::Escape($SLIM_TAG)
    $isOff  = $line -match "$([regex]::Escape($SLIM_FIELD)):\s*false"
    $detail = if ($isOff) {
                  "$SLIM_ROW_ID.$SLIM_FIELD = false（DSH 开发说明段已关闭）"
              } else {
                  "$SLIM_ROW_ID.$SLIM_FIELD 不是 false：$($line.Trim())"
              }
    if ($marked) { $detail += "（带收窄标记）" }
    return @{ Found = $true; Off = $isOff; Marked = $marked; LineIndex = $idx; Detail = $detail }
}

function Set-SlimState {
    <#
        -Off  写入 surfaceContext: false（收窄）
        不带  还原为 surfaceContext: true（官方默认）
        返回改写后的完整行数组；目标行找不到时直接抛错（宁可停，不要静默改错文件）。
    #>
    param([string[]]$Lines, [switch]$Off)

    $state = Test-SlimState -Lines $Lines
    if (-not $state.Found -or $state.LineIndex -lt 0) {
        throw "$($state.Detail) —— 无法收窄 system prompt，请人工确认后再手工处理。"
    }

    $newLines = New-Object System.Collections.Generic.List[string]
    $newLines.AddRange([string[]]$Lines)
    $indent = ([regex]::Match($Lines[$state.LineIndex], '^\s*')).Value

    if ($Off) {
        $newLines[$state.LineIndex] = "$indent$SLIM_FIELD`: false   # $SLIM_TAG 关闭 DSH 开发说明段（harness:source + app:web-surface）"
    } else {
        $newLines[$state.LineIndex] = "$indent$SLIM_FIELD`: true"
    }
    return $newLines.ToArray()
}

function Save-GuardState {
    param([string]$Root, [string]$Version, [string]$Action)
    $patchPath = Resolve-PatchPath -Root $Root
    $slimOff = $false
    if ($patchPath -and (Test-Path $patchPath)) {
        try { $slimOff = (Test-SlimState -Lines (Read-PatchLines -Path $patchPath)).Off } catch { }
    }
    $iconsInSync = $false
    try { $iconsInSync = (Get-IconState -Root $Root).InSync } catch { }
    $brandDone = $false
    try { $brandDone = (Invoke-BrandPatch -Root $Root).Ok } catch { }

    $obj = [ordered]@{
        action            = $Action
        appRoot           = $Root
        appVersion        = $Version
        timestamp         = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        patchPath         = $patchPath
        updateLocked      = $true
        surfaceContextOff = $slimOff
        iconsInSync       = $iconsInSync
        brandCopyApplied  = $brandDone
    }
    $obj | ConvertTo-Json -Depth 4 | Set-Content -Path $STATE_FILE -Encoding UTF8
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

$root = Resolve-AppRoot -Explicit $AppRoot
if (-not $root) {
    Write-Err2 ' 探测不到 DSH Desktop 安装目录。请用 -AppRoot "D:\Program Files\DSH Desktop" 指定。'
    exit 2
}

$patchPath = Resolve-PatchPath -Root $root
$version   = Get-AppVersion -Root $root

Write-Head "DSH 受控更新守卫 · $Action"
Write-Info "安装目录   : $root"
Write-Info "应用版本   : $version"
Write-Info "patch 文件 : $patchPath"

if (-not $patchPath) {
    Write-Err2 ' 该安装目录下找不到 cordis.patch.yml（现代布局应为 resources\app\cordis.patch.yml）。'
    exit 2
}

$lines = Read-PatchLines -Path $patchPath
$state = Test-GuardState -Lines $lines

Write-Host ''
Write-Host '  当前守卫状态' -ForegroundColor White
if ($state.Locked)  { Write-Ok   ($state.Detail) }
else                { Write-Warn2 ($state.Detail) }

switch ($Action) {

    'Verify' {
        $slim = Test-SlimState -Lines $lines

        Write-Host ''
        Write-Host '  ① 受控更新守卫' -ForegroundColor White
        if ($state.Locked -and $state.Marked) {
            Write-Ok '更新入口处于锁定状态，使用者不会看到「检查更新…」。'
        } elseif ($state.Locked -and -not $state.Marked) {
            Write-Warn2 '更新入口虽被禁用，但不是本脚本写入的（无守卫标记），升级后可能已被官方配置覆盖来源。'
            Write-Info  "建议执行 -Action Lock 重新固化。"
        } else {
            Write-Err2 '更新入口处于打开状态，使用者可以直接更新基座 —— 与受控更新流程不符。'
            Write-Info  "请执行：.\切换更新守卫.ps1 -Action Lock"
        }

        Write-Host ''
        Write-Host '  ② system prompt 收窄（surfaceContext）' -ForegroundColor White
        if (-not $slim.Found) {
            Write-Warn2 $slim.Detail
        } elseif ($slim.Off -and $slim.Marked) {
            Write-Ok ($slim.Detail + '（省约 339 token/轮）')
        } elseif ($slim.Off) {
            Write-Warn2 ($slim.Detail + '（不是本脚本写入的）')
        } else {
            Write-Warn2 $slim.Detail
            Write-Info  '建议执行 -Action Lock 一并固化（每次基座升级后都会被还原）。'
        }

        Write-Host ''
        Write-Host '  ③ 应用图标（任务栏 / 窗口 / 托盘）' -ForegroundColor White
        $icons = Get-IconState -Root $root
        if (-not $icons.Available) {
            Write-Warn2 $icons.Detail
            Write-Info  '想换图标：先跑 抠白底生成透明logo.py，再跑 切换DSH图标.py apply <透明图>。'
        } elseif ($icons.InSync) {
            Write-Ok $icons.Detail
        } else {
            Write-Err2 $icons.Detail
            foreach ($it in @($icons.Items | Where-Object { -not $_.Same })) {
                if (-not $it.DstExists) { Write-Info "   $($it.Name)  ★ app 目录里不存在" }
                else                    { Write-Info "   $($it.Name)  内容与成品不一致" }
            }
            Write-Info '执行 -Action Lock 会自动把这 3 件贴回 app 目录。'
        }

        Write-Host ''
        Write-Host '  ④ app 包品牌文案（托盘 / 窗口标题 / 向导 / 恢复助手）' -ForegroundColor White
        $brand = Invoke-BrandPatch -Root $root
        if (-not $brand.Available) {
            Write-Warn2 "环境不具备，跳过：$($brand.Reason)"
        } elseif ($brand.Ok) {
            Write-Ok '托盘提示、窗口标题、首次向导、恢复助手均为品牌文案。'
        } else {
            Write-Err2 $brand.Reason
            Write-Info  '执行 -Action Lock 会自动贴回（等价于 python 品牌文案补丁.py --write）。'
        }

        $running = Get-DshProcesses
        Write-Host ''
        Write-Info "DSH 进程数 : $($running.Count)"
        if ($state.Locked -or $slim.Off) {
            Write-Info '注意：patch 层改动需 DSH 重启一次才生效（app 层在启动时加载，不参与热重载）；'
            Write-Info '      图标同样要重启 DSH 才会刷新任务栏与托盘。'
        }
    }

    'Lock' {
        Write-Host ''
        Write-Host '  ① 受控更新守卫' -ForegroundColor White

        if ($state.Locked -and $state.Marked) {
            Write-Ok '已经是锁定状态，无需改动。'
        } else {
            $row = $state.Row
            if ($null -eq $row) {
                Write-Err2 " 在 $patchPath 里找不到 $ROW_ID 条目，无法加锁。"
                Write-Info  '可能该版本改用了别的 id。请先人工确认后再更新本脚本的 $ROW_ID。'
                exit 3
            }

            $guardLine = "$($row.Indent)disabled: true   # $GUARD_TAG 受控更新守卫 · 管理脚本 $PSScriptRoot\切换更新守卫.ps1"
            $newLines  = New-Object System.Collections.Generic.List[string]
            $newLines.AddRange([string[]]$lines)

            if ($row.DisabledIndex -ge 0) {
                $newLines[$row.DisabledIndex] = $guardLine
            } else {
                $insertAt = if ($row.NameIndex -ge 0) { $row.NameIndex + 1 } else { $row.RowIndex + 1 }
                $newLines.Insert($insertAt, $guardLine)
            }

            Save-PatchLines -Path $patchPath -Lines $newLines.ToArray()
            Write-Ok "已锁上：$ROW_ID 加了 disabled: true"

            $after = Test-GuardState -Lines (Read-PatchLines -Path $patchPath)
            if ($after.Locked -and $after.Marked) { Write-Ok '写入校验通过。' }
            else { Write-Err2 '写入校验未通过，请人工检查该文件。'; exit 4 }
        }

        # ── ② system prompt 收窄：同一个文件、同一层，升级后一起被还原 ──────────
        Write-Host ''
        Write-Host '  ② system prompt 收窄（surfaceContext）' -ForegroundColor White

        $slim = Test-SlimState -Lines (Read-PatchLines -Path $patchPath)
        if (-not $slim.Found -or $slim.LineIndex -lt 0) {
            Write-Err2 " $($slim.Detail)"
            Write-Info  "无法收窄，请人工确认 $patchPath 里 $SLIM_ROW_ID 行的 $SLIM_FIELD 字段。"
            exit 3
        }

        if ($slim.Off -and $slim.Marked) {
            Write-Ok '已经是收窄状态，无需改动。'
        } else {
            $slimLines = Set-SlimState -Lines (Read-PatchLines -Path $patchPath) -Off
            Save-PatchLines -Path $patchPath -Lines $slimLines

            $slimAfter = Test-SlimState -Lines (Read-PatchLines -Path $patchPath)
            if ($slimAfter.Off -and $slimAfter.Marked) {
                Write-Ok "已关闭 $SLIM_ROW_ID.$SLIM_FIELD（省约 339 token/轮）"
            } else {
                Write-Err2 '收窄写入校验未通过，请人工检查该文件。'; exit 4
            }
        }

        # ── ③ 应用图标：贴回 app 目录（覆盖安装会还原成官方图标）──────────────
        Write-Host ''
        Write-Host '  ③ 应用图标（任务栏 / 窗口 / 托盘）' -ForegroundColor White

        $icons = Get-IconState -Root $root
        if (-not $icons.Available) {
            Write-Warn2 $icons.Detail
            Write-Info  '跳过。想换图标：先跑 抠白底生成透明logo.py，再跑 切换DSH图标.py apply <透明图>。'
        } elseif ($icons.InSync) {
            Write-Ok '已是自定义图标，无需改动。'
        } else {
            $n = Sync-Icons -Root $root
            $after3 = Get-IconState -Root $root
            if ($after3.InSync) {
                Write-Ok "已贴回 $n 件图标（app-icon.png / tray-icon-blue.png / tray-icon-blue@2x.png）"
            } else {
                Write-Err2 "贴回后校验未通过（$($after3.Detail)），请人工检查该目录是否可写。"
                exit 4
            }
        }

        # ── ④ app 包品牌文案：贴回（覆盖安装会还原）───────────────────────────
        Write-Host ''
        Write-Host '  ④ app 包品牌文案（托盘 / 窗口标题 / 向导 / 恢复助手）' -ForegroundColor White

        $brand = Invoke-BrandPatch -Root $root
        if (-not $brand.Available) {
            Write-Warn2 "环境不具备，跳过：$($brand.Reason)"
            Write-Info  '不影响更新锁与图标。想单独补跑：python 品牌文案补丁.py --write'
        } elseif ($brand.Ok) {
            Write-Ok '已是品牌文案，无需改动。'
        } else {
            Write-Info '检测到未同步，正在贴回（会逐条列出改动并做语法自检）…'
            $brand2 = Invoke-BrandPatch -Root $root -Write
            if ($brand2.Ok) {
                Write-Ok '已贴回品牌文案。'
            } else {
                Write-Err2 "贴回失败（退出码 $($brand2.Exit)），请人工检查；备份在 brand-copy-backup-* 下。"
                exit 4
            }
        }

        Save-GuardState -Root $root -Version $version -Action 'Lock'

        $running = Get-DshProcesses
        Write-Host ''
        if ($running.Count -gt 0) {
            Write-Warn2 "DSH 正在运行（$($running.Count) 个进程），本次改动尚未生效。"            Write-Info  '请右键系统托盘图标 →「退出」，再重新启动 DSH。'
        } else {
            Write-Info 'DSH 未运行，下次启动即生效。'
        }
    }

    'Unlock' {
        Write-Host ''
        Write-Host '  ① 受控更新守卫' -ForegroundColor White

        if (-not $state.Locked) {
            Write-Ok '本来就是打开状态，无需改动。'
        } else {
            $row = $state.Row
            if (-not $state.Marked) {
                if ($Force) {
                    Write-Warn2 '该 disabled 字段不是本脚本写的（无守卫标记），因指定 -Force 仍将删除。'
                } else {
                    Write-Warn2 '该 disabled 字段不是本脚本写的（无守卫标记），可能是官方原有配置。'
                    Write-Warn2 '为避免破坏官方行为，本脚本不会自动删除它。'
                    Write-Err2  ' 如确认要强行删除，请加 -Force 重新执行。'
                    exit 5
                }
            }

            $newLines = New-Object System.Collections.Generic.List[string]
            $newLines.AddRange([string[]]$lines)
            $newLines.RemoveAt($row.DisabledIndex)

            Save-PatchLines -Path $patchPath -Lines $newLines.ToArray()
            Write-Ok "已解锁：移除 $ROW_ID 的 disabled 行，官方更新入口恢复。"

            $after = Test-GuardState -Lines (Read-PatchLines -Path $patchPath)
            if (-not $after.Locked) { Write-Ok '写入校验通过。' }
            else { Write-Err2 '写入校验未通过，请人工检查该文件。'; exit 4 }
        }

        # ── ② 还原 system prompt 段（官方默认 true）──────────────────────────
        Write-Host ''
        Write-Host '  ② system prompt 收窄（surfaceContext）' -ForegroundColor White

        $slim = Test-SlimState -Lines (Read-PatchLines -Path $patchPath)
        if (-not $slim.Found -or $slim.LineIndex -lt 0) {
            Write-Warn2 $slim.Detail
        } elseif (-not $slim.Off) {
            Write-Ok '本来就是官方默认（true），无需改动。'
        } else {
            $slimLines = Set-SlimState -Lines (Read-PatchLines -Path $patchPath)
            Save-PatchLines -Path $patchPath -Lines $slimLines

            $slimAfter = Test-SlimState -Lines (Read-PatchLines -Path $patchPath)
            if (-not $slimAfter.Off) { Write-Ok "已还原：$SLIM_ROW_ID.$SLIM_FIELD = true" }
            else { Write-Err2 '还原写入校验未通过，请人工检查该文件。'; exit 4 }
        }

        # ── ③ 应用图标：Unlock 刻意不动它（解锁是调试，不是撤销用户偏好）────
        Write-Host ''
        Write-Host '  ③ 应用图标（任务栏 / 窗口 / 托盘）' -ForegroundColor White
        $icons = Get-IconState -Root $root
        if (-not $icons.Available) {
            Write-Info '未检测到自定义图标成品，保持官方图标不动。'
        } else {
            Write-Ok  '保持用户自定义图标（Unlock 不还原偏好）。'
            Write-Info '如需恢复官方图标：python 切换DSH图标.py revert'
        }

        # ── ④ app 包品牌文案：Unlock 同样不动（品牌是用户偏好，不是调试开关）──
        Write-Host ''
        Write-Host '  ④ app 包品牌文案（托盘 / 窗口标题 / 向导 / 恢复助手）' -ForegroundColor White
        $brand = Invoke-BrandPatch -Root $root
        if (-not $brand.Available) {
            Write-Info "环境不具备，跳过：$($brand.Reason)"
        } elseif ($brand.Ok) {
            Write-Ok '保持品牌文案（Unlock 不还原偏好）。'
        } else {
            Write-Warn2 '当前不是品牌文案（刚覆盖安装过？）。补跑：-Action Lock，或 python 品牌文案补丁.py --write'
        }

        Save-GuardState -Root $root -Version $version -Action 'Unlock'

        Write-Host ''
        Write-Warn2 '解锁后 DSH 可以自行升级基座，自建插件有可能失效。'
        Write-Info  '调试完成后记得重新执行 -Action Lock（system prompt 收窄与自定义图标会一起重新固化）。'
    }
}

Write-Host ''
Write-Host ('-' * 66) -ForegroundColor DarkGray
Write-Info "状态记录 : $STATE_FILE"
Write-Host ''
