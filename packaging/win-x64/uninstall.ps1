# UI Review bridge remover for Windows x64.
#
# Removes the Native Messaging host registration, the launcher and the installed executable.
# Persisted review sessions under %APPDATA%\ui-review\sessions are kept.
$ErrorActionPreference = "Stop"

$registryKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.dabik.ui_review_bridge"
$installDir = Join-Path $env:APPDATA "ui-review\bridge"
$removed = $false

if (Test-Path $registryKey) {
    Remove-Item -Path $registryKey -Recurse -Force
    Write-Host "Removed registry key: $registryKey"
    $removed = $true
}

if (Test-Path $installDir) {
    Remove-Item -Path $installDir -Recurse -Force
    Write-Host "Removed bridge:       $installDir"
    $removed = $true
}

if (-not $removed) {
    Write-Host "Nothing to remove."
} else {
    Write-Host "Review sessions were kept under $env:APPDATA\ui-review\sessions."
    Write-Host "Reload the UI Review extension so the side panel sees the bridge as absent."
}
