# steam-rice

Steam made to look like a tiling-WM Linux rice: a theme for [Millennium](https://steambrew.app). The sibling of [discord-rice](https://github.com/Plyxen/discord-rice), with the same wallpaper, font and greys.

![steam-rice: the library on a misty wallpaper, Iosevka, one thin top bar, window dots](assets/library.png)

## What it does

- **Tiled, no boxes.** One misty wallpaper behind the library, with the game list, the page and the bars split by 1px lines. No gradients or shadows.
- **Greyscale.** Steam's blue-grey is gone everywhere: library, settings, menus, downloads, friends. Game art keeps its colour. Only things that mean something (playing, online, danger) keep a colour, muted.
- **One thin top bar.** Menus, tabs and window buttons share a single row: `Steam View Friends Games Help | store library community you`. The tabs are small and lowercase.
- **Window dots.** Three small dots instead of `- [] x`. They light up under the mouse.
- **Iosevka everywhere,** small corners, thin scrollbars.
- **Less clutter.** The announcements megaphone, the Big Picture button and the "Add shelf" row are hidden. Each can be switched back on.
- **Store and community pages** are web pages with their own styles, so they only get the font, a neutral background and their colour turned down to sit next to the grey client.

## Install

You need [Millennium](https://steambrew.app).

Windows, in PowerShell:

```powershell
irm https://raw.githubusercontent.com/Plyxen/steam-rice/main/install.ps1 | iex
```

Or download the repo and run `install.ps1` from its folder. Either way it only copies the theme into `Steam\millennium\themes\steam-rice`. Run it again to update.

By hand, on any system: put this folder into Millennium's themes folder as `steam-rice`.

Then in Steam: **Steam menu → Millennium → Themes → steam-rice**.

## Options

In Millennium, open the theme's settings (the cog next to it).

| Option | Choices | |
| --- | --- | --- |
| Font | Iosevka, Steam | |
| Corners | Sharp, Small, Round | |
| Wallpaper dim | Light, Medium, Heavy | Go heavier if text is hard to read. |
| Film grain | on, off | |
| Black-and-white game art | Off, On, Hover | Hover shows a picture in colour under the mouse. |
| Store and community pages | Muted, Greyscale, Steam | |
| One-row top bar | on, off | Off gives Steam's two rows back. |
| Small lowercase tabs | on, off | |
| Window buttons as dots | on, off | |
| Hide announcements button | on, off | |
| Hide Big Picture button | on, off | |
| Hide What's New | off, on | |
| Hide Add shelf | on, off | |
| Hide Add a Game | off, on | |

For your own wallpaper, set `--wallpaper` at the top of `rice.css` to `url("...")`. The other values there are the same options, for editing without Millennium's window.

## How the greyscale works

Steam has almost no colour variables. Its look is thousands of literal colours in two large style sheets, so a theme can't recolour it by setting a few names, and hand-written themes always leave blue corners somewhere.

`build.mjs` reads those two sheets from your Steam folder, takes every rule that paints something, turns the colours grey and writes the rules out again in the same order as `mono.css`. Blue becomes plain grey at the same lightness; other hues stay but muted. `rice.css` is the small hand-written part on top: wallpaper, layout, lines, font, options.

## After a Steam update

Valve renames Steam's style classes now and then. Nothing breaks when that happens: the rules for old names just stop matching, so those parts go back to Steam's colours until `mono.css` is rebuilt.

To rebuild it from your own Steam (needs [Node.js](https://nodejs.org), no packages):

```powershell
.\install.ps1 -Build
```

`mono.css` in this repo was built from the Steam client of the date in its first lines.

## Not done yet

- Big Picture mode and the in-game overlay are left as Steam draws them, apart from the grey.
- The friends list and chat are grey and in Iosevka, but have no wallpaper yet.
- No installer for Linux or macOS. Copy the folder by hand there.

## Licence

GPL-3.0-or-later, see `LICENSE`. `mono.css` is generated from Valve's style sheets and carries their rule names; it is here so the theme works without a build step. Iosevka by Belleve Invis (SIL Open Font License 1.1) is loaded from jsDelivr, not included.
