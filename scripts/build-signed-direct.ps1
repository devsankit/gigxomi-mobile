param(
  [Parameter(Mandatory = $true)][string]$SigningBackupZip,
  [ValidateSet('DIRECT', 'PLAY_READER')][string]$DistributionChannel = 'DIRECT'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$mobileRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$signingDir = Join-Path ([IO.Path]::GetTempPath()) ('gigxomi-signing-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $signingDir | Out-Null
$keystorePath = Join-Path $signingDir 'upload.jks'
$variables = @('GIGXOMI_UPLOAD_STORE_FILE', 'GIGXOMI_UPLOAD_STORE_PASSWORD', 'GIGXOMI_UPLOAD_KEY_ALIAS', 'GIGXOMI_UPLOAD_KEY_PASSWORD', 'EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_DISTRIBUTION_CHANNEL', 'EXPO_PUBLIC_QA_MODE', 'EXPO_NO_DOTENV', 'NODE_ENV', 'JAVA_HOME', 'ANDROID_HOME')
$previous = @{}
foreach ($name in $variables) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  $archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $SigningBackupZip).Path)
  try {
    $keyEntry = @($archive.Entries | Where-Object FullName -like '*.jks')
    $credentialEntry = @($archive.Entries | Where-Object FullName -like '*credentials.md')
    if ($keyEntry.Count -ne 1 -or $credentialEntry.Count -ne 1) { throw 'Expected exactly one upload keystore and credential record.' }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($keyEntry[0], $keystorePath)
    $reader = [IO.StreamReader]::new($credentialEntry[0].Open())
    try { $credentialText = $reader.ReadToEnd() } finally { $reader.Dispose() }
    function Read-SigningValue([string]$label) {
      $match = [regex]::Match($credentialText, '(?im)^- ' + [regex]::Escape($label) + ':\s*([^\r\n]+)')
      if (!$match.Success) { throw ('Missing signing field: ' + $label) }
      return $match.Groups[1].Value.Trim().Trim([char]96)
    }
    $env:GIGXOMI_UPLOAD_STORE_FILE = $keystorePath
    $env:GIGXOMI_UPLOAD_STORE_PASSWORD = Read-SigningValue 'Android upload keystore password'
    $env:GIGXOMI_UPLOAD_KEY_ALIAS = Read-SigningValue 'Android key alias'
    $env:GIGXOMI_UPLOAD_KEY_PASSWORD = Read-SigningValue 'Android key password'
  } finally { $archive.Dispose() }
  $credentialText = $null
  $env:JAVA_HOME = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot'
  $env:ANDROID_HOME = 'C:/Users/hello/AppData/Local/Android/Sdk'
  $env:EXPO_PUBLIC_API_URL = 'https://www.gigxomi.com/api'
  $env:EXPO_PUBLIC_DISTRIBUTION_CHANNEL = $DistributionChannel
  $env:EXPO_PUBLIC_QA_MODE = '0'
  $env:EXPO_NO_DOTENV = '1'
  $env:NODE_ENV = 'production'
  Push-Location (Join-Path $mobileRoot 'android')
  try {
    $releaseTask = if ($DistributionChannel -eq 'PLAY_READER') { ':app:bundleRelease' } else { ':app:assembleRelease' }
    & .\gradlew.bat $releaseTask --console=plain --max-workers=2
    if ($LASTEXITCODE -ne 0) { throw 'Signed release build failed.' }
  } finally { Pop-Location }
} finally {
  foreach ($name in $variables) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
  if (Test-Path -LiteralPath $keystorePath) { Remove-Item -LiteralPath $keystorePath }
}
