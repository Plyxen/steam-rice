# steam-rice installer for Windows.
# Copies the theme into Millennium's themes folder. Run it again to update.
#
#   .\install.ps1                   install from this folder
#   .\install.ps1 -Steam D:\Steam   when Steam is not where the registry says
#
# One-liner without cloning:
#   irm https://raw.githubusercontent.com/Plyxen/steam-rice/main/install.ps1 | iex

param(
    [string]$Steam
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

$target = Join-Path $Steam 'millennium\themes\steam-rice'
New-Item -ItemType Directory -Force -Path $target | Out-Null

# only the files Steam loads
foreach ($file in 'skin.json', 'rice.css', 'mono.js', 'webkit.css', 'wallpaper.jpg', 'LICENSE') {
    Copy-Item (Join-Path $source $file) (Join-Path $target $file) -Force
}
# the options folder is replaced whole, so options that were renamed or dropped don't pile up
$options = Join-Path $target 'options'
if (Test-Path $options) { Remove-Item $options -Recurse -Force }
Copy-Item (Join-Path $source 'options') $options -Recurse
# files that versions before 1.1 put here
foreach ($old in 'mono.css', 'build.mjs') {
    $path = Join-Path $target $old
    if (Test-Path $path) { Remove-Item $path -Force }
}

if ($temp) { Remove-Item $temp -Recurse -Force }

Write-Host "Installed to $target" -ForegroundColor Green
Write-Host 'In Steam: Steam menu > Millennium > Themes, pick steam-rice. Its options are under the cog next to it.'
Write-Host 'The grey comes from a small script (mono.js), so leave "JavaScript" allowed for themes in Millennium.'
