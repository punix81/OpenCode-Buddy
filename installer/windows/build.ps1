param(
  [string]$Out = "$PSScriptRoot\..\..\release"
)

# Builds the Windows portable app tree from a native Windows checkout. Requires
# Node.js 22+ and npm on the build host. This has NOT been executed in the Ubuntu
# VM; Windows installer validation belongs to Checkpoint B.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Push-Location $root
try {
  & node scripts/package-portable.mjs --out $Out --platform win32 --no-archive
  if ($LASTEXITCODE -ne 0) { throw "portable package build failed" }
  $stage = Get-ChildItem $Out -Directory | Where-Object { $_.Name -like "opencode-buddy-*-win32-*" } | Select-Object -First 1
  if ($null -eq $stage) { throw "staged Windows app tree not found" }
  $archive = Join-Path $Out "$($stage.Name).zip"
  Compress-Archive -Path (Join-Path $stage.FullName "*") -DestinationPath $archive -Force
  $hash = Get-FileHash $archive -Algorithm SHA256
  "$($hash.Hash.ToLower())  $([IO.Path]::GetFileName($archive))" | Set-Content "$archive.sha256"
  Write-Host "archive: $archive"
  Write-Host "sha256: $($hash.Hash.ToLower())"
} finally {
  Pop-Location
}
