// Builds mono.css: Steam's own colour rules, redone in greyscale.
//
// Steam has almost no colour variables. Its blue-grey look is thousands of literal colours spread over
// sp.css and library.css, so a theme can't recolour it by setting a handful of names. This script reads
// those two files from your Steam folder, takes every rule that paints something (text, backgrounds,
// borders, shadows, icons), turns the colours grey and writes the rules back out in the same order.
// Loaded after Steam's sheets, mono.css then wins rule for rule, and nothing else about a rule changes.
//
// Blue, Steam's tint and accent, becomes plain grey. Every other hue (the green of "playing", red for
// danger, yellow for warnings) stays, but muted. Pictures are not touched.
//
// Steam's class names change when Valve updates the client. Rules for names that no longer exist just
// stop matching, so an old mono.css fades back to stock colours instead of breaking anything.
// Run this again after a Steam update:   node build.mjs  [path to Steam]
//
// Needs Node 18 or newer. No packages.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const steam = process.argv[2] || findSteam();
const cssDir = path.join(steam, 'steamui', 'css');
// in the order Steam's main window loads them
const sources = ['library.css', 'sp.css'];
const steamOrigin = 'https://steamloopback.host/';

function findSteam() {
    const guesses = [
        process.env.STEAM_DIR,
        'C:/Program Files (x86)/Steam',
        'C:/Program Files/Steam',
        path.join(process.env.HOME || '', '.steam/steam'),
        path.join(process.env.HOME || '', '.local/share/Steam'),
        path.join(process.env.HOME || '', 'Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS'),
    ].filter(Boolean);
    const hit = guesses.find(g => fs.existsSync(path.join(g, 'steamui', 'css', 'sp.css')));
    if (!hit) {
        console.error('Steam folder not found. Pass it: node build.mjs "D:/Steam"');
        process.exit(1);
    }
    return hit;
}

/* ---------------------------------------------------------------- colour maths (OKLCH) */

const toLinear = v => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = v => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));

function rgbToLch([r, g, b]) {
    r = toLinear(r); g = toLinear(g); b = toLinear(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

function lchToRgb([L, C, h]) {
    const A = C * Math.cos((h * Math.PI) / 180), B = C * Math.sin((h * Math.PI) / 180);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return [
        fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ];
}

function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}

// role: 'bg' = something painted behind text, 'fg' = text, icons and lines, 'var' = a named colour (use unknown)
function remap(rgb, role) {
    const [L, C, h] = rgbToLch(rgb);
    if (C < 0.003) return null; // already grey
    const grey = l => lchToRgb([Math.min(1, Math.max(0, l)), 0, 0]);
    const blue = h >= 195 && h <= 292;
    if (blue) {
        if (C <= 0.06 || role === 'var') return grey(L); // Steam's blue-greys: same lightness, no tint
        // the accent blue. Behind text it goes mid grey so white labels still read. As text or a line it goes light
        return role === 'bg' ? grey(Math.min(L * 0.8, 0.56)) : grey(L + (1 - L) * 0.5);
    }
    if (C <= 0.03) return grey(L); // a faint warm or green cast is still just grey
    return lchToRgb([role === 'bg' ? Math.min(L, 0.62) : L, Math.min(C, 0.1), h]); // real colours stay, muted
}

const colourRe = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[^()]*\)/g;

function recolour(value, role) {
    let changed = false;
    const out = value.replace(colourRe, tok => {
        let rgb, alpha = '';
        if (tok[0] === '#') {
            let hex = tok.slice(1);
            if (hex.length === 3 || hex.length === 4) hex = [...hex].map(c => c + c).join('');
            if (hex.length !== 6 && hex.length !== 8) return tok;
            rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
            if (hex.length === 8) alpha = hex.slice(6);
            const to = remap(rgb, role);
            if (!to) return tok;
            changed = true;
            return '#' + to.map(v => v.toString(16).padStart(2, '0')).join('') + alpha;
        }
        if (/var\(|calc\(|from /.test(tok)) return tok;
        const nums = tok.slice(tok.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean);
        if (nums.length < 3) return tok;
        if (tok.startsWith('hsl')) rgb = hslToRgb(parseFloat(nums[0]), parseFloat(nums[1]), parseFloat(nums[2]));
        else rgb = nums.slice(0, 3).map(n => (n.endsWith('%') ? parseFloat(n) * 2.55 : parseFloat(n)));
        if (rgb.some(Number.isNaN)) return tok;
        const to = remap(rgb, role);
        if (!to) return tok;
        changed = true;
        return nums[3] !== undefined ? `rgba(${to.join(',')},${nums[3]})` : `rgb(${to.join(',')})`;
    });
    return [out, changed];
}

/* ---------------------------------------------------------------- a small CSS reader */

// Returns a tree: a block is { head, items }, an item is a declaration string or another block.
function read(css) {
    let i = 0;
    const n = css.length;
    function chunk() {
        // read up to the next { ; or } that is not inside a string, brackets or a comment
        let out = '', depth = 0;
        while (i < n) {
            const c = css[i];
            if (c === '/' && css[i + 1] === '*') {
                const end = css.indexOf('*/', i + 2);
                i = end < 0 ? n : end + 2;
                continue;
            }
            if (c === '"' || c === "'") {
                let j = i + 1;
                while (j < n && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
                out += css.slice(i, j + 1);
                i = j + 1;
                continue;
            }
            if (c === '(' || c === '[') depth++;
            else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
            else if (depth === 0 && (c === '{' || c === ';' || c === '}')) return [out.trim(), c];
            out += c;
            i++;
        }
        return [out.trim(), ''];
    }
    function block() {
        const items = [];
        while (i < n) {
            const [text, end] = chunk();
            i++;
            if (end === '{') items.push({ head: text, items: block() });
            else if (text) items.push(text);
            if (end === '}' || end === '') break;
        }
        return items;
    }
    return block();
}

/* ---------------------------------------------------------------- which declarations get carried over */

// Every property that can hold a colour, plus the ones its shorthand resets. All of them are carried over,
// changed or not: mono.css loads after Steam's sheet, so a recoloured ".a { background }" would otherwise
// beat an unchanged ".b { background }" that Steam wrote further down and meant to win.
function carries(prop) {
    if (prop.startsWith('--')) return false; // named colours are handled apart
    if (/radius|collapse|spacing/.test(prop)) return false;
    return /^(color|fill|stroke|caret-color|accent-color|scrollbar-color|stop-color|flood-color|lighting-color|(-webkit-)?box-shadow|text-shadow|-webkit-text-fill-color|-webkit-tap-highlight-color)$/.test(prop)
        || /^(-webkit-)?(background|border|outline|column-rule|text-decoration|text-emphasis|-webkit-text-stroke)(-|$)/.test(prop);
}

const roleOf = prop => (/background|shadow/.test(prop) ? 'bg' : prop.startsWith('--') ? 'var' : 'fg');

// url(images/x.png) in Steam's sheet is relative to that sheet. Here it has to be spelled out in full
const absoluteUrls = (value, base) =>
    value.replace(/url\(\s*(['"]?)(?!data:|https?:|blob:|#)([^'")]+)\1\s*\)/g, (_, q, u) => `url(${q}${new URL(u, base).href}${q})`);

function splitDecl(d) {
    const at = d.indexOf(':');
    return at < 0 ? null : [d.slice(0, at).trim().toLowerCase(), d.slice(at + 1).trim()];
}

let kept = 0, recoloured = 0;

function convert(items, base) {
    const out = [];
    for (const it of items) {
        if (typeof it === 'string') continue; // loose declarations and @import lines at this level: nothing to do
        const head = it.head;
        if (/^@(-webkit-)?keyframes/.test(head)) {
            // an animation is replaced as a whole or not at all
            let any = false;
            const frames = it.items.filter(f => typeof f !== 'string').map(f => {
                const decls = f.items.filter(d => typeof d === 'string').map(d => {
                    const kv = splitDecl(d);
                    if (!kv) return d;
                    const [v, ch] = recolour(kv[1], roleOf(kv[0]));
                    any ||= ch;
                    return `${kv[0]}:${absoluteUrls(v, base)}`;
                });
                return `${f.head}{${decls.join(';')}}`;
            });
            if (any) out.push(`${head}{${frames.join('')}}`);
            continue;
        }
        if (/^@(media|supports|container|layer|document)/.test(head)) {
            const inner = convert(it.items, base);
            if (inner.length) out.push(`${head}{${inner.join('')}}`);
            continue;
        }
        if (head.startsWith('@')) continue; // @font-face, @property and the like
        const decls = [];
        for (const d of it.items) {
            if (typeof d !== 'string') continue;
            const kv = splitDecl(d);
            if (!kv) continue;
            const [prop, value] = kv;
            if (prop.startsWith('--')) {
                // a named colour: carried over only when it actually changes
                const [v, ch] = recolour(value, 'var');
                if (ch) { decls.push(`${prop}:${v}`); recoloured++; }
                continue;
            }
            if (!carries(prop)) continue;
            const [v, ch] = recolour(value, roleOf(prop));
            if (ch) recoloured++;
            kept++;
            decls.push(`${prop}:${absoluteUrls(v, base)}`);
        }
        if (decls.length) out.push(`${head}{${decls.join(';')}}`);
    }
    return out;
}

/* ---------------------------------------------------------------- go */

const parts = [];
const stamps = [];
for (const name of sources) {
    const file = path.join(cssDir, name);
    if (!fs.existsSync(file)) {
        console.error('missing ' + file);
        process.exit(1);
    }
    const css = fs.readFileSync(file, 'utf8');
    stamps.push(`${name} ${crypto.createHash('sha1').update(css).digest('hex').slice(0, 12)}`);
    parts.push(`/* ---- ${name} ---- */`, ...convert(read(css), steamOrigin + 'css/' + name));
}

let client = '?';
try {
    client = fs.readFileSync(path.join(steam, 'steamui', 'changelist.txt'), 'utf8').trim();
} catch {}

const header = `/* steam-rice: mono.css. Made by build.mjs, don't edit by hand.
   Steam's own colour rules in greyscale. Built from Steam UI build ${client} (${stamps.join(', ')}).
   After a Steam update, run "node build.mjs" again. */\n`;
const outFile = path.join(here, 'mono.css');
fs.writeFileSync(outFile, header + parts.join('\n') + '\n');
console.log(`mono.css: ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB, ${kept} declarations carried over, ${recoloured} recoloured (Steam UI build ${client})`);
