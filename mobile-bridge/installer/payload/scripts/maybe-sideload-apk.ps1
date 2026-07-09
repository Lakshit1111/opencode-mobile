param(
  [Parameter(Mandatory=$true)]
  [string]$ApkPath
)

$adb = $null
$adbCmd = Get-Command adb -ErrorAction SilentlyContinue
if ($adbCmd) {
  $adb = $adbCmd.Source
} else {
  $candidates = @(
    "$env:LOCALAPPDATA\Android\sdk\platform-tools\adb.exe",
    "$env:USERPROFILE\AppData\Local\Android\sdk\platform-tools\adb.exe",
    "C:\Android\sdk\platform-tools\adb.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { $adb = $c; break }
  }
}

if (-not $adb) {
  Write-Host "ADB_NOT_FOUND"
  exit 0
}

Write-Host "Found adb: $adb"
$devicesOutput = & $adb devices
$lines = $devicesOutput | Select-Object -Skip 1
$readyDevice = $false
foreach ($line in $lines) {
  if ($line -match "^\S+\s+device\s*$") { $readyDevice = $true; break }
  if ($line -match "^\S+\s+unauthorized") {
    Write-Host "ADB_UNAUTHORIZED"
    exit 0
  }
}

if (-not $readyDevice) {
  Write-Host "ADB_NO_DEVICE"
  exit 0
}

Write-Host "Installing APK to device..."
$result = & $adb install -r $ApkPath 2>&1
Write-Host ($result -join "`n")
if ($LASTEXITCODE -eq 0) {
  Write-Host "ADB_INSTALL_OK"
} else {
  Write-Host "ADB_INSTALL_FAILED"
}