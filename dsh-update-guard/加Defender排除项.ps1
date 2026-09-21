<#
    加Defender排除项.ps1 — 给 DSH 的启动路径加 Windows Defender 排除项。

    为什么：DSH 2.0.10 取消了 ASAR 归档，app 包里 21,921 个文件（296 MB）以真实小文件形式
    存在。启动时 Node/Electron 要逐个 require 这些文件，而 Defender 的“按访问保护”会对
    每个首次打开的文件做实时校验 —— 单个文件约 20-30 ms。上千个文件叠起来就是几十秒。
    （实测：读 300 个不同文件 6.9 s，读同一个文件 300 次仅 0.019 s，相差 370 倍。）

    ⚠️ 必须用【管理员】PowerShell 运行（普通窗口会因权限被拒）。

    用法：
        # 以管理员身份打开 PowerShell，然后：
        cd <仓库根>\dsh-update-guard
        .\加Defender排除项.ps1                # 默认动作：先列出当前状态，再问你要不要加
        .\加Defender排除项.ps1 -Action Add    # 直接加
        .\加Defender排除项.ps1 -Action Verify # 只读检查
        .\加Defender排除项.ps1 -Action Remove # 撤销本脚本加的项

    安全性说明：排除的是“程序安装目录 + 你自己的数据目录”，不是整个磁盘。
    这些目录里只有 DSH 自己的文件与你自己的配置；代价是这些目录不再被实时扫描
    （理论上降低了防护，所以只在你信任这个软件的前提下使用）。
#>
[CmdletBinding()]
param(
    [ValidateSet('Add', 'Remove', 'Verify')]
    [string]$Action = 'Add',
    [switch]$IncludeProjectDirs,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ── 要排除的路径 ──────────────────────────────────────────────────────────
$paths = New-Object System.Collections.Generic.List[string]
foreach ($p in @(
        'D:\Program Files\DSH Desktop',
        'C:\Program Files\DSH Desktop',
        (Join-Path $env:USERPROFILE '.dsh'),
        (Join-Path $env:APPDATA 'DSH Desktop')
    )) { if (Test-Path $p) { $paths.Add((Resolve-Path $p).Path) } }

if ($IncludeProjectDirs) {
    # 三个目录按「本仓库布局」推导：同级目录，或脚本自己所在目录
    $repoRoot = Split-Path $PSScriptRoot -Parent
    foreach ($p in @("$repoRoot\dsh-ai-invest-sidebar", "$repoRoot\dsh-finance-tools", "$PSScriptRoot")) {
        if (Test-Path $p) { $paths.Add((Resolve-Path $p).Path) }
    }
}

$procs = @('DSH Desktop.exe')

Write-Host ''
Write-Host '=== DSH Defender 排除项 ===' -ForegroundColor Cyan
Write-Host ("管理员权限: {0}" -f $(if (Test-Admin) { '有' } else { '没有（Add/Remove 会失败）' })) -ForegroundColor $(if (Test-Admin) { 'Green' } else { 'Yellow' })

if (-not (Test-Admin)) {
    Write-Host ''
    Write-Host '请用管理员身份重开 PowerShell：' -ForegroundColor Yellow
    Write-Host '  开始菜单搜 PowerShell → 右键 → 以管理员身份运行' -ForegroundColor Yellow
    Write-Host ("  然后：cd {0}; .\加Defender排除项.ps1" -f $PSScriptRoot) -ForegroundColor Yellow
    exit 1
}

$pref = Get-MpPreference
$curPaths = @($pref.ExclusionPath)
$curProcs = @($pref.ExclusionProcess)

switch ($Action) {

    'Verify' {
        Write-Host ''
        Write-Host '--- 当前路径排除项 ---' -ForegroundColor Green
        if ($curPaths.Count) { $curPaths | ForEach-Object { Write-Host "  $_" } } else { Write-Host '  （空）' }
        Write-Host '--- 当前进程排除项 ---' -ForegroundColor Green
        if ($curProcs.Count) { $curProcs | ForEach-Object { Write-Host "  $_" } } else { Write-Host '  （空）' }

        Write-Host ''
        Write-Host '--- 本脚本关心的路径是否已排除 ---' -ForegroundColor Green
        foreach ($p in $paths) {
            $hit = $curPaths -contains $p
            Write-Host ("  [{0}] {1}" -f $(if ($hit) { '已排除' } else { '未排除' }), $p) -ForegroundColor $(if ($hit) { 'Green' } else { 'Yellow' })
        }
        Write-Host ''
        Write-Host ("实时保护: {0}" -f (-not $pref.DisableRealtimeMonitoring))
    }

    'Add' {
        Write-Host ''
        foreach ($p in $paths) {
            if ($curPaths -contains $p) { Write-Host ("  已存在，跳过 : {0}" -f $p) -ForegroundColor DarkGray; continue }
            Add-MpPreference -ExclusionPath $p
            Write-Host ("  已加入排除   : {0}" -f $p) -ForegroundColor Green
        }
        foreach ($n in $procs) {
            if ($curProcs -contains $n) { Write-Host ("  已存在，跳过 : {0}" -f $n) -ForegroundColor DarkGray; continue }
            Add-MpPreference -ExclusionProcess $n
            Write-Host ("  已加入排除   : {0}（进程）" -f $n) -ForegroundColor Green
        }
        Write-Host ''
        Write-Host '完成。重新启动 DSH，对比启动时间。' -ForegroundColor Green
        Write-Host '想量化对比就跑：.\测量启动耗时.ps1   或   .\诊断启动慢.ps1' -ForegroundColor DarkGray
        Write-Host ''
        Write-Host '注意：如果 DSH 又被覆盖安装（基座升级），路径本身不变，排除项依然有效，无需重做。' -ForegroundColor DarkGray
    }

    'Remove' {
        Write-Host ''
        if (-not $Force) {
            $ans = Read-Host '确认撤销本脚本添加的排除项？(y/N)'
            if ($ans -notmatch '^[yY]') { Write-Host '已取消。'; exit 0 }
        }
        foreach ($p in $paths) {
            if ($curPaths -contains $p) { Remove-MpPreference -ExclusionPath $p; Write-Host ("  已移除 : {0}" -f $p) -ForegroundColor Yellow }
        }
        foreach ($n in $procs) {
            if ($curProcs -contains $n) { Remove-MpPreference -ExclusionProcess $n; Write-Host ("  已移除 : {0}" -f $n) -ForegroundColor Yellow }
        }
        Write-Host ''
        Write-Host '已恢复原状。' -ForegroundColor Green
    }
}

# 结果复核
$after = Get-MpPreference
Write-Host ''
Write-Host '--- 复核 ---' -ForegroundColor Green
Write-Host ("  路径排除项 {0} 条，进程排除项 {1} 条" -f @($after.ExclusionPath).Count, @($after.ExclusionProcess).Count)
Write-Host ''
