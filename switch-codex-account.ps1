# switch-codex-account.ps1
# Use this before moving from one Codex account/session to another Codex account/session.

Set-Location 'C:\AI-Agents'
& 'C:\AI-Agents\update-handoff.ps1' -Target 'New Codex account'
& 'C:\AI-Agents\git-handoff.ps1' -Mode switch-codex

Write-Host ''
Write-Host 'Ready to switch Codex accounts.' -ForegroundColor Green
Write-Host 'Open the new Codex account after this completes, then read AI-HANDOFF.md first.' -ForegroundColor Gray
Write-Host ''
