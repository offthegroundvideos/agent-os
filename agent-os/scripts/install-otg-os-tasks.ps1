#Requires -RunAsAdministrator
param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$Uninstall
)

$taskNames = @('OTG-OS Worker', 'OTG-OS Web')

if ($Uninstall) {
  foreach ($name in $taskNames) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  }
  Write-Host 'Removed OTG-OS startup tasks.'
  return
}

$node = (Get-Command node).Source
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries
$trigger = New-ScheduledTaskTrigger -AtStartup

$workerAction = New-ScheduledTaskAction -Execute $node -Argument 'scripts\otg-os-worker.mjs' -WorkingDirectory $ProjectDir
Register-ScheduledTask -TaskName 'OTG-OS Worker' -Action $workerAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

$webAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -File scripts\start-agent-os.ps1 -SkipBuild' `
  -WorkingDirectory $ProjectDir
Register-ScheduledTask -TaskName 'OTG-OS Web' -Action $webAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

Write-Host "Registered 'OTG-OS Worker' and 'OTG-OS Web' to start at boot from $ProjectDir."
Write-Host "Start them now with: Start-ScheduledTask -TaskName 'OTG-OS Worker'; Start-ScheduledTask -TaskName 'OTG-OS Web'"
