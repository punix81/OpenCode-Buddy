$ErrorActionPreference = 'Stop'
$bridge = Join-Path $PSScriptRoot '../../bridge'
$out = Join-Path $bridge 'dist/ipc'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework C# compiler is required on the build machine.' }
New-Item -ItemType Directory -Path $out -Force | Out-Null
& $compiler /nologo /target:exe /optimize+ "/out:$out/pipe-host.exe" (Join-Path $PSScriptRoot 'pipe-host.cs')
if ($LASTEXITCODE -ne 0) { throw 'Windows pipe host compilation failed.' }
