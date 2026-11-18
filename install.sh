#!/usr/bin/env bash
# steam-rice installer for Linux and macOS.
# Copies the theme into Millennium's themes folder. Run it again to update.
#
#   ./install.sh                   install from this folder
#   ./install.sh --steam <folder>  when Steam is somewhere else (the folder that holds "millennium")
#
# One-liner without cloning:
#   curl -fsSL https://raw.githubusercontent.com/Plyxen/steam-rice/main/install.sh | bash

set -euo pipefail

repo="Plyxen/steam-rice"
steam=""

while [ $# -gt 0 ]; do
    case "$1" in
        --steam)
            steam="${2:-}"
            shift 2
            ;;
        -h | --help)
            sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Millennium keeps its themes inside the Steam folder, in millennium/themes. These are the places Steam
# lives: the usual Linux one, the Flatpak, and the app bundle on macOS
if [ -z "$steam" ]; then
    for guess in \
        "$HOME/.steam/steam" \
        "$HOME/.local/share/Steam" \
        "$HOME/.var/app/com.valvesoftware.Steam/.steam/steam" \
        "$HOME/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS"; do
        if [ -d "$guess/millennium" ]; then
            steam="$guess"
            break
        fi
    done
fi

if [ -z "$steam" ] || [ ! -d "$steam/millennium" ]; then
    echo "Could not find a Steam folder with Millennium in it." >&2
    echo "Install Millennium from https://steambrew.app first, or pass the folder: ./install.sh --steam <folder>" >&2
    exit 1
fi

# where the theme files come from: this folder when run from a clone, otherwise a download of the repo
source_dir=""
temp=""
self="${BASH_SOURCE[0]:-}"
if [ -n "$self" ] && [ -f "$(dirname "$self")/skin.json" ]; then
    source_dir="$(cd "$(dirname "$self")" && pwd)"
else
    temp="$(mktemp -d)"
    trap 'rm -rf "$temp"' EXIT
    echo "Downloading $repo..."
    curl -fsSL "https://github.com/$repo/archive/refs/heads/main.tar.gz" | tar -xz -C "$temp"
    source_dir="$temp/steam-rice-main"
fi

target="$steam/millennium/themes/steam-rice"
mkdir -p "$target"

# only the files Steam loads
for file in skin.json rice.css mono.js webkit.css wallpaper.jpg LICENSE; do
    cp "$source_dir/$file" "$target/$file"
done
# the options folder is replaced whole, so options that were renamed or dropped don't pile up
rm -rf "$target/options"
cp -R "$source_dir/options" "$target/options"
# files that versions before 1.1 put here
rm -f "$target/mono.css" "$target/build.mjs"

echo "Installed to $target"
echo "In Steam: Steam menu > Millennium > Themes, pick steam-rice. Its options are under the cog next to it."
echo "The grey comes from a small script (mono.js), so leave JavaScript allowed for themes in Millennium."
