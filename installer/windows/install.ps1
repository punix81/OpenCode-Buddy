param(
  [string]$Prefix = "$env:LOCALAPPDATA\opencode-buddy",
  [string]$PluginProject = "",
  [switch]$PluginGlobal,
  [switch]$AutoStart,
  [switch]$Uninstall,
  [switch]$Apply
)

# User-scoped wrapper around the portable installer. No elevation, no firmware
# flash, no service registration. This script is prepared for a native Windows
# host; it has NOT been executed or validated in the Ubuntu VM.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$installer = Join-Path $here "install.mjs"
if (-not (Test-Path $installer)) { $installer = Join-Path $here "..\install.mjs" }
if (-not (Test-Path $installer)) { throw "install.mjs not found (expected next to this script or one level up)" }

$arguments = @("--prefix", $Prefix, "--platform", "win32")
if ($PluginProject -ne "") { $arguments += @("--plugin-project", $PluginProject) }
if ($PluginGlobal) { $arguments += "--plugin-global" }
if ($Uninstall) { $arguments += "--uninstall" }
if ($AutoStart) {
  $startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\opencode-buddy.vbs"
  $arguments += @("--autostart-output", $startup)
}
if ($Apply) { $arguments += "--apply" }

Write-Host "OpenCode Buddy Windows installer (user scope)"
Write-Host "prefix: $Prefix"
Write-Host "Dry-run unless -Apply is given; no administrator rights; no firmware flash."
& node $installer @arguments
exit $LASTEXITCODE
