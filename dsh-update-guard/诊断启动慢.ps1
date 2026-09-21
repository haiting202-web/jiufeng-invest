<#
    诊断启动慢.ps1 — 一次启动，把所有能测的都测了，直接告诉你 40 秒花在哪。

    背景：DSH 自己会在 %APPDATA%\DSH Desktop\lifecycle-events\startup.jsonl 里记录
    每个启动阶段的时间戳。最近一次记录显示：
        总启动 46.7 s，其中 renderer-startup 一个阶段就占 40.1 s。
    本脚本启动 DSH 的同时逐秒采样 IO / CPU / 网络连接，从而判断那 40 秒到底是
        A 一直在读文件（→ 杀软逐文件扫描 / 无 ASAR 的小文件地狱）
        B 一直空转等网络（→ 某个请求超时）
        C 在烧 CPU（→ JS 编译 / 插件初始化）

    用法（普通 PowerShell 即可，不需要管理员）：
        cd <仓库根>\dsh-update-guard
        .\诊断启动慢.ps1                 # 先手动退出 DSH，再跑
        .\诊断启动慢.ps1 -TimeoutSec 240
        .\诊断启动慢.ps1 -SampleMs 300    # 采样更密
#>
[CmdletBinding()]
param(
    [int]$TimeoutSec = 180,
    [int]$SampleMs = 500
)

$ErrorActionPreference = 'Stop'

function Resolve-Exe {
    foreach ($p in @(
            (Join-Path $env:LOCALAPPDATA 'Programs\DSH Desktop\DSH Desktop.exe'),
            'D:\Program Files\DSH Desktop\DSH Desktop.exe',
            'C:\Program Files\DSH Desktop\DSH Desktop.exe')) {
        if (Test-Path $p) { return $p }
    }
    return $null
}
function Get-Dsh {
    Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'DSH*' }
}
function Mb($b) { '{0:N1}' -f ($b / 1MB) }

$exe = Resolve-Exe
if (-not $exe) { Write-Error '找不到 DSH Desktop.exe'; exit 1 }

$appDir = Join-Path $env:APPDATA 'DSH Desktop'
$lifecycle = Join-Path $appDir 'lifecycle-events\startup.jsonl'

if ((Get-Dsh).Count -gt 0) {
    Write-Host 'DSH 正在运行。请先右键托盘图标退出，再重跑本脚本。' -ForegroundColor Yellow
    exit 2
}

# 只分析本次启动新增的记录
$beforeLines = if (Test-Path $lifecycle) { (Get-Content $lifecycle -ErrorAction SilentlyContinue).Count } else { 0 }

Write-Host ''
Write-Host '=== 启动诊断开始 ===' -ForegroundColor Cyan
Write-Host ("exe: {0}" -f $exe)
if ($env:ELECTRON_RUN_AS_NODE) {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    Write-Host '已清除残留的 ELECTRON_RUN_AS_NODE' -ForegroundColor Yellow
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
Start-Process -FilePath $exe | Out-Null

$samples = New-Object System.Collections.Generic.List[object]
$prevCpu = 0.0; $prevReadBytes = [int64]0; $prevReadOps = [int64]0
$netSamples = New-Object System.Collections.Generic.List[object]
$lastNetAt = -9999

while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    $procs = Get-Dsh
    if ($procs.Count -eq 0) { Start-Sleep -Milliseconds $SampleMs; continue }

    $cpu = ($procs | Measure-Object CPU -Sum).Sum
    $rb = ($procs | Measure-Object ReadTransferCount -Sum).Sum
    $ro = ($procs | Measure-Object ReadOperationCount -Sum).Sum
    $ws = [math]::Round((($procs | Measure-Object WorkingSet64 -Sum).Sum) / 1MB)

    $samples.Add([pscustomobject]@{
            t          = [math]::Round($sw.Elapsed.TotalSeconds, 1)
            procs      = $procs.Count
            cpuDelta   = [math]::Round($cpu - $prevCpu, 2)
            readMbD    = [math]::Round(($rb - $prevReadBytes) / 1MB, 2)
            readOpsD   = $ro - $prevReadOps
            wsMb       = $ws
        })
    $prevCpu = $cpu; $prevReadBytes = $rb; $prevReadOps = $ro

    # 网络连接（每 2 秒一次，避免采样器本身拖慢启动）
    if ($sw.Elapsed.TotalSeconds - $lastNetAt -ge 2) {
        $lastNetAt = $sw.Elapsed.TotalSeconds
        try {
            $pids = $procs.Id
            $conns = Get-NetTCPConnection -ErrorAction SilentlyContinue |
                Where-Object { $pids -contains $_.OwningProcess }
            $netSamples.Add([pscustomobject]@{
                    t      = [math]::Round($sw.Elapsed.TotalSeconds, 1)
                    total  = $conns.Count
                    estab  = ($conns | Where-Object State -eq 'Established').Count
                    syn    = ($conns | Where-Object { $_.State -eq 'SynSent' -or $_.State -eq 'SynReceived' }).Count
                    remote = (($conns | Where-Object { $_.RemoteAddress -notin @('127.0.0.1', '::1', '0.0.0.0', '::') } |
                            Select-Object -ExpandProperty RemoteAddress -Unique) -join ',')
                })
        } catch { }
    }

    # 启动完成的标志：lifecycle 文件里出现 run.completed / run.failed
    if (Test-Path $lifecycle) {
        $lines = Get-Content $lifecycle -ErrorAction SilentlyContinue
        if ($lines.Count -gt $beforeLines) {
            $new = $lines[$beforeLines..($lines.Count - 1)]
            if ($new -match 'startup\.run\.(completed|failed)') { break }
        }
    }
    Start-Sleep -Milliseconds $SampleMs
}
$sw.Stop()

# ── 解析本次启动的阶段耗时 ────────────────────────────────────────────────
$stages = @()
if (Test-Path $lifecycle) {
    $lines = Get-Content $lifecycle -ErrorAction SilentlyContinue
    $new = if ($lines.Count -gt $beforeLines) { $lines[$beforeLines..($lines.Count - 1)] } else { @() }
    $evs = $new | Where-Object { $_ -match '^\s*\{' } | ForEach-Object { try { $_ | ConvertFrom-Json } catch { } }
    $names = @('electron-ready', 'shell-environment', 'runtime-bootstrap', 'profile-selection',
        'profile-composition', 'host-boot', 'renderer-startup', 'health-commit')
    $start = $null; $idx = 0
    foreach ($e in $evs) {
        if ($e.eventName -eq 'startup.stage.started') { $start = $e }
        elseif ($e.eventName -eq 'startup.stage.completed' -and $start) {
            $stages += [pscustomobject]@{
                stage = if ($idx -lt $names.Count) { $names[$idx] } else { "stage-$idx" }
                from  = [math]::Round($start.monotonicMs, 1)
                to    = [math]::Round($e.monotonicMs, 1)
                ms    = [math]::Round($e.monotonicMs - $start.monotonicMs, 1)
            }
            $idx++; $start = $null
        }
    }
    $total = ($evs | Where-Object eventName -eq 'startup.run.completed' | Select-Object -First 1).monotonicMs
}

# ── 输出 ────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '=== 分阶段耗时（DSH 自己的埋点）===' -ForegroundColor Green
if ($stages.Count) {
    foreach ($s in $stages) {
        $bar = if ($s.ms -gt 3000) { '  <<<< 大头' } else { '' }
        Write-Host ("  {0,-20} {1,9:N0} ms   (t+{2:N0} → t+{3:N0}){4}" -f $s.stage, $s.ms, $s.from, $s.to, $bar)
    }
    Write-Host ("  {0,-20} {1,9:N0} ms   <-- 总启动" -f 'TOTAL', $total) -ForegroundColor Yellow
} else {
    Write-Host '  （没读到本次启动的埋点。若 DSH 已启动过，请退出后重跑。）' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== 逐秒采样（只打印有活动的秒）===' -ForegroundColor Green
Write-Host '    t(s)  进程  CPU增量  读MB增量  读操作数  内存MB'
foreach ($s in $samples) {
    if ($s.cpuDelta -gt 0.05 -or $s.readMbD -gt 0.05 -or $s.readOpsD -gt 20 -or $s.t -lt 3) {
        Write-Host ("  {0,6:N1}  {1,4}  {2,8:N2}  {3,9:N2}  {4,8:N0}  {5,7:N0}" -f $s.t, $s.procs, $s.cpuDelta, $s.readMbD, $s.readOpsD, $s.wsMb)
    }
}

Write-Host ''
Write-Host '=== 网络连接采样（非本地）===' -ForegroundColor Green
if ($netSamples.Count) {
    foreach ($n in $netSamples) {
        Write-Host ("  t+{0,6:N1}s  总 {1,3}  已建立 {2,3}  握手中 {3,2}  远端: {4}" -f $n.t, $n.total, $n.estab, $n.syn, $(if ($n.remote) { $n.remote } else { '（无外部连接）' }))
    }
} else { Write-Host '  （无数据）' }

# ── 结论 ────────────────────────────────────────────────────────────────
$totalReadMb = [math]::Round((($samples | Measure-Object readMbD -Sum).Sum), 1)
$totalReadOps = ($samples | Measure-Object readOpsD -Sum).Sum
$busyCpu = ($samples | Measure-Object cpuDelta -Sum).Sum
Write-Host ''
Write-Host '=== 判读 ===' -ForegroundColor Cyan
Write-Host ("  启动期间累计读盘 {0} MB / {1:N0} 次读操作，累计 CPU {2:N1} 秒" -f $totalReadMb, $totalReadOps, $busyCpu)
$heavyStage = $stages | Sort-Object ms -Descending | Select-Object -First 1
if ($heavyStage) {
    Write-Host ("  最慢阶段：{0}（{1:N0} ms）" -f $heavyStage.stage, $heavyStage.ms)
    if ($heavyStage.stage -in @('renderer-startup', 'profile-composition', 'host-boot')) {
        if ($totalReadOps -gt 5000) {
            Write-Host '  => 读操作数很高：卡在“逐个读小文件”。最可能的原因是杀软实时扫描 App 目录（无 ASAR 后文件数上万）。' -ForegroundColor Yellow
            Write-Host '     建议：跑 .\加Defender排除项.ps1（需管理员），再重跑本脚本对比。' -ForegroundColor Yellow
        } elseif ($busyCpu -gt $heavyStage.ms / 1000 * 0.6) {
            Write-Host '  => 该阶段 CPU 占用高：卡在 JS 解析/编译或插件初始化（渲染进程要加载 65 个插件客户端脚本）。' -ForegroundColor Yellow
        } else {
            Write-Host '  => 该阶段既不怎么读盘也不怎么烧 CPU：很可能是空等（网络请求超时 / 进程间握手）。' -ForegroundColor Yellow
            Write-Host '     看上面的网络采样，是否有外部连接长时间挂在“握手中”。' -ForegroundColor Yellow
        }
    }
}
Write-Host ''
Write-Host '把这份输出发给我，我按数据给下一步。' -ForegroundColor DarkGray
Write-Host ''
