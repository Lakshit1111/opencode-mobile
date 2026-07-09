; OpenCode Mobile Bridge - Windows Installer
; Installs the bridge as a Windows Service (via NSSM) and optionally
; sideloads the Android APK via adb.

#define MyAppName "OpenCode Bridge"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "OpenCode"
#define MyAppExeName "node.exe"
#define MyAppURL "https://github.com/Lakshit1111/opencode-mobile"

[Setup]
AppId={{B8E4F1A2-3D5C-4E6F-9A8B-1C2D3E4F5A6B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={pf}\OpenCode Bridge
DefaultGroupName=OpenCode Bridge
DisableProgramGroupPage=yes
LicenseFile=LICENSE.txt
OutputDir=Output
OutputBaseFilename=opencode-bridge-setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
UninstallDisplayIcon={app}\node\node.exe
UninstallDisplayName=OpenCode Bridge {#MyAppVersion}
ShowLanguageDialog=no
LanguageDetectionMethod=none
CloseApplications=no
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Types]
Name: "full"; Description: "Full installation (Bridge service + Android APK)"
Name: "bridgeonly"; Description: "Bridge service only (no APK)"
Name: "custom"; Description: "Custom installation"; Flags: iscustom

[Components]
Name: "bridge"; Description: "OpenCode Bridge service"; Types: full bridgeonly; Flags: fixed
Name: "apk"; Description: "Android APK (OpenCode Mobile)"; Types: full

[Dirs]
Name: "{app}\logs"; Flags: uninsneveruninstall
Name: "{app}\bridge"; Flags: uninsneveruninstall

[Files]
; Bridge runtime (Node.js portable)
Source: "payload\node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion; Components: bridge
; NSSM service manager
Source: "payload\nssm.exe"; DestDir: "{app}"; Flags: ignoreversion; Components: bridge
; Bridge application files
Source: "payload\bridge\index.js"; DestDir: "{app}\bridge"; Flags: ignoreversion; Components: bridge
Source: "payload\bridge\package.json"; DestDir: "{app}\bridge"; Flags: ignoreversion; Components: bridge
Source: "payload\bridge\public\index.html"; DestDir: "{app}\bridge\public"; Flags: ignoreversion; Components: bridge
Source: "payload\bridge\node_modules\*"; DestDir: "{app}\bridge\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: bridge
; Service install / uninstall scripts
Source: "payload\scripts\install-service.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion; Components: bridge
Source: "payload\scripts\uninstall-service.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion; Components: bridge
Source: "payload\scripts\maybe-sideload-apk.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion; Components: bridge
Source: "payload\scripts\show-service-status.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion; Components: bridge
Source: "payload\scripts\view-api-key.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion; Components: bridge
; Android APK
Source: "payload\apk\opencode-mobile.apk"; DestDir: "{app}\apk"; Flags: ignoreversion; Components: apk

[Run]
; Register + start the Windows Service
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\scripts\install-service.ps1"" ""{app}"""; StatusMsg: "Registering OpenCodeBridge service..."; Flags: runhidden waituntilterminated; Components: bridge

; Optionally sideload APK via adb
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\scripts\maybe-sideload-apk.ps1"" ""{app}\apk\opencode-mobile.apk"""; StatusMsg: "Checking for connected Android device..."; Flags: runhidden waituntilterminated; Components: apk

[Icons]
Name: "{group}\OpenCode Bridge Control Panel"; Filename: "http://localhost:3456"; Comment: "Open the bridge control panel in your browser"; IconFilename: "{app}\node\node.exe"
Name: "{group}\Service Status"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\scripts\show-service-status.ps1"""; Comment: "Check the service status"; IconFilename: "{app}\nssm.exe"
Name: "{group}\View API Key"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\scripts\view-api-key.ps1"""; Comment: "Display the bridge API key"; IconFilename: "{app}\node\node.exe"
Name: "{group}\Open Bridge Folder"; Filename: "explorer.exe"; Parameters: "{app}"; Comment: "Open the installation folder"; IconFilename: "{app}\nssm.exe"
Name: "{group}\Install OpenCode Mobile (APK)"; Filename: "explorer.exe"; Parameters: """{app}\apk\opencode-mobile.apk"""; Comment: "Open the APK file for manual transfer"; IconFilename: "{app}\node\node.exe"; Components: apk
Name: "{commondesktop}\OpenCode Bridge Control Panel"; Filename: "http://localhost:3456"; Comment: "Open the bridge control panel in your browser"; IconFilename: "{app}\node\node.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut to the control panel"; GroupDescription: "Additional shortcuts:"

[UninstallRun]
; Stop and remove the Windows Service
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\scripts\uninstall-service.ps1"""; StatusMsg: "Removing OpenCodeBridge service..."; Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\bridge\config.json"
Type: dirifempty; Name: "{app}\logs"
Type: dirifempty; Name: "{app}\bridge"
Type: dirifempty; Name: "{app}"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;