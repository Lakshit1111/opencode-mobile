$svc = Get-Service -Name "OpenCodeBridge" -ErrorAction SilentlyContinue
if ($svc) {
  $details = @"
OpenCodeBridge Service Status
===============================
Status: $($svc.Status)
StartType: $($svc.StartType)
Name: $($svc.Name)
DisplayName: $($svc.DisplayName)
"@
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($details, "OpenCodeBridge Service")
} else {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("OpenCodeBridge service is not installed.", "Service Status")
}