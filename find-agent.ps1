$content = [System.IO.File]::ReadAllText("C:\AI-Agents\agent-os\app\page.js")
$idx = $content.IndexOf("api/agent")
Write-Host $content.Substring([Math]::Max(0,$idx-100), 300)