// steam-rice: settings.js. The steam-rice window, a small terminal-style settings tool inside Steam.
//
// A button in the top bar opens it. It lists the theme's options (read from skin.json, so the list
// is always the one Millennium shows) as chips, block sliders and [x] switches, and a change shows
// straight away in every Steam window.
//
// It doesn't touch Millennium's own settings. What you pick here is kept in Steam's local storage and
// laid over them: for an option, the same options/*.css file Millennium would load is linked after
// Millennium's; for a slider, the variable is set on the page. "reset defaults" forgets all of it.

(() => {
    if (window.__riceSettings) return;
    window.__riceSettings = true;

    const KEY = 'steam-rice:settings';
    // the variables the sliders, the wallpaper field and the extra switches set
    const VARS = ['--corners', '--wallpaper-dim', '--wallpaper', '--hide-add-shelf', '--hide-add-game'];

    /* ---------------------------------------------------------------- what is stored, and applying it */

    function read() {
        try {
            const s = JSON.parse(localStorage.getItem(KEY));
            return s && typeof s === 'object' ? s : {};
        } catch {
            return {};
        }
    }
    function write(s) {
        for (const k of ['opts', 'vars']) if (s[k] && !Object.keys(s[k]).length) delete s[k];
        try {
            if (Object.keys(s).length) localStorage.setItem(KEY, JSON.stringify(s));
            else localStorage.removeItem(KEY);
        } catch {}
    }

    // the theme's files are served from wherever rice.css came from
    function themeBase() {
        for (const l of document.querySelectorAll('link[rel=stylesheet]')) {
            const m = /^(.*\/)rice\.css(?:[?#].*)?$/.exec(l.href);
            if (m) return m[1];
        }
        return null;
    }

    // Runs in every Steam window, and again whenever another window changes what is stored
    function apply() {
        const s = read();
        const opts = s.opts || {};
        const vars = s.vars || {};
        const base = themeBase();
        const mine = new Map([...document.querySelectorAll('link[data-rice-opt]')].map(l => [l.dataset.riceOpt, l]));
        if (base) {
            for (const [name, o] of Object.entries(opts)) {
                if (!o || typeof o.src !== 'string' || !/^options\/[\w-]+\.css$/.test(o.src)) continue;
                let l = mine.get(name);
                mine.delete(name);
                if (!l) {
                    l = document.createElement('link');
                    l.rel = 'stylesheet';
                    l.dataset.riceOpt = name;
                }
                if (l.dataset.riceSrc !== o.src) {
                    l.dataset.riceSrc = o.src;
                    l.href = base + o.src;
                }
                // After everything Millennium loaded for the same option, so this one wins: Millennium's
                // files are in the head, this goes to the end of the body. It is put in once and left
                // there, since moving a style sheet makes the window load it again
                const home = document.body || document.head;
                if (home && (!l.isConnected || (l.parentElement === document.head && document.body))) home.appendChild(l);
            }
            for (const l of mine.values()) l.remove();
        }
        const root = document.documentElement;
        for (const v of VARS) {
            if (typeof vars[v] === 'string') root.style.setProperty(v, vars[v], 'important');
            else root.style.removeProperty(v);
        }
    }

    apply();
    // a new window's style sheets can arrive a moment after this script
    for (const ms of [300, 1500, 5000]) setTimeout(apply, ms);
    window.addEventListener('storage', e => {
        if (e.key === KEY || e.key === null) {
            apply();
            if (layer) render();
        }
    });

    /* ---------------------------------------------------------------- the window (main Steam window only) */

    let layer = null; // the open window's backdrop, or null
    let win = null;
    let skin = null; // skin.json, once read
    let skinError = null;
    let tab = 0;
    let tabs = [];
    let resetArmed = false;
    const rangeKeys = new WeakMap(); // slider element -> step(direction)

    const h = (tag, props, ...kids) => {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(props || {})) {
            if (k === 'class') e.className = v;
            else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
            else if (v === true) e.setAttribute(k, '');
            else if (v !== false && v != null) e.setAttribute(k, v);
        }
        for (const k of kids.flat(3)) if (k != null && k !== false) e.append(k);
        return e;
    };

    const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const changed = () => {
        const s = read();
        return Object.keys(s.opts || {}).length + Object.keys(s.vars || {}).length;
    };

    // what Millennium itself has picked for an option: the value whose file it loaded into this window
    function millenniumValue(cond) {
        const hrefs = [...document.querySelectorAll('link[rel=stylesheet]:not([data-rice-opt])')].map(l => l.href.split(/[?#]/)[0]);
        for (const [v, def] of Object.entries(cond.values)) {
            if (hrefs.some(x => x.endsWith('/' + def.TargetCss.src))) return v;
        }
        return cond.default;
    }
    const current = (name, cond) => read().opts?.[name]?.value ?? millenniumValue(cond);

    function pick(name, cond, value) {
        const s = read();
        s.opts ||= {};
        // picking what Millennium already has needs nothing stored
        if (value === millenniumValue(cond)) delete s.opts[name];
        else s.opts[name] = { value, src: cond.values[value].TargetCss.src };
        write(s);
        apply();
        render();
    }
    function setVar(name, value) {
        const s = read();
        s.vars ||= {};
        if (value == null) delete s.vars[name];
        else s.vars[name] = value;
        write(s);
        apply();
        render();
    }

    /* ---- controls ---- */

    const desc = text => text && h('span', { class: 'rice-desc' }, text);

    function check(k, label, text, on, toggle) {
        return h(
            'button',
            { class: 'rice-check', role: 'switch', 'aria-checked': String(on), 'data-k': k, onclick: toggle },
            h('span', { class: 'rice-box' }, on ? '[x]' : '[ ]'),
            h('span', { class: 'rice-label' }, label),
            desc(text)
        );
    }

    function choice(k, label, text, values, value, set, locked) {
        return h(
            'div',
            { class: 'rice-field' + (locked ? ' locked' : '') },
            h('span', { class: 'rice-label' }, label),
            h(
                'div',
                { class: 'rice-seg', role: 'radiogroup' },
                values.map(v =>
                    h('button', { class: 'rice-opt', role: 'radio', 'aria-checked': String(v === value), 'data-k': k + ':' + v, disabled: locked, onclick: () => set(v) }, v)
                )
            ),
            desc(text)
        );
    }

    // a slider as a row of blocks: ‹ ▮▮▮▮▯▯▯ › 3px
    function range(k, label, text, { min, max, step, value, show, set }) {
        const n = Math.round((max - min) / step);
        const at = Math.min(n, Math.max(0, Math.round((value - min) / step)));
        const to = i => set(+(min + Math.min(n, Math.max(0, i)) * step).toFixed(2));
        const el = h(
            'div',
            { class: 'rice-range', tabindex: 0, role: 'slider', 'aria-valuenow': value, 'data-k': k },
            h('button', { class: 'rice-step', tabindex: -1, onclick: () => to(at - 1) }, '‹'),
            h('div', { class: 'rice-cells' }, Array.from({ length: n + 1 }, (_, i) => h('button', { class: 'rice-cell' + (i < at ? ' on' : '') + (i === at ? ' cur' : ''), tabindex: -1, onclick: () => to(i) }))),
            h('button', { class: 'rice-step', tabindex: -1, onclick: () => to(at + 1) }, '›'),
            h('span', { class: 'rice-value' }, show(value))
        );
        rangeKeys.set(el, dir => to(at + dir));
        return h('div', { class: 'rice-field' }, h('span', { class: 'rice-label' }, label), el, desc(text));
    }

    const heading = text => h('div', { class: 'rice-h' }, text);

    /* ---- tabs ---- */

    const isSwitch = cond => {
        const v = Object.keys(cond.values).map(x => x.toLowerCase()).sort().join();
        return v === 'no,yes';
    };
    // the store and community pages are web pages of their own, where this window's choices don't reach
    const webOnly = cond => Object.values(cond.values).every(v => /^options\/web-/.test(v.TargetCss.src));

    function about() {
        const conds = skin.Conditions;
        const val = name => (conds[name] ? current(name, conds[name]) : '-');
        const n = changed();
        const row = (k, v) => h('div', null, h('span', { class: 'k' }, k), v);
        return [
            h('h2', { class: 'rice-title' }, 'about'),
            h('p', { class: 'rice-lead' }, 'steam made to look like a tiling-wm linux rice.'),
            h(
                'div',
                { class: 'rice-fetch' },
                h('div', { class: 'rice-mark' }),
                h(
                    'div',
                    null,
                    h('div', { class: 'who' }, 'steam-rice'),
                    h('div', { class: 'rice-rule' }, '----------'),
                    row('version', skin.version || '-'),
                    row('for', 'steam + millennium'),
                    row('font', val('Font')),
                    row('logo', val('Logo')),
                    row('pictures', val('Pictures')),
                    row('changed', n ? n + (n === 1 ? ' option here' : ' options here') : 'nothing here'),
                    h('div', { class: 'rice-palette' }, [7, 16, 27, 39, 55, 71, 84, 96].map(l => h('span', { style: `background:hsl(0 0% ${l}%)` })))
                )
            ),
            heading('how this works'),
            h(
                'ul',
                { class: 'rice-tips' },
                h('li', null, 'what you change here is laid over the theme settings in millennium, and shows straight away.'),
                h('li', null, h('kbd', null, 'reset defaults'), ' forgets everything set here and hands the theme back to millennium.'),
                h('li', null, 'store and community pages are set in millennium: steam menu → millennium → themes → steam-rice.'),
                h('li', null, 'new versions arrive under millennium → updates.')
            ),
        ];
    }

    function pane(name) {
        if (name === 'about') return about();
        const conds = Object.entries(skin.Conditions).filter(([, c]) => (c.tab || 'more').toLowerCase() === name);
        const fields = [];
        const switches = [];
        const leads = { look: 'font, corners, wallpaper and borders. changes show straight away.', 'top bar': 'the logo, the tabs and the window buttons.', library: 'what the library shows and hides.' };

        if (name === 'look') {
            const corners = parseFloat(cssVar('--corners')) || 0;
            const dim = parseFloat(cssVar('--wallpaper-dim'));
            fields.push(
                range('corners', 'corners', 'buttons, fields and menus. avatars stay as steam draws them.', {
                    min: 0, max: 8, step: 1, value: corners, show: v => (v ? v + 'px' : 'sharp'), set: v => setVar('--corners', v + 'px'),
                }),
                range('dim', 'wallpaper dim', 'how dark the wallpaper is. go darker if text is hard to read.', {
                    min: 0, max: 0.9, step: 0.1, value: Number.isFinite(dim) ? dim : 0.5, show: v => Math.round(v * 100) + '%', set: v => setVar('--wallpaper-dim', String(v)),
                })
            );
        }
        for (const [n, c] of conds) {
            if (n === 'Corners' || n === 'Wallpaper dim') continue; // the two sliders above
            if (isSwitch(c)) {
                const yes = Object.keys(c.values).find(v => v.toLowerCase() === 'yes');
                const no = Object.keys(c.values).find(v => v.toLowerCase() === 'no');
                const on = current(n, c) === yes;
                switches.push(check('o:' + n, n, c.description, on, () => pick(n, c, on ? no : yes)));
            } else if (webOnly(c)) {
                fields.push(choice('o:' + n, n, 'web pages are out of this window\'s reach: set this one in millennium\'s theme settings.', Object.keys(c.values), millenniumValue(c), () => {}, true));
            } else {
                fields.push(choice('o:' + n, n, c.description, Object.keys(c.values), current(n, c), v => pick(n, c, v)));
            }
        }
        if (name === 'look') {
            const stored = read().vars?.['--wallpaper'] || '';
            const url = /^url\("(.*)"\)$/.exec(stored)?.[1] || '';
            const input = h('input', { type: 'text', spellcheck: 'false', placeholder: 'https://… link to a picture (empty = the misty forest)', value: url, 'data-k': 'wallpaper' });
            const save = () => {
                const v = input.value.trim();
                if (!v) return setVar('--wallpaper', null);
                if (!/^https:\/\/[^\s"'\\()]+$/.test(v)) {
                    input.parentElement.classList.add('bad');
                    return;
                }
                setVar('--wallpaper', `url("${v}")`);
            };
            input.addEventListener('change', save);
            fields.push(h('div', { class: 'rice-field' }, h('span', { class: 'rice-label' }, 'wallpaper'), h('label', { class: 'rice-input' }, h('span', null, '>'), input), desc('a link to your own picture, starting with https://. press enter to set it.')));
        }
        if (name === 'library') {
            const shelf = cssVar('--hide-add-shelf') === 'on';
            const game = cssVar('--hide-add-game') === 'on';
            switches.push(
                check('v:shelf', 'hide add shelf', 'the row under the shelves on the library home. it stays while no shelf is left.', shelf, () => setVar('--hide-add-shelf', shelf ? 'off' : 'on')),
                check('v:game', 'hide add a game', 'in the bottom bar. games → add a non-steam game still works.', game, () => setVar('--hide-add-game', game ? 'off' : 'on'))
            );
        }
        return [h('h2', { class: 'rice-title' }, name), h('p', { class: 'rice-lead' }, leads[name] || ''), fields, switches.length ? heading('switches') : null, switches];
    }

    /* ---- the frame ---- */

    function render() {
        if (!layer) return;
        const focused = layer.contains(document.activeElement) ? document.activeElement.dataset.k : null;
        let body;
        if (skinError) body = h('div', { class: 'rice-pane' }, h('p', { class: 'rice-error' }, 'could not read the theme\'s option list (skin.json): ' + skinError));
        else if (!skin) body = h('div', { class: 'rice-pane' }, h('p', { class: 'rice-lead' }, 'reading options…'));
        else {
            tabs = ['about', ...new Set(Object.values(skin.Conditions).map(c => (c.tab || 'more').toLowerCase()))];
            tab = Math.min(tab, tabs.length - 1);
            body = h('div', { class: 'rice-pane', role: 'tabpanel' }, pane(tabs[tab]));
        }
        const n = changed();
        const next = h(
            'div',
            { class: 'rice-win', tabindex: -1, role: 'dialog', 'aria-label': 'steam-rice settings' },
            h('div', { class: 'rice-bar' }, h('b', null, 'steam-rice'), h('span', { class: 'rice-path' }, `~/.config/steam-rice/${(tabs[tab] || 'about').replace(' ', '-')}.conf`), h('button', { class: 'rice-close', 'aria-label': 'close', onclick: close }, '×')),
            h(
                'div',
                { class: 'rice-body' },
                h(
                    'div',
                    { class: 'rice-side', role: 'tablist' },
                    tabs.map((t, i) => h('button', { class: 'rice-tab', role: 'tab', 'aria-selected': String(i === tab), 'data-k': 't:' + t, onclick: () => go(i) }, h('i', null, String(i + 1)), t)),
                    h('button', { class: 'rice-reset' + (resetArmed ? ' armed' : ''), 'data-k': 'reset', disabled: !n && !resetArmed, onclick: reset }, resetArmed ? '↺ click again to reset' : '↺ reset defaults')
                ),
                body
            ),
            h(
                'div',
                { class: 'rice-status' },
                h('b', null, 'RICE'),
                h('span', null, 'theme on'),
                h('span', null, n ? `changed ${n}` : 'as millennium has it'),
                h('span', { class: 'rice-hints' }, h('kbd', null, `1-${tabs.length || 1}`), ' section · ', h('kbd', null, 'tab'), ' move · ', h('kbd', null, 'space'), ' toggle · ', h('kbd', null, '←→'), ' slide · ', h('kbd', null, 'esc'), ' close')
            )
        );
        const scroll = win?.querySelector('.rice-pane')?.scrollTop || 0;
        if (win) win.replaceWith(next);
        else layer.append(next);
        win = next;
        const p = win.querySelector('.rice-pane');
        if (p) p.scrollTop = scroll;
        const again = focused && [...win.querySelectorAll('[data-k]')].find(e => e.dataset.k === focused);
        (again || win).focus({ preventScroll: true });
    }

    function go(i) {
        tab = i;
        resetArmed = false;
        if (win) win.querySelector('.rice-pane').scrollTop = 0;
        render();
    }
    function reset() {
        if (!resetArmed) {
            resetArmed = true;
            return render();
        }
        resetArmed = false;
        write({});
        apply();
        render();
    }

    function onKey(e) {
        if (!layer) return;
        // while the window is open the keyboard is its own: Steam underneath hears nothing
        e.stopPropagation();
        const typing = e.target instanceof HTMLInputElement;
        if (e.key === 'Escape') {
            e.preventDefault();
            return close();
        }
        if (typing) {
            if (e.key === 'Enter') e.target.blur();
            return;
        }
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (/^[1-9]$/.test(e.key) && +e.key <= tabs.length) {
            e.preventDefault();
            return go(+e.key - 1);
        }
        const r = e.target.closest?.('.rice-range');
        if (r && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
            rangeKeys.get(r)?.(e.key === 'ArrowLeft' ? -1 : 1);
        }
    }

    // Store and community pages are drawn by a browser view that lies over the whole Steam window, this
    // window included. Steam's own handle on that view hides it while the window is open, and the
    // wallpaper shows in its place
    let hidPage = false;
    function pageView(show) {
        try {
            const el = document.querySelector('.BrowserWrapper .Browser');
            const there = !!el && el.getBoundingClientRect().height > 0;
            const view = window.opener?.MainWindowBrowserManager?.m_browser;
            if (!view || typeof view.SetVisible !== 'function') return;
            if (!show && there) {
                view.SetVisible(false);
                hidPage = true;
            } else if (show && hidPage) {
                hidPage = false;
                // only if Steam is still on a web page: on the library it keeps the view hidden itself
                if (there) view.SetVisible(true);
            }
        } catch {}
    }

    function open() {
        if (layer) return;
        style();
        pageView(false);
        resetArmed = false;
        layer = h('div', { class: 'rice-layer', onmousedown: e => e.target === layer && close() });
        win = null;
        document.body.append(layer);
        window.addEventListener('keydown', onKey, true);
        render();
        if (!skin) {
            const base = themeBase();
            (base ? fetch(base + 'skin.json').then(r => (r.ok ? r.json() : Promise.reject('HTTP ' + r.status))) : Promise.reject('rice.css is not loaded'))
                .then(j => {
                    if (!j || typeof j.Conditions !== 'object') throw 'no options in it';
                    skin = j;
                    skinError = null;
                })
                .catch(err => {
                    skinError = String(err?.message || err);
                })
                .finally(render);
        }
    }
    function close() {
        if (!layer) return;
        window.removeEventListener('keydown', onKey, true);
        layer.remove();
        layer = win = null;
        pageView(true);
        document.activeElement?.blur?.();
    }

    /* ---- the button in the top bar ---- */

    // A rice bowl. It stands just left of the bell, in the bar's empty stretch, on a layer of its own:
    // nothing in the bar is moved to make room for it
    const BOWL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 11.5h19a9.5 9.5 0 0 1-6 8.83V22h-7v-1.67a9.5 9.5 0 0 1-6-8.83Z"/><path d="M5.6 10a6.5 6.5 0 0 1 12.8 0Z"/><path d="m13.2 3.4 8.3-1.9v1.2l-8 2.3Z"/></svg>';
    let button = null;

    function place() {
        const bar = document.querySelector('.DesktopUI .TopBar .TitleBarControls');
        if (!bar || !document.body) {
            if (button) {
                button.remove();
                button = null;
            }
            return;
        }
        if (!button || !button.isConnected) {
            style();
            button = h('button', { class: 'rice-open', 'aria-label': 'steam-rice settings', title: 'steam-rice settings', onclick: () => (layer ? close() : open()) });
            button.innerHTML = BOWL;
            document.body.append(button);
        }
        // left of the first control that is actually shown
        const first = [...bar.querySelectorAll('.Button, .AccountMenu')].map(e => e.getBoundingClientRect()).filter(r => r.width).sort((a, b) => a.left - b.left)[0] || bar.getBoundingClientRect();
        button.style.left = Math.round(first.left - 8 - 30) + 'px';
        button.style.top = Math.round(first.top + (first.height - 24) / 2) + 'px';
    }
    /* ---- its style sheet, added to the main window only ---- */

    function style() {
        if (document.getElementById('rice-settings-css')) return;
        const s = document.createElement('style');
        s.id = 'rice-settings-css';
        s.textContent = SHEET;
        document.head.append(s);
    }

    const SHEET = `
.rice-open {
    position: fixed; z-index: 40; width: 30px; height: 24px; padding: 0; border: 0;
    display: grid; place-items: center; cursor: pointer; -webkit-app-region: no-drag;
    border-radius: var(--corners, 3px); background: var(--glass, hsl(0 0% 100% / 0.04)); color: var(--fg-dim, hsl(0 0% 64%));
}
.rice-open:hover { background: var(--active, hsl(0 0% 100% / 0.1)); color: var(--fg-bright, hsl(0 0% 98%)); }
.rice-open svg { width: 15px; height: 15px; fill: currentColor; }

.rice-layer {
    position: fixed; inset: 0; z-index: 9000; display: grid; place-items: center;
    background: hsl(0 0% 0% / 0.45); -webkit-app-region: no-drag;
}
.rice-win {
    --r-t1: var(--fg-bright, hsl(0 0% 98%)); --r-t2: var(--fg-strong, hsl(0 0% 92%)); --r-t3: var(--fg, hsl(0 0% 84%));
    --r-t4: var(--fg-dim, hsl(0 0% 64%)); --r-t5: var(--fg-faint, hsl(0 0% 50%));
    --r-line: var(--line, hsl(0 0% 100% / 0.12)); --r-border: hsl(0 0% 100% / 0.2); --r-focus: hsl(0 0% 100% / 0.6);
    --r-sel: hsl(0 0% 84%); --r-sel-text: var(--ink, hsl(0 0% 8%)); --r-hover: var(--hover, hsl(0 0% 100% / 0.06));
    --r-red: var(--red, hsl(355 65% 70%)); --r-radius: min(var(--corners, 3px), 3px);
    display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: min(880px, 94vw); height: min(600px, 88vh);
    overflow: hidden; border: 1px solid var(--r-border); border-radius: var(--r-radius);
    background: hsl(0 0% 7% / 0.88); backdrop-filter: blur(20px) saturate(1.2);
    color: var(--r-t3); font: 13px/1.45 'Iosevka', ui-monospace, monospace; text-align: left; text-transform: lowercase;
    user-select: none;
}
.rice-win:focus { outline: none; }
.rice-win :is(button, input) { font: inherit; color: inherit; text-transform: inherit; }
.rice-win button { cursor: pointer; }
.rice-win button:disabled { cursor: default; }
.rice-win :is(button, [tabindex]):focus-visible { outline: 1px dashed var(--r-focus); outline-offset: -1px; }

.rice-bar { display: flex; align-items: center; gap: 10px; padding: 7px 8px 7px 14px; border-bottom: 1px solid var(--r-line); white-space: nowrap; }
.rice-bar b { color: var(--r-t1); font-weight: 600; }
.rice-path { overflow: hidden; color: var(--r-t5); text-overflow: ellipsis; }
.rice-close { margin-left: auto; padding: 0 8px; border: 0; border-radius: var(--r-radius); background: none; color: var(--r-t4); font-size: 15px; }
.rice-close:hover { background: var(--r-hover); color: var(--r-t1); }

.rice-body { display: grid; grid-template-columns: 168px minmax(0, 1fr); min-height: 0; }
.rice-side { display: flex; flex-direction: column; gap: 1px; padding: 8px 0; border-right: 1px solid var(--r-line); }
.rice-tab { display: flex; gap: 10px; width: 100%; padding: 4px 14px; border: 0; background: none; color: var(--r-t4); text-align: left; }
.rice-tab i { color: var(--r-t5); font-style: normal; }
.rice-tab:hover { background: var(--r-hover); color: var(--r-t2); }
.rice-tab[aria-selected='true'] { background: var(--r-sel); color: var(--r-sel-text); font-weight: 600; }
.rice-tab[aria-selected='true'] i { color: inherit; opacity: 0.55; }
.rice-reset { margin: auto 14px 0; padding: 3px 0; border: 0; background: none; color: var(--r-t5); text-align: left; }
.rice-reset:hover:not(:disabled) { color: var(--r-t2); }
.rice-reset:disabled { opacity: 0.5; }
.rice-reset.armed { color: var(--r-red); }

.rice-pane { overflow-y: auto; padding: 14px 22px 22px; }
.rice-title { margin: 0 0 2px; color: var(--r-t1); font-size: 15px; font-weight: 600; }
.rice-title::before { content: '# '; color: var(--r-t5); }
.rice-lead { margin: 0 0 10px; color: var(--r-t5); }
.rice-error { margin: 0; color: var(--r-red); text-transform: none; }
.rice-h { display: flex; align-items: center; gap: 8px; margin: 16px 0 4px; color: var(--r-t5); font-size: 12px; }
.rice-h::before { content: '──'; }
.rice-h::after { content: ''; flex: 1; border-top: 1px solid var(--r-line); }
/* descriptions come from skin.json as written: some of them are about upper and lower case */
.rice-desc { display: block; color: var(--r-t5); font-size: 12px; text-transform: none; }
.rice-label { color: var(--r-t2); }

.rice-check { display: grid; grid-template-columns: 4ch minmax(0, 1fr); width: calc(100% + 16px); margin: 0 -8px; padding: 5px 8px; border: 0; border-radius: var(--r-radius); background: none; text-align: left; }
.rice-check:hover { background: var(--r-hover); }
.rice-box { color: var(--r-t5); }
.rice-check[aria-checked='true'] .rice-box { color: var(--r-t1); font-weight: 600; }
.rice-check[aria-checked='false'] .rice-label { color: var(--r-t4); }
.rice-check .rice-desc { grid-column: 2; }

.rice-field { display: grid; grid-template-columns: 17ch minmax(0, 1fr); align-items: center; gap: 3px 14px; padding: 7px 0; }
.rice-field > .rice-label { align-self: start; padding-top: 2px; }
.rice-field .rice-desc { grid-column: 2; }
.rice-field.locked .rice-seg { opacity: 0.45; }
.rice-seg { display: flex; flex-wrap: wrap; gap: 4px; }
.rice-opt { padding: 1px 9px; border: 1px solid var(--r-line); border-radius: var(--r-radius); background: none; color: var(--r-t4); }
.rice-opt:hover:not(:disabled) { border-color: var(--r-border); color: var(--r-t2); }
.rice-opt[aria-checked='true'] { border-color: var(--r-sel); background: var(--r-sel); color: var(--r-sel-text); font-weight: 600; }

.rice-range { display: flex; align-items: center; gap: 6px; width: fit-content; border-radius: var(--r-radius); }
.rice-cells { display: flex; gap: 2px; }
.rice-cell { width: 9px; height: 16px; padding: 0; border: 0; border-radius: 1px; background: var(--r-line); }
.rice-cell.on { background: var(--r-t4); }
.rice-cell.cur { background: var(--r-t1); }
.rice-cell:hover { background: var(--r-t2); }
.rice-step { padding: 0 3px; border: 0; background: none; color: var(--r-t5); }
.rice-step:hover { color: var(--r-t1); }
.rice-value { min-width: 5ch; color: var(--r-t2); }

.rice-input { display: flex; align-items: center; gap: 8px; padding: 3px 0; border-bottom: 1px solid var(--r-line); }
.rice-input:focus-within { border-color: var(--r-focus); }
.rice-input.bad { border-color: var(--r-red); }
.rice-input > span { color: var(--r-t4); }
.rice-input input { flex: 1; min-width: 0; padding: 0; border: 0; outline: 0; background: none; color: var(--r-t1); text-transform: none; user-select: text; }
.rice-input input::placeholder { color: var(--r-t5); font-style: normal; }

.rice-fetch { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 28px; margin: 6px 0 4px; }
.rice-mark { width: 96px; height: 96px; background: var(--r-t2); -webkit-mask: var(--logo-shape) center / contain no-repeat; mask: var(--logo-shape) center / contain no-repeat; }
.rice-fetch .k { display: inline-block; width: 11ch; color: var(--r-t1); font-weight: 600; }
.rice-fetch .who { color: var(--r-t1); font-weight: 600; }
.rice-rule { color: var(--r-t5); }
.rice-palette { display: flex; margin-top: 8px; }
.rice-palette span { width: 18px; height: 12px; }
.rice-tips { margin: 0; padding: 0; list-style: none; }
.rice-tips li { padding: 2px 0 2px 3ch; text-indent: -3ch; color: var(--r-t4); }
.rice-tips li::before { content: ' - '; color: var(--r-t5); white-space: pre; }
.rice-tips kbd, .rice-status kbd { color: var(--r-t2); font: inherit; }

.rice-status { display: flex; align-items: center; gap: 18px; padding-right: 12px; border-top: 1px solid var(--r-line); color: var(--r-t5); font-size: 12px; white-space: nowrap; }
.rice-status b { padding: 3px 12px; background: var(--r-sel); color: var(--r-sel-text); font-weight: 600; text-transform: none; }
.rice-hints { margin-left: auto; overflow: hidden; text-overflow: ellipsis; }
`;

    // Steam builds the top bar a moment after the window opens, and rebuilds it now and then
    place();
    setInterval(place, 1000);
})();
