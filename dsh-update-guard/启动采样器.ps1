# 启动采样器.ps1 — 每 0.5s 记录 DSH 进程数与主窗口出现时刻，写 CSV
$out = 'dsh-update-guard\launch-timeline.csv'
"idle,t=0,procs=0,window=no" | Out-File $out -Encoding utf8
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$firstProcAt = $null
$windowAt = $null
$prevRead = 0; $prevOps = 0
while ($sw.Elapsed.TotalSeconds -lt 480) {
    $procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'DSH*' }
    $n = ($procs | Measure-Object).Count
    if ($n -gt 0 -and -not $firstProcAt) { $firstProcAt = $sw.Elapsed.TotalSeconds }
    $hasWin = $false
    if ($n -gt 0) {
        $hasWin = ($procs | Where-Object { $_.MainWindowHandle -ne 0 }).Count -gt 0
        if ($hasWin -and -not $windowAt) { $windowAt = $sw.Elapsed.TotalSeconds }
    }
    $line = "t={0,6:N1},procs={1},window={2}" -f $sw.Elapsed.TotalSeconds, $n, $(if ($hasWin) { 'YES' } else { 'no' })
    $line | Out-File $out -Append -Encoding utf8
    if ($windowAt) {
        "done firstProc={0:N1}s window={1:N1}s" -f $firstProcAt, $windowAt | Out-File $out -Append -Encoding utf8
        break
    }
    Start-Sleep -Milliseconds 500
}
