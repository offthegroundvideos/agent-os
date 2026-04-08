param(
    [string]$Target = 'Checkpoint',
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'

$WorkspaceRoot = 'C:\AI-Agents'
$HandoffFile = Join-Path $WorkspaceRoot 'AI-HANDOFF.md'
$WorkingMemoryFile = Join-Path $WorkspaceRoot 'agent-os\WORKING-MEMORY.md'
$NowIso = (Get-Date).ToString('s')

function Get-SectionText {
    param(
        [string]$Content,
        [string]$Header
    )

    if ([string]::IsNullOrWhiteSpace($Content)) { return '' }
    $escaped = [regex]::Escape($Header)
    $pattern = "(?ms)^## $escaped\s*\r?\n(.*?)(?=^## |\z)"
    $match = [regex]::Match($Content, $pattern)
    if (-not $match.Success) { return '' }
    return $match.Groups[1].Value.Trim()
}

function Convert-SectionToPromptValue {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) { return '' }

    $lines = $Value -split "\r?\n" | ForEach-Object {
        $_.Trim() -replace '^[-*]\s*', ''
    } | Where-Object { $_ }

    return ($lines -join '; ')
}

function Prompt-OrKeep {
    param(
        [string]$Label,
        [string]$CurrentValue
    )

    if ($NonInteractive) { return $CurrentValue }
    if ([string]::IsNullOrWhiteSpace($CurrentValue)) {
        $inputValue = Read-Host "$Label"
    } else {
        $inputValue = Read-Host "$Label [$CurrentValue]"
    }
    if ([string]::IsNullOrWhiteSpace($inputValue)) {
        return $CurrentValue
    }
    return $inputValue.Trim()
}

function To-Bullets {
    param([string]$Value)

    $items = @()
    if (-not [string]::IsNullOrWhiteSpace($Value)) {
        $items = $Value -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    }

    if ($items.Count -eq 0) {
        return @('- None')
    }

    return $items | ForEach-Object { "- $_" }
}

function Get-RepoSnapshotLine {
    param(
        [string]$Name,
        [string]$Path
    )

    $inside = git -C $Path rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -ne 0 -or ($inside -join '').Trim() -ne 'true') {
        return "- ${Name}: not a git repo"
    }

    $branch = (git -C $Path branch --show-current) -join ''
    $status = @(git -C $Path status --short)
    $remote = (git -C $Path remote get-url origin 2>$null) -join ''

    $state = if ($status.Count -gt 0) { "dirty ($($status.Count) change(s))" } else { 'clean' }
    $remoteLabel = if ([string]::IsNullOrWhiteSpace($remote)) { 'no origin' } else { $remote }

    return "- ${Name}: branch $($branch.Trim()), $state, origin $remoteLabel"
}

function Get-WorkingMemorySnapshot {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return @('- No Agent OS working memory snapshot found.')
    }

    $content = Get-Content $Path
    $trimmed = $content | Select-Object -First 18
    if (-not $trimmed) {
        return @('- Agent OS working memory file is empty.')
    }
    return $trimmed
}

$existingContent = if (Test-Path $HandoffFile) { Get-Content $HandoffFile -Raw } else { '' }

$currentTarget = Convert-SectionToPromptValue (Get-SectionText -Content $existingContent -Header 'Switch Target')
$currentObjective = Convert-SectionToPromptValue (Get-SectionText -Content $existingContent -Header 'Primary Objective')
$currentChanged = Convert-SectionToPromptValue (Get-SectionText -Content $existingContent -Header 'What Changed')
$currentNext = Convert-SectionToPromptValue (Get-SectionText -Content $existingContent -Header 'Next Steps')
$currentBlockers = Convert-SectionToPromptValue (Get-SectionText -Content $existingContent -Header 'Open Blockers')

if ([string]::IsNullOrWhiteSpace($currentTarget)) {
    $currentTarget = $Target
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Update AI Handoff Note' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Use semicolons for multiple items. Press Enter to keep the current value.' -ForegroundColor DarkGray

$nextTarget = Prompt-OrKeep -Label 'Switch target' -CurrentValue $currentTarget
$objective = Prompt-OrKeep -Label 'Primary objective' -CurrentValue $currentObjective
$changed = Prompt-OrKeep -Label 'What changed' -CurrentValue $currentChanged
$nextSteps = Prompt-OrKeep -Label 'Next steps' -CurrentValue $currentNext
$blockers = Prompt-OrKeep -Label 'Open blockers' -CurrentValue $currentBlockers

$repoSnapshot = @(
    Get-RepoSnapshotLine -Name 'workspace' -Path 'C:\AI-Agents'
    Get-RepoSnapshotLine -Name 'deer-flow' -Path 'C:\AI-Agents\deer-flow'
)

$workingMemorySnapshot = Get-WorkingMemorySnapshot -Path $WorkingMemoryFile

$content = @(
    '# AI Handoff'
    ''
    "Last updated: $NowIso"
    ''
    '## Switch Target'
    $nextTarget
    ''
    '## Primary Objective'
    $objective
    ''
    '## What Changed'
    (To-Bullets -Value $changed)
    ''
    '## Next Steps'
    (To-Bullets -Value $nextSteps)
    ''
    '## Open Blockers'
    (To-Bullets -Value $blockers)
    ''
    '## Repo Snapshot'
    $repoSnapshot
    ''
    '## Agent OS Snapshot'
    '```md'
    $workingMemorySnapshot
    '```'
    ''
    '## Quick Start'
    '- Read this file first.'
    '- Open `agent-os/WORKING-MEMORY.md` for the latest system snapshot.'
    '- Run `.\start-codex.ps1` before switching to a different Codex account.'
    '- Run `.\start-claude.ps1` before switching to Claude.'
    '- Run `.\save-work.ps1` for a manual checkpoint without switching tools.'
) -join "`r`n"

Set-Content -Path $HandoffFile -Value $content -Encoding UTF8

Write-Host ''
Write-Host "Updated $HandoffFile" -ForegroundColor Green
