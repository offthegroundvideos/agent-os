$content = [System.IO.File]::ReadAllText("C:\AI-Agents\agent-os\app\page.js")
$idx = $content.IndexOf("SEND")
Write-Host $content.Substring([Math]::Max(0,$idx-200), 400)