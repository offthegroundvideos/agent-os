$content = [System.IO.File]::ReadAllText("C:\AI-Agents\agent-os\app\page.js")
if ($content.Contains("agentPollRef.current = setInterval")) {
    Write-Host "Poll EXISTS"
    $idx = $content.IndexOf("agentPollRef.current = setInterval")
    Write-Host $content.Substring([Math]::Max(0,$idx-200), 150)
} else {
    Write-Host "Poll MISSING"
}
if ($content.Contains("currentProcessId")) {
    Write-Host "currentProcessId EXISTS"
} else {
    Write-Host "currentProcessId MISSING"
}