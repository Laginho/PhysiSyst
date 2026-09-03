$heartbeat = "C:\Users\bruno\Desktop\Pastinha\Programas\Projects\TraycerTest\.scratch\physics-sim-v2\HEARTBEAT.md"
$alertLog  = "C:\Users\bruno\Desktop\Pastinha\Programas\Projects\TraycerTest\.scratch\physics-sim-v2\ALERTS.log"
$thresholdMin = 30

if (-not (Test-Path -LiteralPath $heartbeat)) {
    $age = 9999
    $last = "never written"
} else {
    $item = Get-Item -LiteralPath $heartbeat
    $last = $item.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
    $age = ((Get-Date) - $item.LastWriteTime).TotalMinutes
}

if ($age -gt $thresholdMin) {
    $msg = "PhysicsSim v2 pipeline stalled: no heartbeat for {0:N0} min (last: {1}). Check the Traycer PLAN/MAKE/READ agents." -f $age, $last
    Add-Content -LiteralPath $alertLog -Value ("{0}: {1}" -f (Get-Date -Format s), $msg)
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.Popup($msg, 120, "PhysicsSimWatchdog", 48)
}
