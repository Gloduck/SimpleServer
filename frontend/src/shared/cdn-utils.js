const NPM_MIRROR_BASE = 'https://registry.npmmirror.com';
const MONACO_VERSION = '0.55.1';
const PRETTIER_VERSION = '3.9.4';
const VDITOR_VERSION = '3.11.2';
const CODICONS_VERSION = '0.0.45';
const CROPPER_VERSION = '1.6.2';
const XTERM_VERSION = '5.5.0';
const XTERM_FIT_ADDON_VERSION = '0.10.0';

const MONACO_BASE = `${NPM_MIRROR_BASE}/monaco-editor/${MONACO_VERSION}/files/min/vs`;
const PRETTIER_BASE = `${NPM_MIRROR_BASE}/prettier/${PRETTIER_VERSION}/files`;
const VDITOR_BASE = `${NPM_MIRROR_BASE}/vditor/${VDITOR_VERSION}/files`;
const CODICONS_BASE = `${NPM_MIRROR_BASE}/@vscode/codicons/${CODICONS_VERSION}/files`;
const CROPPER_BASE = `${NPM_MIRROR_BASE}/cropperjs/${CROPPER_VERSION}/files`;
const XTERM_BASE = `${NPM_MIRROR_BASE}/@xterm/xterm/${XTERM_VERSION}/files`;
const XTERM_FIT_ADDON_BASE = `${NPM_MIRROR_BASE}/@xterm/addon-fit/${XTERM_FIT_ADDON_VERSION}/files`;
const resourceLoadPromises = new Map();

const CdnUtils = {
    npmMirrorBase: NPM_MIRROR_BASE,

    monaco: {
        version: MONACO_VERSION,
        base: MONACO_BASE,
        loader: `${MONACO_BASE}/loader.js`
    },

    prettier: {
        version: PRETTIER_VERSION,
        base: PRETTIER_BASE,
        standalone: `${PRETTIER_BASE}/standalone.js`,
        plugin: (name) => `${PRETTIER_BASE}/plugins/${name}.js`
    },

    vditor: {
        version: VDITOR_VERSION,
        base: VDITOR_BASE,
        script: `${VDITOR_BASE}/dist/index.min.js`,
        style: `${VDITOR_BASE}/dist/index.css`
    },

    codicons: {
        version: CODICONS_VERSION,
        base: CODICONS_BASE,
        style: `${CODICONS_BASE}/dist/codicon.css`
    },

    cropper: {
        version: CROPPER_VERSION,
        base: CROPPER_BASE,
        script: `${CROPPER_BASE}/dist/cropper.min.js`,
        style: `${CROPPER_BASE}/dist/cropper.css`
    },

    xterm: {
        version: XTERM_VERSION,
        base: XTERM_BASE,
        script: `${XTERM_BASE}/lib/xterm.js`,
        style: `${XTERM_BASE}/css/xterm.css`,
        fitAddonScript: `${XTERM_FIT_ADDON_BASE}/lib/addon-fit.js`
    },

    loadScriptWithoutAmd(src, getGlobal, label = 'script') {
        const existing = getGlobal?.();
        if (existing) return Promise.resolve(existing);
        if (!resourceLoadPromises.has(src)) {
            resourceLoadPromises.set(src, new Promise((resolve, reject) => {
                const previousDefine = window.define;
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => {
                    window.define = previousDefine;
                    const value = getGlobal?.();
                    value ? resolve(value) : reject(new Error(`${label} did not expose expected global`));
                };
                script.onerror = () => {
                    window.define = previousDefine;
                    reject(new Error(`Failed to load ${label}`));
                };
                window.define = undefined;
                document.head.append(script);
            }));
        }
        return resourceLoadPromises.get(src);
    },

    loadScript(src, getGlobal, label = 'script') {
        const existing = getGlobal?.();
        if (existing) return Promise.resolve(existing);
        if (!resourceLoadPromises.has(src)) {
            resourceLoadPromises.set(src, new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => {
                    const value = getGlobal?.();
                    value ? resolve(value) : reject(new Error(`${label} did not expose expected global`));
                };
                script.onerror = () => reject(new Error(`Failed to load ${label}`));
                document.head.append(script);
            }));
        }
        return resourceLoadPromises.get(src);
    },

    loadStyle(href, label = 'stylesheet') {
        const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .some((link) => link.getAttribute('href') === href || link.href === href);
        if (existing) return Promise.resolve();
        if (!resourceLoadPromises.has(href)) {
            resourceLoadPromises.set(href, new Promise((resolve, reject) => {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                link.onload = resolve;
                link.onerror = () => reject(new Error(`Failed to load ${label}`));
                document.head.append(link);
            }));
        }
        return resourceLoadPromises.get(href);
    },

    loadCodicons() {
        return this.loadStyle(this.codicons.style, 'VS Code codicons stylesheet');
    },

    loadMonaco() {
        return new Promise((resolve, reject) => {
            if (window.monaco) {
                resolve(window.monaco);
                return;
            }

            const configureAndLoad = () => {
                window.require.config({ paths: { vs: this.monaco.base } });
                window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
            };

            if (window.require) {
                configureAndLoad();
                return;
            }

            this.loadScript(this.monaco.loader, () => window.require, 'Monaco loader')
                .then(configureAndLoad, reject);
        });
    },

    loadPrettierStandalone() {
        return this.loadScript(this.prettier.standalone, () => window.prettier, 'Prettier standalone');
    },

    loadPrettierPlugin(name) {
        return this.loadScript(this.prettier.plugin(name), () => window.prettierPlugins?.[name], `Prettier plugin ${name}`);
    },

    loadCropper() {
        return Promise.all([
            this.loadStyle(this.cropper.style, 'Cropper stylesheet'),
            this.loadScript(this.cropper.script, () => window.Cropper, 'Cropper')
        ]).then(([, Cropper]) => Cropper);
    },

    loadVditor() {
        return Promise.all([
            this.loadStyle(this.vditor.style, 'Vditor stylesheet'),
            this.loadScript(this.vditor.script, () => window.Vditor, 'Vditor')
        ]).then(([, Vditor]) => Vditor);
    },

    loadXterm() {
        return Promise.all([
            this.loadStyle(this.xterm.style, 'xterm stylesheet'),
            this.loadScriptWithoutAmd(this.xterm.script, () => window.Terminal || window.Xterm?.Terminal, 'xterm')
        ]).then(([, Terminal]) => Terminal);
    },

    loadXtermFitAddon() {
        return this.loadScriptWithoutAmd(this.xterm.fitAddonScript, () => window.FitAddon?.FitAddon || window.FitAddon, 'xterm fit addon');
    }
};

export { CdnUtils };
