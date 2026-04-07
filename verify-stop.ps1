$content = [System.IO.File]::ReadAllText("C:\AI-Agents\agent-os\app\page.js")
if ($content.Contains("setAgentRunning(true)")) {
    Write-Host "FIXED - setAgentRunning(true) EXISTS"
} else {
    Write-Host "STILL MISSING"
}