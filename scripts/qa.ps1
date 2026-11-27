param([switch]$Coverage)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bridge = Join-Path $root 'bridge'
$plugin = Join-Path $root 'plugin/opencode-buddy'
$eslint = Join-Path $bridge 'node_modules/eslint/bin/eslint.js'

function Invoke-Check([string]$Name, [scriptblock]$Command) {
  Write-Host "== $Name"
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit $LASTEXITCODE)" }
  Write-Host "== ${Name}: PASS"
}

Push-Location $bridge
try {
  Invoke-Check 'Windows pipe host build' { & (Join-Path $root 'installer/windows/build-pipe-host.ps1') }
  Invoke-Check 'TypeScript typecheck' { npm.cmd run typecheck }
  Invoke-Check 'bridge ESLint' { npm.cmd run lint }
  Push-Location $plugin
  try {
    Invoke-Check 'plugin ESLint' { node $eslint --config eslint.config.mjs . }
  } finally { Pop-Location }
  Invoke-Check 'script syntax' {
    foreach ($file in Get-ChildItem $PSScriptRoot -Filter '*.mjs' -File -Recurse) {
      node --check $file.FullName
      if ($LASTEXITCODE -ne 0) { throw "syntax check failed for $($file.Name)" }
    }
  }
  if ($Coverage) {
    Invoke-Check 'bridge tests and coverage' {
      node --import tsx --test --experimental-test-coverage 'test/*.test.ts'
    }
  } else {
    Invoke-Check 'bridge tests' { npm.cmd test }
  }
  Invoke-Check 'plugin tests' { npm.cmd run test:plugin }
  Invoke-Check 'installation script tests' { npm.cmd run test:scripts }
  Invoke-Check 'protocol vectors' { npm.cmd run validate:protocol }
  Invoke-Check 'TypeScript build' { npm.cmd run build }
  Invoke-Check 'config examples' {
    node --input-type=module -e "import {loadConfig} from './dist/config.js'; for (const path of process.argv.slice(1)) loadConfig(path)" config.example.json ../config.example.json
  }
} finally { Pop-Location }

Write-Host 'Windows bridge/package QA PASS. The C++ host and visual preview gates remain in scripts/qa.sh.'
