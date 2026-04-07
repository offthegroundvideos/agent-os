$content = [System.IO.File]::ReadAllText("C:\AI-Agents\agent-os\app\page.js")
$idx = $content.IndexOf("setTypingAgent(agentId)")
Write-Host $content.Substring([Math]::Max(0,$idx-20), 400)