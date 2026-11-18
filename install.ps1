# steam-rice installer for Windows.
# Copies the theme into Millennium's themes folder. Run it again to update.
#
#   .\install.ps1                 install from this folder
#   .\install.ps1 -Build          also rebuild mono.css from your own Steam files first (needs Node.js)
#   .\install.ps1 -Steam D:\Steam  when Steam is not where the registry says
#
# One-liner without cloning:
#   irm https://raw.githubusercontent.com/Plyxen/steam-rice/main/install.ps1 | iex

param(
    [string]$Steam,
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$repo = 'Plyxen/steam-rice'

if (-not $Steam) {
    $Steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
}
if (-not $Steam -or -not (Test-Path (Join-Path $Steam 'steam.exe'))) {
    Write-Host 'Steam not found. Pass its folder: .\install.ps1 -Steam "D:\Steam"' -ForegroundColor Red
    exit 1
}
$Steam = (Resolve-Path $Steam).Path

$themes = Join-Path $Steam 'millennium\themes'
if (-not (Test-Path (Join-Path $Steam 'millennium'))) {
    Write-Host 'Millennium is not installed in this Steam. Get it from https://steambrew.app first, then run this again.' -ForegroundColor Red
    exit 1
}

# where the theme files come from: this folder when run from a clone, otherwise a download of the repo
$source = $PSScriptRoot
$temp = $null
if (-not $source -or -not (Test-Path (Join-Path $source 'skin.json'))) {
    $temp = Join-Path ([IO.Path]::GetTempPath()) ("steam-rice-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temp | Out-Null
    $zip = Join-Path $temp 'steam-rice.zip'
    Write-Host "Downloading $repo..."
    Invoke-WebRequest "https://github.com/$repo/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $temp
    $source = Join-Path $temp 'steam-rice-main'
}

if ($Build) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host 'Node.js is needed for -Build and was not found. Installing the mono.css that came with the theme instead.' -ForegroundColor Yellow
    } else {
        & node (Join-Path $source 'build.mjs') $Steam
        if ($LASTEXITCODE -ne 0) { Write-Host 'build.mjs failed, keeping the mono.css that came with the theme.' -ForegroundColor Yellow }
    }
}

$target = Join-Path $themes 'steam-rice'
New-Item -ItemType Directory -Force -Path $target | Out-Null
# only the files Steam loads. The options folder is replaced whole so renamed options don't pile up
foreach ($file in 'skin.json', 'mono.css', 'rice.css', 'webkit.css', 'build.mjs', 'LICENSE') {
    $from = Join-Path $source $file
    if (Test-Path $from) { Copy-Item $from (Join-Path $target $file) -Force }
}
$options = Join-Path $target 'options'
if (Test-Path $options) { Remove-Item $options -Recurse -Force }
Copy-Item (Join-Path $source 'options') $options -Recurse

if ($temp) { Remove-Item $temp -Recurse -Force }

Write-Host "Installed to $target" -ForegroundColor Green
Write-Host 'In Steam: Steam menu > Millennium > Themes, pick steam-rice. Its options are under the cog next to it.'
