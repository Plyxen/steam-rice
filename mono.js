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

(() => {
    if (window.__riceMono) return;
    window.__riceMono = true;

    const steamCss = 'https://steamloopback.host/css/';

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
    // Returns null when the colour is already grey. Answers are remembered: Steam reuses a few hundred colours
    const seen = new Map();
    function remap(r, g, b, role) {
        const key = role + r + ',' + g + ',' + b;
        if (seen.has(key)) return seen.get(key);
        const [L, C, h] = toLch(r, g, b);
        const grey = l => toRgb(Math.min(1, Math.max(0, l)), 0, 0);
        let out;
        if (C < 0.003) out = null;
        else if (h >= 195 && h <= 292) {
            // blue. Steam's blue-greys keep their lightness and lose the tint. The accent goes mid grey
            // behind text, so white labels still read, and light grey as text or a line
            if (C <= 0.06 || role === 'var') out = grey(L);
            else out = role === 'bg' ? grey(Math.min(L * 0.8, 0.56)) : grey(L + (1 - L) * 0.5);
        } else if (C <= 0.03) out = grey(L); // a faint warm or green cast is still just grey
        else out = toRgb(role === 'bg' ? Math.min(L, 0.62) : L, Math.min(C, 0.1), h); // real colours stay, muted
        seen.set(key, out);
        return out;
    }

    const colour = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[^()]*\)/g;
    const hex2 = v => v.toString(16).padStart(2, '0');

    function recolour(value, role) {
        return value.replace(colour, tok => {
            if (tok[0] === '#') {
                let h = tok.slice(1);
                if (h.length === 3 || h.length === 4) h = h.replace(/./g, '$&$&');
                if (h.length !== 6 && h.length !== 8) return tok;
                const to = remap(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), role);
                return to ? '#' + hex2(to[0]) + hex2(to[1]) + hex2(to[2]) + h.slice(6) : tok;
            }
            if (tok.includes('var(') || tok.includes('calc(') || tok.includes('from ')) return tok;
            const n = tok.slice(tok.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean);
            if (n.length < 3) return tok;
            const rgb = tok.startsWith('hsl')
                ? hslToRgb(parseFloat(n[0]), parseFloat(n[1]), parseFloat(n[2]))
                : n.slice(0, 3).map(v => (v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v)));
            if (rgb.some(Number.isNaN)) return tok;
            const to = remap(Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), role);
            if (!to) return tok;
            return n[3] !== undefined ? `rgba(${to},${n[3]})` : `rgb(${to})`;
        });
    }

    /* ---------------------------------------------------------------- one style sheet */

    const hasColour = /#[0-9a-fA-F]{3}|rgb|hsl/;

    function greySheet(css, href) {
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

    function grey(href) {
        if (!made.has(href)) {
            made.set(
                href,
                fetch(href)
                    .then(r => (r.ok ? r.text() : Promise.reject(r.status)))
                    .then(css => home.URL.createObjectURL(new home.Blob([greySheet(css, href)], { type: 'text/css' })))
            );
        }
        return made.get(href);
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

    function take(link) {
        if (link.dataset.rice || !link.href.startsWith(steamCss)) return;
        link.dataset.rice = 'stock';
        grey(link.href)
            .then(url => {
                const mono = document.createElement('link');
                mono.rel = 'stylesheet';
                mono.dataset.rice = 'mono';
                mono.href = url;
                // Steam's own sheet stays until the grey one has loaded, so a window is never unstyled
                mono.onload = () => retire(link);
                link.after(mono);
            })
            .catch(() => made.delete(link.href)); // leave Steam's sheet alone, try again in the next window
    }

    const scan = () => document.querySelectorAll('link[rel=stylesheet]').forEach(take);
    scan();
    // Steam adds a sheet now and then, for a page it loads late
    new MutationObserver(scan).observe(document.head, { childList: true });
})();
