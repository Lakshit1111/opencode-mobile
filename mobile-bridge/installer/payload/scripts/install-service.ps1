param(
  [Parameter(Mandatory=$true)]
  [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$service = Get-Service -Name "OpenCodeBridge" -ErrorAction SilentlyContinue
if ($service) {
  Write-Host "OpenCodeBridge service already exists. Stopping and removing old instance..."
  Stop-Service -Name "OpenCodeBridge" -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  & "$InstallDir\nssm.exe" remove OpenCodeBridge confirm
}

$nodeExe = Join-Path $InstallDir "node\node.exe"
$script  = Join-Path $InstallDir "bridge\index.js"
$logDir  = Join-Path $InstallDir "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

Write-Host "Registering OpenCodeBridge service..."
& "$InstallDir\nssm.exe" install OpenCodeBridge "$nodeExe"
& "$InstallDir\nssm.exe" set OpenCodeBridge AppDirectory "$InstallDir\bridge"
& "$InstallDir\nssm.exe" set OpenCodeBridge AppStdout "$logDir\bridge.log"
& "$InstallDir\nssm.exe" set OpenCodeBridge AppStderr "$logDir\bridge.err.log"
& "$InstallDir\nssm.exe" set OpenCodeBridge AppRotateFiles 1
& "$InstallDir\nssm.exe" set OpenCodeBridge AppRotateBytes 10485760
& "$InstallDir\nssm.exe" set OpenCodeBridge Start SERVICE_AUTO_START
& "$InstallDir\nssm.exe" set OpenCodeBridge AppExit Default Restart
& "$InstallDir\nssm.exe" set OpenCodeBridge AppRestartDelay 5000
& "$InstallDir\nssm.exe" set OpenCodeBridge Description "Mobile bridge proxy for OpenCode AI agent - auth, network exposure, SSE relay."

# NSSM's `set AppParameters` strips embedded quotes, which breaks paths
# containing spaces (e.g. C:\Program Files\...). Write the quoted value
# directly to the registry so Node receives the script path as one argv token.
$regKey = "HKLM:\SYSTEM\CurrentControlSet\Services\OpenCodeBridge\Parameters"
$quoted = '"' + $script + '"'
Set-ItemProperty -Path $regKey -Name "AppParameters" -Value $quoted -Type ExpandString
Write-Host "Stored AppParameters: $quoted"

Write-Host "Starting OpenCodeBridge service..."
Start-Service -Name "OpenCodeBridge"
Start-Sleep -Seconds 3
$svc = Get-Service -Name "OpenCodeBridge"
Write-Host "Service status: $($svc.Status)"
if ($svc.Status -ne "Running") {
  Write-Host "WARNING: Service is not running. Check $logDir\bridge.err.log for details."
}