param(
  [string]$Version = $env:MAA_FRAMEWORK_VERSION,
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = "v5.10.0"
}

if (-not $Version.StartsWith("v")) {
  $Version = "v$Version"
}

$sdkDir = Join-Path $ProjectRoot "src-tauri\maa-framework"
$placeholderPath = Join-Path $sdkDir ".gitkeep"
$versionFile = Join-Path $sdkDir ".version"
$dllPath = Join-Path $sdkDir "bin\MaaFramework.dll"
$currentVersion = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { "" }

if (-not $Force -and $currentVersion -eq $Version -and (Test-Path $dllPath)) {
  Write-Host "MaaFramework $Version already prepared at $sdkDir"
  exit 0
}

$zipName = "MAA-win-x86_64-$Version.zip"
$url = "https://github.com/MaaXYZ/MaaFramework/releases/download/$Version/$zipName"
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "maainspector-maa-$([System.Guid]::NewGuid().ToString('N'))"
$zipPath = Join-Path $tempDir $zipName

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
  Write-Host "Downloading MaaFramework $Version from $url"
  Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

  if (Test-Path $sdkDir) {
    Remove-Item -LiteralPath $sdkDir -Recurse -Force
  }

  New-Item -ItemType Directory -Path $sdkDir -Force | Out-Null
  New-Item -ItemType File -Path $placeholderPath -Force | Out-Null
  Expand-Archive -Path $zipPath -DestinationPath $sdkDir -Force

  if (-not (Test-Path $dllPath)) {
    throw "MaaFramework.dll was not found at $dllPath after extraction."
  }

  $Version | Set-Content -Path $versionFile -Encoding UTF8
  Write-Host "Prepared MaaFramework $Version at $sdkDir"
} finally {
  if (Test-Path $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}
