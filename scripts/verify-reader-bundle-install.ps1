param(
  [Parameter(Mandatory = $true)][string]$AabPath,
  [Parameter(Mandatory = $true)][string]$SigningBackupZip,
  [Parameter(Mandatory = $true)][string]$BundletoolPath,
  [string]$AdbPath = 'C:/Users/hello/AppData/Local/Android/Sdk/platform-tools/adb.exe',
  [string]$DeviceId = 'emulator-5554'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$temporaryRoot = [IO.Path]::GetTempPath()
$workingDirectory = Join-Path $temporaryRoot ('gigxomi-reader-verify-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $workingDirectory | Out-Null
$keystorePath = Join-Path $workingDirectory 'upload.jks'
$storePasswordPath = Join-Path $workingDirectory 'store-password.txt'
$keyPasswordPath = Join-Path $workingDirectory 'key-password.txt'
$apkSetPath = Join-Path $workingDirectory 'reader.apks'

try {
  $archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $SigningBackupZip).Path)
  try {
    $keyEntry = @($archive.Entries | Where-Object FullName -like '*.jks')
    $credentialEntry = @($archive.Entries | Where-Object FullName -like '*credentials.md')
    if ($keyEntry.Count -ne 1 -or $credentialEntry.Count -ne 1) {
      throw 'Expected exactly one upload keystore and credential record.'
    }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($keyEntry[0], $keystorePath)
    $reader = [IO.StreamReader]::new($credentialEntry[0].Open())
    try { $credentialText = $reader.ReadToEnd() } finally { $reader.Dispose() }
  } finally {
    $archive.Dispose()
  }

  function Read-SigningValue([string]$label) {
    $match = [regex]::Match($credentialText, '(?im)^- ' + [regex]::Escape($label) + ':\s*([^\r\n]+)')
    if (!$match.Success) { throw ('Missing signing field: ' + $label) }
    return $match.Groups[1].Value.Trim().Trim([char]96)
  }

  $storePassword = Read-SigningValue 'Android upload keystore password'
  $keyAlias = Read-SigningValue 'Android key alias'
  $keyPassword = Read-SigningValue 'Android key password'
  [IO.File]::WriteAllText($storePasswordPath, $storePassword)
  [IO.File]::WriteAllText($keyPasswordPath, $keyPassword)
  $credentialText = $null
  $storePassword = $null
  $keyPassword = $null

  $resolvedBundletoolPath = (Resolve-Path -LiteralPath $BundletoolPath).Path
  $resolvedAabPath = (Resolve-Path -LiteralPath $AabPath).Path
  $resolvedAdbPath = (Resolve-Path -LiteralPath $AdbPath).Path
  & java.exe -jar $resolvedBundletoolPath build-apks `
    "--bundle=$resolvedAabPath" `
    "--output=$apkSetPath" `
    '--mode=universal' `
    '--overwrite' `
    "--ks=$keystorePath" `
    ('--ks-pass=file:' + $storePasswordPath) `
    "--ks-key-alias=$keyAlias" `
    ('--key-pass=file:' + $keyPasswordPath)
  if ($LASTEXITCODE -ne 0) { throw 'bundletool build-apks failed.' }

  & java.exe -jar $resolvedBundletoolPath install-apks `
    "--apks=$apkSetPath" `
    "--adb=$resolvedAdbPath" `
    "--device-id=$DeviceId"
  if ($LASTEXITCODE -ne 0) { throw 'bundletool install-apks failed.' }

  [pscustomobject]@{
    ok = $true
    device = $DeviceId
    aab = $resolvedAabPath
  } | Format-List
} finally {
  $resolvedWorkingDirectory = [IO.Path]::GetFullPath($workingDirectory)
  $resolvedTemporaryRoot = [IO.Path]::GetFullPath($temporaryRoot)
  if ($resolvedWorkingDirectory.StartsWith($resolvedTemporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolvedWorkingDirectory)) {
    Remove-Item -LiteralPath $resolvedWorkingDirectory -Recurse -Force
  }
}
