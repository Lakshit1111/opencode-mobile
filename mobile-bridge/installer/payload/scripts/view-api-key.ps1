$configPath = Join-Path $PSScriptRoot "..\bridge\config.json"
if (Test-Path $configPath) {
  $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
  $key = if ($cfg.apiKey) { $cfg.apiKey } else { "(not set)" }
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("API Key: $key", "OpenCode Bridge API Key")
} else {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Config file not found at $configPath. The service may not have started yet.", "View API Key")
}