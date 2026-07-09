$ErrorActionPreference = "Continue"
$service = Get-Service -Name "OpenCodeBridge" -ErrorAction SilentlyContinue
if ($service) {
  Write-Host "Stopping OpenCodeBridge service..."
  Stop-Service -Name "OpenCodeBridge" -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  $installDir = Split-Path -Parent $PSScriptRoot
  & "$installDir\nssm.exe" remove OpenCodeBridge confirm
  Write-Host "OpenCodeBridge service removed."
} else {
  Write-Host "OpenCodeBridge service not found. Nothing to remove."
}