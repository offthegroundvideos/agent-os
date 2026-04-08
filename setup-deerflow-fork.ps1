param(
    [string]$ForkUrl = '',
    [string]$RemoteName = 'fork'
)

$ErrorActionPreference = 'Stop'

$RepoPath = 'C:\AI-Agents\deer-flow'

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

function Test-RemoteExists($Path, $Name) {
    $remotes = git -C $Path remote
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    return @($remotes) -contains $Name
}

function Get-RemoteUrl($Path, $Name) {
    if (-not (Test-RemoteExists $Path $Name)) {
        return ''
    }

    $remoteLines = git -C $Path remote -v
    if ($LASTEXITCODE -ne 0) {
        return ''
    }

    foreach ($line in @($remoteLines)) {
        if ($line -match "^$([regex]::Escape($Name))\s+(\S+)\s+\(fetch\)$") {
            return $Matches[1].Trim()
        }
    }

    return ''
}

if (-not (Test-GitRepo $RepoPath)) {
    throw "deer-flow repo not found at $RepoPath"
}

if ([string]::IsNullOrWhiteSpace($ForkUrl)) {
    $ForkUrl = Read-Host 'Enter the DeerFlow fork URL (example: git@github.com:offthegroundvideos/deer-flow.git)'
}

if ([string]::IsNullOrWhiteSpace($ForkUrl)) {
    throw 'A fork URL is required.'
}

Write-Section 'Configure DeerFlow fork remote' 'Yellow'

if (Test-RemoteExists $RepoPath $RemoteName) {
    $currentUrl = Get-RemoteUrl $RepoPath $RemoteName
    Write-Host "Updating $RemoteName remote from $currentUrl to $ForkUrl" -ForegroundColor Yellow
    git -C $RepoPath remote set-url $RemoteName $ForkUrl
} else {
    Write-Host "Adding $RemoteName remote: $ForkUrl" -ForegroundColor Yellow
    git -C $RepoPath remote add $RemoteName $ForkUrl
}

if ($LASTEXITCODE -ne 0) {
    throw 'Failed to configure the DeerFlow fork remote.'
}

git -C $RepoPath config --local ai.pushRemote $RemoteName
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to save the preferred DeerFlow push remote.'
}

Write-Host ''
Write-Host 'Configured remotes:' -ForegroundColor Green
git -C $RepoPath remote -v

Write-Host ''
Write-Host "deer-flow will now push through '$RemoteName' during handoffs." -ForegroundColor Green
Write-Host 'Upstream pulls and rebases will continue to use the current branch upstream.' -ForegroundColor Green
