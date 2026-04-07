$content = [System.IO.File]::ReadAllText("C:\AI-Agents\agent-os\app\page.js")

# Check 1 - agentRunning state exists
if ($content.Contains("agentRunning")) {
    Write-Host "agentRunning EXISTS" 
} else {
    Write-Host "agentRunning MISSING"
}

# Check 2 - setAgentRunning(true) is called
if ($content.Contains("setAgentRunning(true)")) {
    Write-Host "setAgentRunning(true) EXISTS"
} else {
    Write-Host "setAgentRunning(true) MISSING"
}

# Check 3 - stop button exists
if ($content.Contains("agentRunning && (")) {
    Write-Host "Stop button render EXISTS"
} else {
    Write-Host "Stop button render MISSING"
}

# Check 4 - show context around SEND button
$idx = $content.IndexOf("SEND")
Write-Host "---SEND button area---"
Write-Host $content.Substring([Math]::Max(0,$idx-50), 300)