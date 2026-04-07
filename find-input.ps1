$content = [System.IO.File]::ReadAllText("C:\AI-Agents\agent-os\app\page.js")
$idx = $content.IndexOf("14px 20px", $content.IndexOf("borderTop"))
Write-Host $content.Substring([Math]::Max(0,$idx-100), 200)