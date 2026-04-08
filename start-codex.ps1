# start-codex.ps1
# Sync workspace repos before switching into Codex.

Set-Location 'C:\AI-Agents'
& 'C:\AI-Agents\update-handoff.ps1' -Target 'Codex'
& 'C:\AI-Agents\git-handoff.ps1' -Mode switch-codex

Write-Host ''
Write-Host 'Ready to switch to Codex.' -ForegroundColor Green
Write-Host 'Both the root workspace repo and deer-flow were checked for commit/push sync.' -ForegroundColor Gray
Write-Host ''
