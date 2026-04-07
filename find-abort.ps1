$content = [System.IO.File]::ReadAllText("C:\AI-Agents\agent-os\app\page.js")
$idx = $content.IndexOf("AbortController")
Write-Host $content.Substring([Math]::Max(0,$idx-50), 200)