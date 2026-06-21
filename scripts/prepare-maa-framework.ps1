param(
  [string]$Version = $env:MAA_FRAMEWORK_VERSION,
  [string]$Repository = $env:MAA_FRAMEWORK_REPOSITORY,
  [string]$AssetName = $env:MAA_FRAMEWORK_ASSET_NAME,
  [string]$ArchivePath = $env:MAA_FRAMEWORK_ARCHIVE_PATH,
  [string]$DownloadUrl = $env:MAA_FRAMEWORK_DOWNLOAD_URL,
  [string]$GithubToken = $env:MAA_FRAMEWORK_TOKEN,
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Repository)) {
  $Repository = "Tortes/MaaFramework"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  if ($Repository -eq "MaaXYZ/MaaFramework") {
    $Version = "v5.10.0"
  }
  else {
    $Version = "release"
  }
}

if ([string]::IsNullOrWhiteSpace($AssetName)) {
  if ($Repository -eq "MaaXYZ/MaaFramework") {
    $AssetName = "MAA-win-x86_64-$Version.zip"
  }
  else {
    $AssetName = "MAA-win-x86_64.zip"
  }
}

if ($Repository -eq "MaaXYZ/MaaFramework" -and -not $Version.StartsWith("v")) {
  $Version = "v$Version"
}

$sdkDir = Join-Path $ProjectRoot "src-tauri\maa-framework"
$placeholderPath = Join-Path $sdkDir ".gitkeep"
$versionFile = Join-Path $sdkDir ".version"
$dllPath = Join-Path $sdkDir "bin\MaaFramework.dll"

$resolvedArchivePath = $null
if (-not [string]::IsNullOrWhiteSpace($ArchivePath)) {
  $resolvedArchivePath = (Resolve-Path -LiteralPath $ArchivePath).Path
  $archiveItem = Get-Item -LiteralPath $resolvedArchivePath
  $desiredMarker = "archive|$resolvedArchivePath|$($archiveItem.Length)|$($archiveItem.LastWriteTimeUtc.Ticks)"
}
elseif (-not [string]::IsNullOrWhiteSpace($DownloadUrl)) {
  $desiredMarker = "url|$DownloadUrl|$AssetName"
}
else {
  $desiredMarker = "$Repository|$Version|$AssetName"
}

$currentVersion = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { "" }

if (-not $Force -and $currentVersion -eq $desiredMarker -and (Test-Path $dllPath)) {
  Write-Host "MaaFramework $Repository $Version already prepared at $sdkDir"
  exit 0
}

$zipPath = $resolvedArchivePath
$tempDir = $null

if ([string]::IsNullOrWhiteSpace($zipPath)) {
  $zipName = $AssetName
  $url = if (-not [string]::IsNullOrWhiteSpace($DownloadUrl)) {
    $DownloadUrl
  }
  else {
    "https://github.com/$Repository/releases/download/$Version/$zipName"
  }
  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "maainspector-maa-$([System.Guid]::NewGuid().ToString('N'))"
  $zipPath = Join-Path $tempDir $zipName
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

try {
  if ($resolvedArchivePath) {
    Write-Host "Using local MaaFramework archive: $resolvedArchivePath"
  }
  else {
    Write-Host "Downloading MaaFramework $Version from $Repository ($url)"
    if ([string]::IsNullOrWhiteSpace($GithubToken)) {
      Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    }
    else {
      $headers = @{
        Authorization = "Bearer $GithubToken"
      }
      if ($url -like "https://api.github.com/*") {
        $headers["X-GitHub-Api-Version"] = "2022-11-28"
      }
      Invoke-WebRequest -Uri $url -OutFile $zipPath -Headers $headers -UseBasicParsing
    }
  }

  if (Test-Path $sdkDir) {
    Remove-Item -LiteralPath $sdkDir -Recurse -Force
  }

  New-Item -ItemType Directory -Path $sdkDir -Force | Out-Null
  New-Item -ItemType File -Path $placeholderPath -Force | Out-Null
  Expand-Archive -Path $zipPath -DestinationPath $sdkDir -Force

  if (-not (Test-Path $dllPath)) {
    $nestedDll = Get-ChildItem -Path $sdkDir -Filter "MaaFramework.dll" -Recurse -File | Select-Object -First 1
    if ($nestedDll) {
      $nestedRoot = Split-Path -Parent (Split-Path -Parent $nestedDll.FullName)
      $stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) "maainspector-maa-staging-$([System.Guid]::NewGuid().ToString('N'))"
      New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
      Copy-Item -LiteralPath (Join-Path $nestedRoot '*') -Destination $stagingDir -Recurse -Force
      Remove-Item -LiteralPath $sdkDir -Recurse -Force
      Move-Item -LiteralPath $stagingDir -Destination $sdkDir
    }
  }

  if (-not (Test-Path $dllPath)) {
    throw "MaaFramework.dll was not found at $dllPath after extraction."
  }

  $desiredMarker | Set-Content -Path $versionFile -Encoding UTF8
  Write-Host "Prepared MaaFramework $Version at $sdkDir"
} finally {
  if ($tempDir -and (Test-Path $tempDir)) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}
