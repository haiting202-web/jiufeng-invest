<#
    测量启动耗时.ps1 — 量化 DSH Desktop 的启动分阶段耗时，定位瓶颈到底在“进程/文件加载”还是“渲染/插件”。

    用法（不需要管理员）：
        cd <仓库根>\dsh-update-guard
        .\测量启动耗时.ps1                 # 测一次（要求 DSH 当前没在运行）
        .\测量启动耗时.ps1 -Runs 2         # 连测两次（第二次可看热缓存差异）
        .\测量启动耗时.ps1 -Keep           # 测完不关闭，留着窗口自己看

    测什么：
        T1 进程创建      —— exe 起来（说明杀软/loader 放行）
        T2 主窗口句柄    —— 窗口对象建好（JS 模块图基本加载完）
        T3 窗口可响应    —— 界面真的能交互（插件全部挂载完）
        T4 空闲确认      —— CPU 掉下来（启动真正结束，不用再等）
    另外记录这段时间里的磁盘 IO 操作数，用来判断“是不是在狂读文件”。
#>
[CmdletBinding()]
param(
    [int]$Runs = 1,
    [switch]$Keep,
    [int]$TimeoutSec = 180
)

$ErrorActionPreference = 'Stop'
$EXE_NAMES = @('DSH Desktop', 'DSHDesktop')

function Get-DshProcs {
    Get-Process -ErrorAction SilentlyContinue | Where-Object { $EXE_NAMES -contains $_.ProcessName }
}

function Resolve-ExePath {
    $c = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DSH Desktop\DSH Desktop.exe'),
        'D:\Program Files\DSH Desktop\DSH Desktop.exe',
        'C:\Program Files\DSH Desktop\DSH Desktop.exe'
    )
    foreach ($p in $c) { if (Test-Path $p) { return $p } }
    return $null
}

function Format-Ms([double]$ms) {
    if ($ms -lt 1000) { return ('{0:N0} ms' -f $ms) }
    return ('{0:N2} s' -f ($ms / 1000))
}

$exe = Resolve-ExePath
if (-not $exe) { Write-Error '找不到 DSH Desktop.exe，请把安装路径填进脚本的 Resolve-ExePath。'; exit 1 }

Write-Host ''
Write-Host '=== DSH 启动耗时测量 ===' -ForegroundColor Cyan
Write-Host ("可执行文件 : {0}" -f $exe)

$pre = Get-DshProcs
if ($pre.Count -gt 0) {
    Write-Host ("DSH 当前有 {0} 个进程在跑。" -f $pre.Count) -ForegroundColor Yellow
    if (-not $Keep) {
        Write-Host '测量需要干净状态。请先右键托盘图标退出 DSH，然后重跑本脚本。' -ForegroundColor Yellow
        Write-Host '（或加 -Keep 参数，脚本会自己结束这些进程 —— 会丢未保存的会话状态）' -ForegroundColor Yellow
        exit 2
    }
    Write-Host '按 -Keep 处理：关闭现有进程…' -ForegroundColor Yellow
    $pre | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
}

for ($run = 1; $run -le $Runs; $run++) {
    if ($Runs -gt 1) { Write-Host ("`n--- 第 {0}/{1} 次 ---" -f $run, $Runs) -ForegroundColor Cyan }

    # 清掉可能残留的 ELECTRON_RUN_AS_NODE（会让 DSH 被当纯 Node 跑，瞬间退出）
    if ($env:ELECTRON_RUN_AS_NODE) {
        Write-Host '注意：检测到 ELECTRON_RUN_AS_NODE，已临时清除（否则会静默退出）。' -ForegroundColor Yellow
        Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $p0 = Start-Process -FilePath $exe -PassThru
    $t1 = $null; $t2 = $t3 = $null
    $mainProc = $null

    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
        if (-not $t1) {
            $any = Get-DshProcs
            if ($any.Count -gt 0) { $t1 = $sw.Elapsed.TotalMilliseconds }
        }
        if ($t1 -and -not $t2) {
            foreach ($p in (Get-DshProcs)) {
                if ($p.MainWindowHandle -ne 0) { $mainProc = $p; $t2 = $sw.Elapsed.TotalMilliseconds; break }
            }
        }
        if ($t2 -and -not $t3 -and $mainProc) {
            try {
                $mainProc.Refresh()
                if ($mainProc.Responding -and $mainProc.MainWindowTitle) { $t3 = $sw.Elapsed.TotalMilliseconds }
            } catch { }
        }
        if ($t3) {
            # 等 CPU 空闲（启动真正结束）
            Start-Sleep -Milliseconds 700
            $procs = Get-DshProcs
            $cpu = ($procs | Measure-Object CPU -Sum).Sum
            if ($null -eq $script:lastCpu) { $script:lastCpu = $cpu }
            elseif ([math]::Abs($cpu - $script:lastCpu) -lt 0.6) { break }
            $script:lastCpu = $cpu
        }
        Start-Sleep -Milliseconds 120
    }
    $sw.Stop()

    $procs = Get-DshProcs
    $readOps = ($procs | Measure-Object -Property ReadOperationCount -Sum).Sum
    $readBytes = ($procs | Measure-Object -Property ReadTransferCount -Sum).Sum
    $otherOps = ($procs | Measure-Object -Property OtherOperationCount -Sum).Sum
    $wsMb = [math]::Round((($procs | Measure-Object -Property WorkingSet64 -Sum).Sum) / 1MB, 0)

    Write-Host ''
    Write-Host '--- 分阶段 ---' -ForegroundColor Green
    Write-Host ("  进程创建      T1 : {0}" -f $(if ($t1) { Format-Ms $t1 } else { '未出现（超时）' }))
    Write-Host ("  主窗口句柄    T2 : {0}{1}" -f $(if ($t2) { Format-Ms $t2 } else { '未出现' }), $(if ($t2 -and $t1) { ('   （窗口就绪 +' + (Format-Ms ($t2 - $t1)) + '）') } else { '' }))
    Write-Host ("  界面可响应    T3 : {0}{1}" -f $(if ($t3) { Format-Ms $t3 } else { '未出现' }), $(if ($t3 -and $t2) { ('   （渲染 +' + (Format-Ms ($t3 - $t2)) + '）') } else { '' }))
    Write-Host ("  空闲确认      T4 : {0}   <-- 这就是你体感的启动时间" -f (Format-Ms $sw.Elapsed.TotalMilliseconds)) -ForegroundColor Green
    Write-Host ''
    Write-Host '--- 启动期间的系统活动 ---' -ForegroundColor Green
    Write-Host ("  进程数            : {0}" -f $procs.Count)
    Write-Host ("  读操作数          : {0:N0} 次" -f $readOps)
    Write-Host ("  读取字节          : {0:N1} MB" -f ($readBytes / 1MB))
    Write-Host ("  其他 IO 操作      : {0:N0} 次" -f $otherOps)
    Write-Host ("  工作集合计        : {0:N0} MB" -f $wsMb)
    Write-Host ''
    Write-Host '判读要点：' -ForegroundColor DarkGray
    Write-Host '  · T1→T2 很长（>5s）且读取字节数很大  → 模块/文件加载慢，主因通常是 Defender 实时扫描' -ForegroundColor DarkGray
    Write-Host '  · T2→T3 很长                          → 渲染进程/插件初始化慢（前端脚本、插件数量）' -ForegroundColor DarkGray
    Write-Host '  · 读操作数上万                        → 逐个读小文件（取消 ASAR 的代价），排除项收益最大' -ForegroundColor DarkGray

    if ($run -lt $Runs) {
        Write-Host '关闭进程，准备下一次…' -ForegroundColor DarkGray
        Get-DshProcs | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        $script:lastCpu = $null
    } elseif (-not $Keep) {
        Write-Host ('（保留窗口，未自动关闭。要关就右键托盘退出。）') -ForegroundColor DarkGray
    }
}
Write-Host ''
