# save-work.ps1
# Save current work across the workspace repos with an optional commit message.

Set-Location 'C:\AI-Agents'
& 'C:\AI-Agents\update-handoff.ps1' -Target 'Checkpoint'
& 'C:\AI-Agents\git-handoff.ps1' -Mode save -PromptForMessage
