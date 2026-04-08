param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('save', 'switch-codex', 'switch-claude')]
    [string]$Mode,

    [string]$CommitMessage = '',

    [switch]$PromptForMessage,

    [switch]$LaunchClaude
)

$ErrorActionPreference = 'Stop'

$WorkspaceRoot = 'C:\AI-Agents'
$ClaudeLaunchCommand = 'claude --model qwen3-coder-64k'
$Timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm'

$RepoConfigs = @(
    @{ Name = 'workspace'; Path = 'C:\AI-Agents' },
    @{ Name = 'deer-flow'; Path = 'C:\AI-Agents\deer-flow' }
)

function Write-Section($text, $color = 'Cyan') {
    Write-Host ''
    Write-Host "=== $text ===" -ForegroundColor $color
}

function Test-GitRepo($Path) {
    try {
        $inside = git -C $Path rev-parse --is-inside-work-tree 2>$null
        return ($LASTEXITCODE -eq 0 -and $inside.Trim() -eq 'true')
    } catch {
        return $false
    }
}

function Get-RepoStatus($Path) {
    $output = git -C $Path status --porcelain
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to read git status for $Path"
    }
    return @($output)
}

function Get-CurrentBranch($Path) {
    $branch = git -C $Path branch --show-current
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to detect current branch for $Path"
    }
    return $branch.Trim()
}

function Has-Upstream($Path) {
    $branch = Get-CurrentBranch $Path
    $upstream = git -C $Path for-each-ref --format='%(upstream:short)' "refs/heads/$branch"
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    return -not [string]::IsNullOrWhiteSpace(($upstream -join '').Trim())
}

function Get-RemoteUrl($Path, $RemoteName = 'origin') {
    if (-not (Test-RemoteExists $Path $RemoteName)) {
        return ''
    }

    $remoteLines = git -C $Path remote -v
    if ($LASTEXITCODE -ne 0) {
        return ''
    }

    foreach ($line in @($remoteLines)) {
        if ($line -match "^$([regex]::Escape($RemoteName))\s+(\S+)\s+\(fetch\)$") {
            return $Matches[1].Trim()
        }
    }

    return ''
}

function Test-RemoteExists($Path, $RemoteName) {
    $remotes = git -C $Path remote
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    return @($remotes) -contains $RemoteName
}

function Get-ConfiguredPushRemote($Path) {
    $remote = git -C $Path config --local --get ai.pushRemote 2>$null
    if ($LASTEXITCODE -ne 0) {
        return ''
    }
    return ($remote -join '').Trim()
}

function Test-UpstreamRepoUrl($Url) {
    return $Url -match 'bytedance[/:]deer-flow(\.git)?$'
}

function Get-PushRemote($RepoName, $RepoPath) {
    $configuredRemote = Get-ConfiguredPushRemote $RepoPath
    if (-not [string]::IsNullOrWhiteSpace($configuredRemote) -and (Test-RemoteExists $RepoPath $configuredRemote)) {
        return $configuredRemote
    }

    if ($RepoName -eq 'deer-flow' -and (Test-RemoteExists $RepoPath 'fork')) {
        return 'fork'
    }

    return 'origin'
}

function Get-AheadBehind($Path) {
    if (-not (Has-Upstream $Path)) {
        return @{ Ahead = 0; Behind = 0; HasUpstream = $false }
    }

    $counts = git -C $Path rev-list --left-right --count "HEAD...@{u}"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to compare local and upstream history for $Path"
    }

    $parts = ($counts -join ' ').Trim() -split '\s+'
    $behind = [int]$parts[0]
    $ahead = [int]$parts[1]

    return @{ Ahead = $ahead; Behind = $behind; HasUpstream = $true }
}

function Resolve-CommitMessage($RepoName) {
    if (-not [string]::IsNullOrWhiteSpace($CommitMessage)) {
        return $CommitMessage
    }

    if ($PromptForMessage) {
        $message = Read-Host "Commit message for $RepoName (press Enter for auto-message)"
        if (-not [string]::IsNullOrWhiteSpace($message)) {
            return $message.Trim()
        }
    }

    switch ($Mode) {
        'switch-codex' { return "handoff: switch to Codex - $Timestamp" }
        'switch-claude' { return "handoff: switch to Claude - $Timestamp" }
        default { return "checkpoint: save work - $Timestamp" }
    }
}

function Sync-Repo($Repo) {
    $repoName = $Repo.Name
    $repoPath = $Repo.Path

    if (-not (Test-GitRepo $repoPath)) {
        Write-Host "Skipping $repoName ($repoPath) - not a git repo." -ForegroundColor DarkYellow
        return
    }

    $branch = Get-CurrentBranch $repoPath
    Write-Section "$repoName [$branch]" 'Yellow'

    $status = Get-RepoStatus $repoPath
    if ($status.Count -gt 0) {
        Write-Host 'Changes detected:' -ForegroundColor Yellow
        $status | ForEach-Object { Write-Host "  $_" }

        $message = Resolve-CommitMessage $repoName
        git -C $repoPath add -A
        if ($LASTEXITCODE -ne 0) {
            throw "git add failed for $repoName"
        }

        git -C $repoPath commit -m $message
        if ($LASTEXITCODE -ne 0) {
            throw "git commit failed for $repoName"
        }

        Write-Host "Committed $repoName with message: $message" -ForegroundColor Green
    } else {
        Write-Host 'Working tree is clean.' -ForegroundColor Green
    }

    git -C $repoPath fetch --all --prune
    if ($LASTEXITCODE -ne 0) {
        throw "git fetch failed for $repoName"
    }

    $pushRemote = Get-PushRemote $repoName $repoPath
    $pushRemoteUrl = Get-RemoteUrl $repoPath $pushRemote
    $pushEnabled = $true
    if ($repoName -eq 'deer-flow' -and (Test-UpstreamRepoUrl $pushRemoteUrl)) {
        $pushEnabled = $false
        Write-Host 'deer-flow is still configured to push upstream. Pull is allowed, but push is skipped until you set a safe fork remote.' -ForegroundColor DarkYellow
    } elseif ($repoName -eq 'deer-flow' -and [string]::IsNullOrWhiteSpace($pushRemoteUrl)) {
        $pushEnabled = $false
        Write-Host 'deer-flow has no safe push remote configured yet. Run .\setup-deerflow-fork.ps1 once to enable push.' -ForegroundColor DarkYellow
    }

    $syncState = Get-AheadBehind $repoPath
    if (-not $syncState.HasUpstream) {
        Write-Host 'No upstream configured. Skipping pull/push.' -ForegroundColor DarkYellow
        return
    }

    $skipUpstreamRebase = $false
    if ($repoName -eq 'deer-flow' -and $pushRemote -ne 'origin' -and $syncState.Ahead -gt 0 -and $syncState.Behind -gt 0) {
        $skipUpstreamRebase = $true
        Write-Host 'deer-flow has local custom commits and upstream has moved. Skipping automatic upstream rebase during handoff and keeping your local branch intact.' -ForegroundColor DarkYellow
    }

    if ($syncState.Behind -gt 0) {
        if ($skipUpstreamRebase) {
            Write-Host 'Upstream sync is deferred for this repo. Use a separate maintenance pass when you want to merge/rebase DeerFlow upstream changes intentionally.' -ForegroundColor DarkYellow
        } else {
            Write-Host "Branch is behind upstream by $($syncState.Behind) commit(s). Rebasing..." -ForegroundColor Yellow
            git -C $repoPath pull --rebase
            if ($LASTEXITCODE -ne 0) {
                throw "git pull --rebase failed for $repoName. Resolve conflicts manually before switching tools."
            }
        }
    }

    $postPullState = Get-AheadBehind $repoPath
    if ($postPullState.Ahead -gt 0 -and -not $pushEnabled) {
        Write-Host 'Local commits exist, but push is intentionally skipped for this repo.' -ForegroundColor DarkYellow
        return
    }

    if ($postPullState.Ahead -gt 0) {
        Write-Host "Pushing $($postPullState.Ahead) commit(s) from $repoName via $pushRemote..." -ForegroundColor Yellow
        if ($pushRemote -eq 'origin') {
            git -C $repoPath push
        } else {
            git -C $repoPath push $pushRemote "HEAD:$branch"
        }
        if ($LASTEXITCODE -ne 0) {
            throw "git push failed for $repoName"
        }
        Write-Host 'Push complete.' -ForegroundColor Green
    } else {
        Write-Host 'Already in sync with upstream.' -ForegroundColor Green
    }
}

Set-Location $WorkspaceRoot

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  AI Tool Handoff Sync' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

foreach ($repo in $RepoConfigs) {
    Sync-Repo $repo
}

Write-Host ''
Write-Host 'Workspace sync complete.' -ForegroundColor Green

if ($LaunchClaude) {
    Write-Host ''
    Write-Host "Launching Claude with: $ClaudeLaunchCommand" -ForegroundColor Cyan
    Write-Host ''
    Invoke-Expression $ClaudeLaunchCommand
}
