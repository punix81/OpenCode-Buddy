param(
  [string]$Out = "$PSScriptRoot\..\..\release"
)

# Builds the Windows portable app tree from a native Windows checkout. Requires
# Node.js 22+ and npm on the build host.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Push-Location $root
try {
  & (Join-Path $PSScriptRoot 'build-pipe-host.ps1')
  & node scripts/package-portable.mjs --out $Out --platform win32 --no-archive
  if ($LASTEXITCODE -ne 0) { throw "portable package build failed" }
  $version = (Get-Content -Raw bridge/package.json | ConvertFrom-Json).version
  $arch = & node -p 'process.arch'
  if ($LASTEXITCODE -ne 0) { throw "could not determine the Node architecture" }
  $name = "opencode-buddy-$version-win32-$arch"
  $stage = Join-Path $Out $name
  if (-not (Test-Path -LiteralPath (Join-Path $stage 'install.mjs'))) { throw "staged Windows app tree not found" }
  $archive = Join-Path $Out "$name.zip"
  Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $archive -Force
  $hash = Get-FileHash $archive -Algorithm SHA256
  "$($hash.Hash.ToLower())  $([IO.Path]::GetFileName($archive))" | Set-Content "$archive.sha256"
  Write-Host "archive: $archive"
  Write-Host "sha256: $($hash.Hash.ToLower())"
} finally {
  Pop-Location
}
