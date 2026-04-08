# start-claude.ps1
# Sync workspace repos, then launch Claude Code.

Set-Location 'C:\AI-Agents'
& 'C:\AI-Agents\update-handoff.ps1' -Target 'Claude'
& 'C:\AI-Agents\git-handoff.ps1' -Mode switch-claude -LaunchClaude
