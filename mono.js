// steam-rice: mono.js. Turns Steam grey.
//
// Steam has almost no colour variables. Its blue-grey look is some eleven thousand literal colours in its
// own style sheets, so a theme can't recolour it by setting a few names, and a theme that overrides them
// rule by rule ends up as a megabyte of CSS that breaks with every Steam update.
//
// So this doesn't add rules. It reads each of Steam's style sheets once, rewrites the colours in the text,
// and gives every window the rewritten sheet in place of the original. Steam ends up with exactly as many
// rules as without a theme, in the same order, and a Steam update needs nothing: the next start reads the
// new sheets.
//
// Blue, Steam's tint and accent, becomes plain grey. Other hues (green for "playing", red for danger)
// stay, muted. Pictures are not touched. Steam's font becomes --rice-font, which rice.css sets.
//
// With colours switched on in the steam-rice window, the greys are written so that they follow two
// colours instead, --rice-tint and --rice-accent, and a change of colour needs no new sheets.

(() => {
    if (window.__riceMono) return;
    window.__riceMono = true;

    const steamCss = 'https://steamloopback.host/css/';

    // settings.js keeps the two colours under this name while colours are on. Here only "is it there" matters
    const COLOURS = 'steam-rice:colours';
    const tinted = () => {
        try {
            return !!localStorage.getItem(COLOURS);
        } catch {
            return false;
        }
    };

    /* ---------------------------------------------------------------- colour maths (OKLCH) */

    const toLinear = v => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const fromLinear = v => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));

    function toLch(r, g, b) {
        r = toLinear(r); g = toLinear(g); b = toLinear(b);
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
        const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
        return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
    }

    function toRgb(L, C, h) {
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
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h / 30) % 12;
            return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
        };
        return [f(0), f(8), f(4)];
    }

    // role: 'bg' = painted behind text, 'fg' = text, icons and lines, 'var' = a named colour (use unknown).
    // The answer is what the colour becomes: ['grey', L] (it was grey already), ['tint', L] (one of Steam's
    // blue-greys), ['accent', L] (Steam's blue) or ['rgb', [r, g, b]] (another hue, muted).
    // Answers are remembered: Steam reuses a few hundred colours
    const seen = new Map();
    function remap(r, g, b, role) {
        const key = role + r + ',' + g + ',' + b;
        if (seen.has(key)) return seen.get(key);
        const [L, C, h] = toLch(r, g, b);
        let out;
        if (C < 0.003) out = ['grey', L];
        else if (h >= 195 && h <= 292) {
            // blue. Steam's blue-greys keep their lightness and lose the tint. The accent goes mid grey
            // behind text, so white labels still read, and light grey as text or a line
            if (C <= 0.06 || role === 'var') out = ['tint', L];
            else out = ['accent', role === 'bg' ? Math.min(L * 0.8, 0.56) : L + (1 - L) * 0.5];
        } else if (C <= 0.03) out = ['tint', L]; // a faint warm or green cast is still just grey
        else out = ['rgb', toRgb(role === 'bg' ? Math.min(L, 0.62) : L, Math.min(C, 0.1), h)]; // real colours stay, muted
        seen.set(key, out);
        return out;
    }

    // The colour as text. alpha is '' or what was written after the colour's own three numbers.
    // Grey: a plain grey of that lightness, or null to leave a colour that was grey already.
    // Tinted: the same lightness with the hue of --rice-tint or --rice-accent, and no more of it than
    // suits a line of text. Black and white stay as they are
    let tint = false;
    const hex2 = v => v.toString(16).padStart(2, '0');
    function paint([kind, v], alpha) {
        if (kind !== 'rgb') {
            const L = Math.min(1, Math.max(0, v));
            if (tint && L > 0.04 && L < 0.985) {
                const from = kind === 'accent' ? 'var(--rice-accent, #808080) ' + L.toFixed(3) + ' min(c, 0.13) h' : 'var(--rice-tint, #808080) ' + L.toFixed(3) + ' min(c, 0.025) h';
                return 'oklch(from ' + from + (alpha === '' ? '' : ' / ' + alpha) + ')';
            }
            if (kind === 'grey') return null;
            v = toRgb(L, 0, 0);
        }
        return alpha === '' ? '#' + hex2(v[0]) + hex2(v[1]) + hex2(v[2]) : `rgba(${v},${alpha})`;
    }

    // url(...) is matched first so that it is passed over whole: "#abc" in there names a part of a
    // picture, it is not a colour
    const colour = /\burl\([^)]*\)|#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[^()]*\)/g;

    function recolour(value, role) {
        return value.replace(colour, tok => {
            if (tok.startsWith('url(')) return tok;
            if (tok[0] === '#') {
                let h = tok.slice(1);
                if (h.length === 3 || h.length === 4) h = h.replace(/./g, '$&$&');
                if (h.length !== 6 && h.length !== 8) return tok;
                const to = remap(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), role);
                if (!tint) return to[0] === 'grey' ? tok : paint(to, '') + h.slice(6);
                return paint(to, h.length === 8 ? String(+(parseInt(h.slice(6), 16) / 255).toFixed(3)) : '') ?? tok;
            }
            if (tok.includes('var(') || tok.includes('calc(') || tok.includes('from ')) return tok;
            const n = tok.slice(tok.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean);
            if (n.length < 3) return tok;
            const rgb = tok.startsWith('hsl')
                ? hslToRgb(parseFloat(n[0]), parseFloat(n[1]), parseFloat(n[2]))
                : n.slice(0, 3).map(v => (v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v)));
            if (rgb.some(Number.isNaN)) return tok;
            const to = remap(Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), role);
            return paint(to, n[3] ?? '') ?? tok;
        });
    }

    /* ---------------------------------------------------------------- one style sheet */

    const hasColour = /#[0-9a-fA-F]{3}|rgb|hsl/;

    function greySheet(css, href, withTint) {
        tint = withTint;
        // The rewritten sheet is loaded from memory, where "/images/x.png" points nowhere: spell urls out in full
        css = css.replace(/url\(\s*(['"]?)(?!data:|https?:|blob:|#|<)([^'")]+)\1\s*\)/g, (all, q, u) => {
            try {
                return `url(${q}${new URL(u, href).href}${q})`;
            } catch {
                return all;
            }
        });
        // Only the insides of { } are touched, and in there only colour values and the font name.
        // Selectors and everything else pass through as they are
        return css.replace(/([^{}]*)\{([^{}]*)\}/g, (all, head, body) => {
            if (!hasColour.test(body) && !body.includes('Motiva Sans')) return all;
            if (head.includes('@font-face')) return all; // that is where Steam's font is defined, not used
            return head + '{' + body.replace(/(^|;)(\s*)([\w-]+)(\s*:)([^;]*)/g, (decl, sep, gap, prop, colon, value) => {
                if (prop === 'font-family' || prop === 'font') {
                    return sep + gap + prop + colon + value.replace(/(["']?)Motiva Sans\1/, 'var(--rice-font, "Motiva Sans")');
                }
                if (!hasColour.test(value)) return decl;
                const role = prop.includes('background') || prop.includes('shadow') ? 'bg' : prop.startsWith('--') ? 'var' : 'fg';
                return sep + gap + prop + colon + recolour(value, role);
            }) + '}';
        });
    }

    /* ---------------------------------------------------------------- swap the sheets */

    // Every Steam window is opened by one hidden, long-lived window. The rewritten sheets are kept there,
    // so the work is done once per Steam start and each new window only links to the result
    let home = window;
    try {
        if (window.opener && window.opener.document) home = window.opener;
    } catch {}
    const made = (home.__riceMonoSheets ||= new Map());
    let mode = tinted();

    function grey(href) {
        const key = (mode ? 'tint ' : '') + href;
        const withTint = mode;
        if (!made.has(key)) {
            const job = fetch(href)
                .then(r => (r.ok ? r.text() : Promise.reject(r.status)))
                .then(css => home.URL.createObjectURL(new home.Blob([greySheet(css, href, withTint)], { type: 'text/css' })));
            made.set(key, job);
            job.catch(() => made.delete(key)); // try again in the next window
        }
        return made.get(key);
    }

    // Switch Steam's sheet off once it has loaded too. The grey copy can be ready before a big
    // sheet like sp.css has finished loading, and a sheet switched off mid-load comes back on in
    // Chromium, which left every window running both.
    function retire(link) {
        const off = () => {
            link.disabled = true;
            if (link.sheet) link.sheet.disabled = true;
        };
        if (link.sheet) off();
        else link.addEventListener('load', off, { once: true });
    }

    const copies = new Map(); // Steam's sheet -> its grey copy, in this window

    function copy(link) {
        const asked = mode;
        grey(link.href)
            .then(url => {
                if (asked !== mode || !link.isConnected) return; // colours were switched meanwhile
                const old = copies.get(link);
                const mono = document.createElement('link');
                mono.rel = 'stylesheet';
                mono.dataset.rice = 'mono';
                mono.href = url;
                // What is there stays until the new one has loaded, so a window is never unstyled:
                // Steam's own sheet the first time, the other copy when colours are switched
                mono.onload = () => {
                    retire(link);
                    if (old) old.remove();
                };
                (old || link).after(mono);
                copies.set(link, mono);
            })
            .catch(() => {}); // leave Steam's sheet alone
    }

    function take(link) {
        if (link.dataset.rice || !link.href.startsWith(steamCss)) return;
        link.dataset.rice = 'stock';
        copy(link);
    }

    // Colours switched on or off (settings.js calls this, and other windows hear of it from storage):
    // every sheet gets its other copy
    function swap() {
        if (tinted() === mode) return;
        mode = !mode;
        for (const link of [...copies.keys()]) if (link.isConnected) copy(link);
    }
    window.__riceMonoSwap = swap;
    window.addEventListener('storage', e => {
        if (e.key === COLOURS || e.key === null) swap();
    });

    function scan() {
        document.querySelectorAll('link[rel=stylesheet]').forEach(take);
        // a sheet Steam has taken away again must not leave its grey copy styling the window
        for (const [link, mono] of copies) {
            if (link.isConnected) continue;
            mono.remove();
            copies.delete(link);
        }
    }
    scan();
    // Steam adds a sheet now and then, for a page it loads late
    new MutationObserver(scan).observe(document.head, { childList: true });
})();
