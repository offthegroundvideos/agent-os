$content = [System.IO.File]::ReadAllText("C:\AI-Agents\agent-os\app\page.js")
if ($content.Contains("AbortController()")) {
    Write-Host "AbortController EXISTS" 
} else { 
    Write-Host "MISSING" 
}
if ($content.Contains("setAgentRunning(true)")) {
    Write-Host "setAgentRunning(true) EXISTS"
} else {
    Write-Host "setAgentRunning MISSING"
}