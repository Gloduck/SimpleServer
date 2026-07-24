import {init as initEsmLexer, parse as parseEsm} from 'es-module-lexer';
import {
    getFileName,
    getMimeType,
    getParentFilePath,
    joinFilePath,
    normalizeFilePath,
} from '../file-utils.js';
import {FileSystem, MemoryProvider} from '../file-system/index.js';

const BUILTIN_ALIASES = new Map([
    ['assert', 'node:assert'],
    ['buffer', 'node:buffer'],
    ['fs', 'node:fs'],
    ['fs/promises', 'node:fs/promises'],
    ['http', 'node:http'],
    ['https', 'node:https'],
    ['path', 'node:path'],
    ['querystring', 'node:querystring'],
    ['url', 'node:url'],
    ['util', 'node:util'],
]);

class NodeWorker {
    constructor(options = {}) {
        this.options = this.normalizeOptions(options);
        this.moduleFormats = new Map(this.options.files
            .filter((file) => file.format)
            .map((file) => [file.path, file.format]));
        this.fileSystem = this.createFileSystem(this.options);
        this.network = this.createNetwork(this.options);
        this.moduleCache = new Map();
        this.esmUrlCache = new Map();
        this.esmBuildStack = new Set();
        this.esmValues = new Map();
        this.esmModuleValues = new Map();
        this.esmModulePromises = new Map();
        this.scriptGlobalRestores = new Map();
        this.moduleUrls = [];
        this.runtimeKey = `__simpleServerNodeWorker_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        this.usesDataModuleUrls = Boolean(globalThis.process?.versions?.node);
        this.Buffer = createBufferClass();
        this.process = this.createProcess(this.options);
        this.console = globalThis.console;
        this.builtins = this.createBuiltinModules(this.options);
    }

    normalizeOptions(options) {
        const entryPath = normalizeFilePath(options.entryPath || (isModuleFormat(options.format) ? 'index.mjs' : 'index.js'));
        const files = [];
        if (options.code !== undefined) {
            files.push({
                path: entryPath,
                content: String(options.code),
                mimeType: 'text/javascript',
                format: normalizeOptionalFileFormat(options.format),
            });
        }
        for (const file of options.files || []) {
            const path = normalizeFilePath(file.path);
            if (!path || files.some((candidate) => candidate.path === path)) continue;
            files.push({
                path,
                content: file.content ?? '',
                mimeType: file.mimeType || '',
                format: normalizeOptionalFileFormat(file.format),
            });
        }
        return {
            code: options.code,
            format: options.format,
            entryPath,
            cwd: options.cwd,
            input: options.input,
            env: options.env,
            args: options.args,
            files,
        };
    }

    // NodeWorker 固定使用隔离的内存 Provider，子类只调整 policy 和写入范围。
    createFileSystem(options) {
        return new FileSystem({
            provider: new MemoryProvider(this.createFileSystemConfig(options)),
            policy: this.createFileSystemPolicy(options),
        });
    }

    createFileSystemConfig(options) {
        return {writable: true, files: options.files};
    }

    createFileSystemPolicy() {
        return null;
    }

    createNetwork() {
        const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
        return {
            fetch,
            XMLHttpRequest: globalThis.XMLHttpRequest,
        };
    }

    createProcess(options) {
        const worker = this;
        return {
            argv: ['/usr/bin/node', displayPath(options.entryPath || 'index.cjs'), ...(options.args || []).map(String)],
            env: Object.freeze({...options.env}),
            exitCode: 0,
            cwd() {
                return displayPath(worker.getCwd());
            },
            exit(code = 0) {
                const normalizedCode = Number(code) || 0;
                this.exitCode = normalizedCode;
                throw new NodeProcessExit(normalizedCode);
            },
            nextTick(callback, ...args) {
                queueMicrotask(() => callback(...args));
            },
        };
    }

    createBuiltinModules() {
        const path = createPathModule(() => this.getCwd());
        const builtins = new Map([
            ['node:assert', createAssertModule()],
            ['node:buffer', {Buffer: this.Buffer}],
            ['node:path', path],
            ['node:path/posix', path],
            ['node:querystring', createQueryStringModule()],
            ['node:url', createUrlModule()],
            ['node:util', createUtilModule()],
        ]);
        const fileModules = createNodeFsModules({
            fileSystem: this.fileSystem,
            Buffer: this.Buffer,
            getCwd: () => this.getCwd(),
        });
        builtins.set('node:fs', fileModules.fs);
        builtins.set('node:fs/promises', fileModules.promises);
        if (this.network.fetch) {
            builtins.set('node:http', createHttpModule(this.network.fetch, 'http:', this.Buffer));
            builtins.set('node:https', createHttpModule(this.network.fetch, 'https:', this.Buffer));
        }
        return builtins;
    }

    getCwd() {
        return normalizeFilePath(this.options.cwd || '');
    }

    getBuiltinModule(specifier) {
        const normalized = BUILTIN_ALIASES.get(specifier) || specifier;
        if (this.builtins.has(normalized)) return this.builtins.get(normalized);
        if (normalized.startsWith('node:')) {
            throw nodeWorkerError('UNSUPPORTED_NODE_BUILTIN', `Unsupported Node builtin: ${normalized}`, {specifier: normalized});
        }
        return undefined;
    }

    async run() {
        const entryPath = normalizeFilePath(this.options.entryPath || defaultEntryPath(this.options.format));
        this.process.argv[1] = displayPath(entryPath);
        const source = this.options.code === undefined
            ? this.readModuleText(entryPath)
            : stripShebang(String(this.options.code));
        await this.resolveModuleFormats(entryPath);
        const format = await this.getEntryFormat(entryPath, source);
        const previousGlobals = this.installRuntimeGlobals();

        try {
            if (format !== 'module') await this.prepareCommonJsDependencies(entryPath, source);
            const exports = format === 'module'
                ? await this.executeEsmEntry(entryPath, source)
                : await this.executeCommonJsEntry(entryPath, source, format);
            if (this.process.exitCode !== 0) {
                throw nodeWorkerError('PROCESS_EXIT', `Process exited with code ${this.process.exitCode}`, {
                    exitCode: this.process.exitCode,
                });
            }
            return {exports, exitCode: this.process.exitCode};
        } catch (error) {
            if (error instanceof NodeProcessExit && error.exitCode === 0) {
                return {exports: undefined, exitCode: 0};
            }
            throw error;
        } finally {
            this.restoreScriptGlobals();
            restoreGlobals(previousGlobals);
            this.disposeModuleUrls();
        }
    }

    async getEntryFormat(path, source) {
        const requested = normalizeFormat(this.options.format);
        if (requested !== 'auto') return requested;
        const detectedFormat = this.moduleFormats.get(normalizeFilePath(path));
        if (isJavaScriptFormat(detectedFormat)) return detectedFormat;
        await initEsmLexer;
        return this.detectSourceModuleFormat(source);
    }

    async resolveModuleFormats(entryPath) {
        await initEsmLexer;
        for (const file of this.options.files) {
            if (this.moduleFormats.has(file.path)) continue;
            const directFormat = this.getDirectModuleFormat(file.path);
            if (directFormat) {
                this.moduleFormats.set(file.path, directFormat);
            } else if (file.path === entryPath || isJavaScriptFile(file)) {
                this.moduleFormats.set(file.path, this.detectSourceModuleFormat(String(file.content ?? '')));
            }
        }
    }

    detectSourceModuleFormat(source) {
        const [imports, exports] = parseEsm(source);
        if (imports.length > 0 || exports.length > 0) return 'module';
        return looksLikeCommonJsOrUmd(source) ? 'umd' : 'global';
    }

    getModuleFormat(path) {
        const normalizedPath = normalizeFilePath(path);
        const declaredFormat = this.moduleFormats.get(normalizedPath);
        if (declaredFormat) return declaredFormat;
        return this.getDirectModuleFormat(normalizedPath)
            || (normalizedPath.endsWith('.js') ? 'commonjs' : '');
    }

    getDirectModuleFormat(path) {
        const normalizedPath = normalizeFilePath(path);
        if (normalizedPath.endsWith('.mjs')) return 'module';
        if (normalizedPath.endsWith('.cjs')) return 'commonjs';
        if (normalizedPath.endsWith('.json')) return 'json';
        if (!normalizedPath.endsWith('.js')) return '';
        return this.getPackageModuleFormat(normalizedPath);
    }

    getPackageModuleFormat(path) {
        let directory = getParentFilePath(path);
        while (true) {
            const packagePath = joinFilePath(directory, 'package.json');
            if (this.isFile(packagePath)) {
                try {
                    return JSON.parse(this.readModuleText(packagePath)).type === 'module' ? 'module' : 'commonjs';
                } catch {
                    return 'commonjs';
                }
            }
            if (!directory) break;
            directory = getParentFilePath(directory);
        }
        return '';
    }

    async executeCommonJsEntry(path, source, format = 'commonjs') {
        const module = {id: path, filename: displayPath(path), exports: {}, loaded: false};
        this.moduleCache.set(path, module);
        const completion = this.executeCommonJsSource(path, source, module, format === 'commonjs', format);
        module.loaded = true;
        if (isThenable(completion)) {
            const resolved = await completion;
            return resolved === undefined ? module.exports : resolved;
        }
        if (isThenable(module.exports)) {
            const resolved = await module.exports;
            return resolved === undefined ? module.exports : resolved;
        }
        return module.exports;
    }

    executeCommonJsSource(path, source, module, captureCompletion = false, format = 'commonjs') {
        const require = this.createRequire(path);
        const initialExports = module.exports;
        const globalSnapshot = isGlobalAwareFormat(format) ? captureGlobalDescriptors() : null;
        const parameters = [
            'require',
            'module',
            'exports',
            '__filename',
            '__dirname',
            'process',
            'Buffer',
            'console',
            'fetch',
            'XMLHttpRequest',
            'input',
        ];
        const values = [
            require,
            module,
            module.exports,
            displayPath(path),
            displayPath(getParentFilePath(path)),
            this.process,
            this.Buffer,
            this.console,
            this.network.fetch,
            this.network.XMLHttpRequest,
            this.options.input,
        ];
        const sourceUrl = `\n//# sourceURL=${displayPath(path)}`;
        let completion;
        try {
            if (captureCompletion) {
                const execute = new Function(...parameters, 'source', '"use strict"; return eval(source);');
                completion = execute(...values, `${stripShebang(source)}${sourceUrl}`);
            } else if (format === 'global') {
                completion = (0, eval)(`${stripShebang(source)}${sourceUrl}`);
            } else {
                const strict = format === 'commonjs' ? '"use strict";\n' : '';
                const execute = new Function(...parameters, `${strict}${stripShebang(source)}${sourceUrl}`);
                completion = execute.call(globalThis, ...values);
            }
        } catch (error) {
            if (globalSnapshot) this.collectGlobalModuleExports(globalSnapshot);
            throw error;
        }

        if (globalSnapshot) {
            const globalExports = this.collectGlobalModuleExports(globalSnapshot);
            if (format === 'global' || (format === 'umd' && !hasModuleExports(module, initialExports))) {
                if (globalExports.found) module.exports = globalExports.value;
            }
        }
        return completion;
    }

    async prepareCommonJsDependencies(path, source, visited = new Set()) {
        const normalizedPath = normalizeFilePath(path);
        const cacheKey = `commonjs:${normalizedPath}`;
        if (visited.has(cacheKey)) return;
        visited.add(cacheKey);

        for (const specifier of findStaticRequireSpecifiers(source)) {
            const builtin = BUILTIN_ALIASES.get(specifier) || specifier;
            if (this.builtins.has(builtin) || builtin.startsWith('node:')) continue;

            let dependencyPath;
            try {
                dependencyPath = this.resolveModule(specifier, normalizedPath, 'require');
            } catch (error) {
                if (error?.code === 'MODULE_NOT_FOUND') continue;
                throw error;
            }
            const format = this.getModuleFormat(dependencyPath);
            if (format === 'module') {
                await this.prepareEsmDependencies(dependencyPath, this.readModuleText(dependencyPath), visited);
                await this.loadEsmModuleValue(dependencyPath);
            } else if (isCommonJsLikeFormat(format)) {
                await this.prepareCommonJsDependencies(dependencyPath, this.readModuleText(dependencyPath), visited);
            }
        }
    }

    async prepareEsmDependencies(path, source, visited = new Set()) {
        await initEsmLexer;
        const normalizedPath = normalizeFilePath(path);
        const cacheKey = `module:${normalizedPath}`;
        if (visited.has(cacheKey)) return;
        visited.add(cacheKey);

        const [imports] = parseEsm(source);
        for (const item of imports) {
            if (!item.n) continue;
            const builtin = BUILTIN_ALIASES.get(item.n) || item.n;
            if (this.builtins.has(builtin) || builtin.startsWith('node:')) continue;

            const dependencyPath = this.resolveModule(item.n, normalizedPath, 'import');
            const format = this.getModuleFormat(dependencyPath);
            if (format === 'module') {
                await this.prepareEsmDependencies(dependencyPath, this.readModuleText(dependencyPath), visited);
            } else if (isCommonJsLikeFormat(format)) {
                await this.prepareCommonJsDependencies(dependencyPath, this.readModuleText(dependencyPath), visited);
            }
        }
    }

    async loadEsmModuleValue(path) {
        const normalizedPath = normalizeFilePath(path);
        if (this.esmModuleValues.has(normalizedPath)) return this.esmModuleValues.get(normalizedPath);
        if (!this.esmModulePromises.has(normalizedPath)) {
            this.esmModulePromises.set(normalizedPath, (async () => {
                const url = await this.buildEsmModuleUrl(normalizedPath);
                const value = await import(url);
                this.esmModuleValues.set(normalizedPath, value);
                return value;
            })());
        }
        return this.esmModulePromises.get(normalizedPath);
    }

    createRequire(parentPath) {
        const require = (specifier) => {
            const builtin = this.getBuiltinModule(String(specifier));
            if (builtin !== undefined) return builtin;
            const path = this.resolveModule(String(specifier), parentPath, 'require');
            return this.loadCommonJsModule(path);
        };
        require.resolve = (specifier) => {
            const builtin = BUILTIN_ALIASES.get(String(specifier)) || String(specifier);
            if (this.builtins.has(builtin)) return builtin;
            return displayPath(this.resolveModule(String(specifier), parentPath, 'require'));
        };
        require.cache = this.moduleCache;
        return require;
    }

    loadCommonJsModule(path) {
        const normalizedPath = normalizeFilePath(path);
        const cached = this.moduleCache.get(normalizedPath);
        if (cached) return cached.exports;

        const format = this.getModuleFormat(normalizedPath);
        if (format === 'module') {
            if (!this.esmModuleValues.has(normalizedPath)) {
                throw nodeWorkerError('ERR_REQUIRE_ESM', `require() cannot dynamically load an ES module: ${displayPath(normalizedPath)}`, {
                    path: displayPath(normalizedPath),
                });
            }
            const exports = esmNamespaceForRequire(this.esmModuleValues.get(normalizedPath));
            this.moduleCache.set(normalizedPath, {
                id: normalizedPath,
                filename: displayPath(normalizedPath),
                exports,
                loaded: true,
            });
            return exports;
        }
        if (format === 'json') {
            const module = {id: normalizedPath, filename: displayPath(normalizedPath), exports: {}, loaded: false};
            this.moduleCache.set(normalizedPath, module);
            module.exports = JSON.parse(this.readModuleText(normalizedPath));
            module.loaded = true;
            return module.exports;
        }

        const module = {id: normalizedPath, filename: displayPath(normalizedPath), exports: {}, loaded: false};
        this.moduleCache.set(normalizedPath, module);
        try {
            this.executeCommonJsSource(normalizedPath, this.readModuleText(normalizedPath), module, false, format);
            module.loaded = true;
            return module.exports;
        } catch (error) {
            this.moduleCache.delete(normalizedPath);
            throw error;
        }
    }

    async executeEsmEntry(path, source) {
        await initEsmLexer;
        const url = await this.buildEsmModuleUrl(path, source);
        return import(url);
    }

    async buildEsmModuleUrl(path, sourceOverride) {
        const normalizedPath = normalizeFilePath(path);
        if (this.esmUrlCache.has(normalizedPath)) return this.esmUrlCache.get(normalizedPath);
        if (this.esmBuildStack.has(normalizedPath)) {
            throw nodeWorkerError('UNSUPPORTED_ESM_CYCLE', `Circular ESM imports are not supported: ${displayPath(normalizedPath)}`, {
                path: displayPath(normalizedPath),
            });
        }

        this.esmBuildStack.add(normalizedPath);
        try {
            const source = sourceOverride === undefined ? this.readModuleText(normalizedPath) : stripShebang(sourceOverride);
            const [imports] = parseEsm(source);
            const replacements = [];
            for (const item of imports) {
                if (!item.n) {
                    throw nodeWorkerError('DYNAMIC_MODULE_NOT_PRELOADED', `Dynamic import must use a string literal: ${displayPath(normalizedPath)}`, {
                        path: displayPath(normalizedPath),
                    });
                }
                replacements.push({
                    start: item.s,
                    end: item.e,
                    value: await this.resolveEsmUrl(item.n, normalizedPath),
                });
            }
            const transformed = applyReplacements(source, replacements);
            const url = this.createModuleUrl(`${transformed}\n//# sourceURL=${displayPath(normalizedPath)}`);
            this.esmUrlCache.set(normalizedPath, url);
            return url;
        } finally {
            this.esmBuildStack.delete(normalizedPath);
        }
    }

    async resolveEsmUrl(specifier, parentPath) {
        const builtin = this.getBuiltinModule(specifier);
        if (builtin !== undefined) return this.createValueModuleUrl(`builtin:${specifier}`, builtin);

        const path = this.resolveModule(specifier, parentPath, 'import');
        const format = this.getModuleFormat(path);
        if (format === 'module') return this.buildEsmModuleUrl(path);
        if (format === 'json') return this.createValueModuleUrl(path, JSON.parse(this.readModuleText(path)));
        return this.createValueModuleUrl(path, this.loadCommonJsModule(path));
    }

    createValueModuleUrl(key, value) {
        const cacheKey = `value:${key}`;
        if (this.esmUrlCache.has(cacheKey)) return this.esmUrlCache.get(cacheKey);
        const id = `value-${this.esmValues.size}`;
        this.esmValues.set(id, value);
        const names = value && (typeof value === 'object' || typeof value === 'function')
            ? Object.keys(value).filter(isValidIdentifier)
            : [];
        const exports = names.map((name) => `export const ${name} = value[${JSON.stringify(name)}];`).join('\n');
        const source = [
            `const value = globalThis[${JSON.stringify(this.runtimeKey)}].values.get(${JSON.stringify(id)});`,
            'export default value;',
            exports,
        ].join('\n');
        const url = this.createModuleUrl(source);
        this.esmUrlCache.set(cacheKey, url);
        return url;
    }

    createModuleUrl(source) {
        if (this.usesDataModuleUrls) return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
        const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
        this.moduleUrls.push(url);
        return url;
    }

    disposeModuleUrls() {
        for (const url of this.moduleUrls) URL.revokeObjectURL(url);
        this.moduleUrls.length = 0;
    }

    installRuntimeGlobals() {
        const values = {
            [this.runtimeKey]: {values: this.esmValues},
            process: this.process,
            Buffer: this.Buffer,
            console: this.console,
            fetch: this.network.fetch,
            XMLHttpRequest: this.network.XMLHttpRequest,
            input: this.options.input,
        };
        const previous = [];
        for (const [name, value] of Object.entries(values)) {
            previous.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]);
            Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});
        }
        return previous;
    }

    collectGlobalModuleExports(before) {
        const after = captureGlobalDescriptors();
        const changed = [];
        const names = new Set([...before.keys(), ...after.keys()]);
        for (const name of names) {
            const previous = before.get(name);
            const current = after.get(name);
            if (samePropertyDescriptor(previous, current)) continue;
            if (!this.scriptGlobalRestores.has(name)) this.scriptGlobalRestores.set(name, previous);
            if (current) changed.push([name, readGlobalProperty(name, current)]);
        }
        if (changed.length === 1) return {found: true, value: changed[0][1]};
        if (changed.length > 1) return {found: true, value: Object.fromEntries(changed)};
        return {found: false, value: undefined};
    }

    restoreScriptGlobals() {
        for (const [name, descriptor] of [...this.scriptGlobalRestores.entries()].reverse()) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
        this.scriptGlobalRestores.clear();
    }

    resolveModule(specifier, parentPath, mode) {
        const candidates = [];
        if (specifier.startsWith('/') || specifier.startsWith('./') || specifier.startsWith('../')) {
            const base = specifier.startsWith('/') ? '' : getParentFilePath(parentPath);
            candidates.push(resolveLogicalPath(specifier, base));
        } else {
            let directory = getParentFilePath(parentPath);
            while (true) {
                candidates.push(joinFilePath(directory, 'node_modules', specifier));
                if (!directory) break;
                directory = getParentFilePath(directory);
            }
        }

        for (const candidate of candidates) {
            const resolved = this.resolveModuleCandidate(candidate, mode, new Set());
            if (resolved) return resolved;
        }
        throw nodeWorkerError('MODULE_NOT_FOUND', `Cannot find module '${specifier}' from ${displayPath(parentPath)}`, {
            specifier,
            parent: displayPath(parentPath),
        });
    }

    resolveModuleCandidate(path, mode, visited) {
        const normalizedPath = normalizeFilePath(path);
        if (visited.has(normalizedPath)) return null;
        visited.add(normalizedPath);

        if (this.isFile(normalizedPath)) return normalizedPath;
        for (const extension of mode === 'import' ? ['.mjs', '.js', '.cjs', '.json'] : ['.js', '.cjs', '.json', '.mjs']) {
            if (this.isFile(`${normalizedPath}${extension}`)) return `${normalizedPath}${extension}`;
        }
        if (!this.isDirectory(normalizedPath)) return null;

        const packagePath = joinFilePath(normalizedPath, 'package.json');
        if (this.isFile(packagePath)) {
            try {
                const manifest = JSON.parse(this.readModuleText(packagePath));
                const target = packageEntry(manifest, mode);
                if (target) {
                    const resolved = this.resolveModuleCandidate(joinFilePath(normalizedPath, target), mode, visited);
                    if (resolved) return resolved;
                }
            } catch (error) {
                if (error?.code) throw error;
            }
        }
        for (const name of mode === 'import'
            ? ['index.mjs', 'index.js', 'index.cjs', 'index.json']
            : ['index.js', 'index.cjs', 'index.json', 'index.mjs']) {
            const candidate = joinFilePath(normalizedPath, name);
            if (this.isFile(candidate)) return candidate;
        }
        return null;
    }

    isFile(path) {
        try {
            return this.fileSystem?.statSync(path).kind === 'file';
        } catch (error) {
            if (error?.code === 'FILE_NOT_FOUND') return false;
            throw error;
        }
    }

    isDirectory(path) {
        try {
            return this.fileSystem?.statSync(path).kind === 'directory';
        } catch (error) {
            if (error?.code === 'FILE_NOT_FOUND') return false;
            throw error;
        }
    }

    readModuleText(path) {
        return this.fileSystem.readTextSync(path);
    }
}

function createNodeFsModules({fileSystem, Buffer, getCwd}) {
    const promises = createNodeFsPromisesModule(fileSystem, Buffer, getCwd);
    return {
        fs: createNodeFsModule(fileSystem, Buffer, promises, getCwd),
        promises,
    };
}

function createNodeFsModule(fileSystem, Buffer, promises, getCwd) {
    return {
        promises,
        readFileSync(path, options) {
            const normalized = resolveNodeFsPath(path, getCwd());
            const encoding = getNodeFsEncoding(options);
            const bytes = fileSystem.readBytesSync(normalized);
            return encoding ? new TextDecoder(encoding).decode(bytes) : Buffer.from(bytes);
        },
        writeFileSync(path, value, options) {
            const normalized = resolveNodeFsPath(path, getCwd());
            fileSystem.writeBytesSync(normalized, toNodeFsBytes(value, getNodeFsEncoding(options)), {
                createParents: true,
                mimeType: typeof options === 'object' && options.mimeType ? options.mimeType : getMimeType(normalized),
            });
        },
        statSync(path) {
            return createNodeFsStats(fileSystem.statSync(resolveNodeFsPath(path, getCwd())));
        },
        existsSync(path) {
            try {
                fileSystem.statSync(resolveNodeFsPath(path, getCwd()));
                return true;
            } catch (error) {
                if (error?.code === 'FILE_NOT_FOUND') return false;
                throw error;
            }
        },
        readdirSync(path = '.', options) {
            return formatNodeFsDirectoryEntries(fileSystem.listSync(resolveNodeFsPath(path, getCwd())), options);
        },
    };
}

function createNodeFsPromisesModule(fileSystem, Buffer, getCwd) {
    return {
        async readFile(path, options) {
            const normalized = resolveNodeFsPath(path, getCwd());
            const encoding = getNodeFsEncoding(options);
            const blob = await fileSystem.readBlob(normalized);
            return encoding ? new TextDecoder(encoding).decode(await blob.arrayBuffer()) : Buffer.from(await blob.arrayBuffer());
        },
        async writeFile(path, value, options) {
            const normalized = resolveNodeFsPath(path, getCwd());
            return fileSystem.writeBlob(normalized, toNodeFsBytes(value, getNodeFsEncoding(options)), {
                createParents: true,
                mimeType: typeof options === 'object' && options.mimeType ? options.mimeType : getMimeType(normalized),
            });
        },
        async stat(path) {
            return createNodeFsStats(await fileSystem.stat(resolveNodeFsPath(path, getCwd())));
        },
        async readdir(path = '.', options) {
            return formatNodeFsDirectoryEntries(await fileSystem.list(resolveNodeFsPath(path, getCwd())), options);
        },
        async mkdir(path, options = {}) {
            return fileSystem.createDirectory(resolveNodeFsPath(path, getCwd()), {recursive: options?.recursive === true});
        },
        async unlink(path) {
            return fileSystem.unlink(resolveNodeFsPath(path, getCwd()));
        },
        async rm(path, options = {}) {
            return fileSystem.remove(resolveNodeFsPath(path, getCwd()), {
                recursive: options?.recursive === true,
                force: options?.force === true,
            });
        },
    };
}

function createNodeFsStats(entry) {
    return Object.freeze({
        size: entry.size,
        isFile: () => entry.kind === 'file',
        isDirectory: () => entry.kind === 'directory',
    });
}

function formatNodeFsDirectoryEntries(entries, options) {
    if (options?.withFileTypes !== true) return entries.map((entry) => entry.name);
    return entries.map((entry) => Object.freeze({
        name: entry.name,
        isFile: () => entry.kind === 'file',
        isDirectory: () => entry.kind === 'directory',
    }));
}

function resolveNodeFsPath(path, cwd) {
    if (path instanceof URL) {
        if (path.protocol !== 'file:') throw new TypeError('File URL must use file: protocol');
        path = decodeURIComponent(path.pathname);
    }
    const value = String(path || '');
    if (value.includes('\0')) throw nodeFsError('INVALID_FILE_PATH', `Invalid file path: ${value}`, {path: value});
    if (value.startsWith('/')) return normalizeNodeFsPath(value);
    return normalizeNodeFsPath(`${cwd}/${value}`);
}

function normalizeNodeFsPath(path) {
    const values = [];
    for (const part of String(path || '').replace(/\\/g, '/').split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (!values.length) throw nodeFsError('INVALID_FILE_PATH', `File path escapes the root: ${path}`, {path});
            values.pop();
        } else {
            values.push(part);
        }
    }
    return values.join('/');
}

function getNodeFsEncoding(options) {
    if (typeof options === 'string') return normalizeNodeFsEncoding(options);
    return options?.encoding ? normalizeNodeFsEncoding(options.encoding) : '';
}

function normalizeNodeFsEncoding(value) {
    const encoding = String(value || '').toLowerCase();
    if (encoding === 'utf8' || encoding === 'utf-8') return 'utf-8';
    throw nodeFsError('UNSUPPORTED_ENCODING', `Unsupported encoding: ${value}`, {encoding: value});
}

function toNodeFsBytes(value, encoding) {
    if (typeof value === 'string') return new TextEncoder(encoding || 'utf-8').encode(value);
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    throw new TypeError('File data must be a string, ArrayBuffer, or typed array');
}

function nodeFsError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

class NodeProcessExit extends Error {
    constructor(exitCode) {
        super(`Process exited with code ${exitCode}`);
        this.name = 'NodeProcessExit';
        this.exitCode = exitCode;
    }
}

function defaultEntryPath(format) {
    return normalizeFormat(format) === 'module' ? 'index.mjs' : 'index.cjs';
}

function isModuleFormat(format) {
    return ['esm', 'mjs', 'module'].includes(String(format || '').trim().toLowerCase());
}

function normalizeFormat(format) {
    const value = String(format || 'auto').trim().toLowerCase();
    if (value === 'esm' || value === 'mjs' || value === 'module') return 'module';
    if (value === 'cjs' || value === 'commonjs') return 'commonjs';
    if (value === 'umd') return 'umd';
    if (value === 'global' || value === 'iife' || value === 'script') return 'global';
    if (value === 'auto') return 'auto';
    throw nodeWorkerError('INVALID_MODULE_FORMAT', `Unsupported module format: ${format}`, {format});
}

function normalizeOptionalFileFormat(format) {
    if (format === undefined || format === null || format === '') return '';
    const value = String(format).trim().toLowerCase();
    if (value === 'json') return 'json';
    const normalized = normalizeFormat(value);
    return normalized === 'auto' ? '' : normalized;
}

function isJavaScriptFormat(format) {
    return format === 'module' || isCommonJsLikeFormat(format);
}

function isCommonJsLikeFormat(format) {
    return format === 'commonjs' || format === 'umd' || format === 'global';
}

function isGlobalAwareFormat(format) {
    return format === 'umd' || format === 'global';
}

function isJavaScriptFile(file) {
    return /\.(?:cjs|js|mjs)$/i.test(file.path)
        || /(?:java|ecma)script/i.test(String(file.mimeType || ''));
}

function packageEntry(manifest, mode) {
    const exports = manifest?.exports;
    if (typeof exports === 'string') return exports;
    if (exports && typeof exports === 'object') {
        const root = exports['.'] || exports;
        if (typeof root === 'string') return root;
        if (root && typeof root === 'object') {
            const value = root[mode] || root.default || root.require || root.import;
            if (typeof value === 'string') return value;
        }
    }
    return typeof manifest?.main === 'string' ? manifest.main : '';
}

function applyReplacements(source, replacements) {
    let result = source;
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
        result = `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`;
    }
    return result;
}

function restoreGlobals(previous) {
    for (const [name, descriptor] of previous.reverse()) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    }
}

function captureGlobalDescriptors() {
    return new Map(Object.entries(Object.getOwnPropertyDescriptors(globalThis)));
}

function samePropertyDescriptor(left, right) {
    if (left === right) return true;
    if (!left || !right) return false;
    return left.configurable === right.configurable
        && left.enumerable === right.enumerable
        && left.writable === right.writable
        && Object.is(left.value, right.value)
        && left.get === right.get
        && left.set === right.set;
}

function readGlobalProperty(name, descriptor) {
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) return descriptor.value;
    try {
        return globalThis[name];
    } catch {
        return undefined;
    }
}

function hasModuleExports(module, initialExports) {
    if (module.exports !== initialExports) return true;
    return initialExports != null
        && (typeof initialExports === 'object' || typeof initialExports === 'function')
        && Object.keys(initialExports).length > 0;
}

function looksLikeCommonJsOrUmd(source) {
    return /\bmodule\s*\.\s*exports\b|\bexports\s*(?:\.|\[)|\brequire\s*\(|\btypeof\s+(?:module|exports)\b|\bdefine\s*\.\s*amd\b/.test(String(source || ''));
}

function findStaticRequireSpecifiers(source) {
    const result = [];
    const pattern = /\brequire\s*\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*\)/g;
    for (const match of String(source || '').matchAll(pattern)) {
        result.push(decodeStaticModuleSpecifier(match[1] ?? match[2] ?? ''));
    }
    return result;
}

function decodeStaticModuleSpecifier(value) {
    return String(value).replace(/\\([\\'"bfnrtv])/g, (match, escaped) => ({
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        v: '\v',
    })[escaped] ?? escaped);
}

function esmNamespaceForRequire(namespace) {
    const keys = namespace && typeof namespace === 'object' ? Object.keys(namespace) : [];
    return keys.length === 1 && keys[0] === 'default' ? namespace.default : namespace;
}

function resolveLogicalPath(path, base = '') {
    const value = String(path || '');
    return value.startsWith('/') ? normalizeFilePath(value) : joinFilePath(base, value);
}

function displayPath(path) {
    const normalized = normalizeFilePath(path);
    return normalized ? `/${normalized}` : '/';
}

function stripShebang(source) {
    return String(source || '').replace(/^#![^\n]*(?:\n|$)/, '');
}

function isThenable(value) {
    return value != null && typeof value.then === 'function';
}

function isValidIdentifier(value) {
    return /^[A-Za-z_$][\w$]*$/.test(value) && value !== 'default';
}

function nodeWorkerError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function createBufferClass() {
    return class Buffer extends Uint8Array {
        static from(value, encoding = 'utf8') {
            if (typeof value === 'string') return new this(decodeString(value, encoding));
            if (value instanceof ArrayBuffer) return new this(new Uint8Array(value.slice(0)));
            if (ArrayBuffer.isView(value)) return new this(new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)));
            if (Array.isArray(value)) return new this(value);
            throw new TypeError('Unsupported Buffer input');
        }

        static alloc(size, fill = 0) {
            const buffer = new this(Number(size) || 0);
            buffer.fill(fill);
            return buffer;
        }

        static concat(values, totalLength) {
            const length = totalLength ?? values.reduce((total, value) => total + value.byteLength, 0);
            const result = new this(length);
            let offset = 0;
            for (const value of values) {
                const bytes = this.from(value);
                result.set(bytes.subarray(0, Math.max(0, length - offset)), offset);
                offset += bytes.byteLength;
                if (offset >= length) break;
            }
            return result;
        }

        static isBuffer(value) {
            return value instanceof this;
        }

        toString(encoding = 'utf8', start = 0, end = this.length) {
            return encodeBytes(this.subarray(start, end), encoding);
        }
    };
}

function decodeString(value, encoding) {
    const normalized = normalizeEncoding(encoding);
    if (normalized === 'base64') {
        const binary = atob(value);
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }
    if (normalized === 'hex') {
        const pairs = String(value).match(/[\da-f]{2}/gi) || [];
        return Uint8Array.from(pairs, (pair) => Number.parseInt(pair, 16));
    }
    return new TextEncoder().encode(value);
}

function encodeBytes(value, encoding) {
    const normalized = normalizeEncoding(encoding);
    if (normalized === 'base64') {
        let binary = '';
        for (const byte of value) binary += String.fromCharCode(byte);
        return btoa(binary);
    }
    if (normalized === 'hex') return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return new TextDecoder(normalized).decode(value);
}

function normalizeEncoding(encoding) {
    const value = String(encoding || 'utf8').toLowerCase().replace(/[-_]/g, '');
    if (value === 'utf8' || value === 'utf') return 'utf-8';
    if (value === 'base64' || value === 'hex') return value;
    return encoding;
}

function createPathModule(getCwd) {
    const api = {
        sep: '/',
        delimiter: ':',
        normalize(path) {
            return normalizePosixPath(path);
        },
        join(...paths) {
            return normalizePosixPath(paths.filter(Boolean).join('/'));
        },
        resolve(...paths) {
            let result = displayPath(getCwd());
            for (const path of paths) {
                result = String(path).startsWith('/') ? String(path) : `${result}/${path}`;
            }
            return normalizePosixPath(result, true);
        },
        dirname(path) {
            const value = normalizePosixPath(path);
            const absolute = value.startsWith('/');
            const parts = value.split('/').filter(Boolean);
            parts.pop();
            if (!parts.length) return absolute ? '/' : '.';
            return `${absolute ? '/' : ''}${parts.join('/')}`;
        },
        basename(path, suffix = '') {
            const name = getFileName(path);
            return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
        },
        extname(path) {
            const name = getFileName(path);
            const index = name.lastIndexOf('.');
            return index <= 0 ? '' : name.slice(index);
        },
        isAbsolute(path) {
            return String(path || '').startsWith('/');
        },
    };
    api.posix = api;
    return api;
}

function normalizePosixPath(path, forceAbsolute = false) {
    const value = String(path || '');
    const absolute = forceAbsolute || value.startsWith('/');
    const parts = [];
    for (const part of value.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (parts.length && parts.at(-1) !== '..') parts.pop();
            else if (!absolute) parts.push('..');
        } else {
            parts.push(part);
        }
    }
    const result = parts.join('/');
    return absolute ? `/${result}` || '/' : result || '.';
}

function createHttpModule(fetch, protocol, Buffer) {
    const request = (input, options, callback) => {
        let requestOptions = options || {};
        if (typeof options === 'function') {
            callback = options;
            requestOptions = {};
        }
        if (input && typeof input === 'object' && !(input instanceof URL)) {
            requestOptions = {...input, ...requestOptions};
        }
        const target = createHttpTarget(protocol, input, requestOptions);
        const listeners = new Map();
        const chunks = [];
        let ended = false;
        const clientRequest = {
            write(chunk) {
                if (ended) throw new Error('write after end');
                chunks.push(Buffer.from(chunk));
                return true;
            },
            end(chunk) {
                if (chunk !== undefined) this.write(chunk);
                if (ended) return this;
                ended = true;
                void sendHttpRequest(fetch, target, requestOptions, chunks, callback, listeners, Buffer);
                return this;
            },
            on(name, listener) {
                listeners.set(name, listener);
                return this;
            },
            once(name, listener) {
                return this.on(name, listener);
            },
            setHeader() {
                return this;
            },
            abort() {
                return this;
            },
        };
        return clientRequest;
    };
    return {
        request,
        get(input, options, callback) {
            const result = request(input, options, callback);
            result.end();
            return result;
        },
    };
}

function createHttpTarget(protocol, input, options) {
    if (typeof input === 'string' || input instanceof URL) {
        const url = new URL(String(input));
        if (url.protocol !== protocol) throw nodeWorkerError('ERR_INVALID_PROTOCOL', `Expected ${protocol} but received ${url.protocol}`);
        return url;
    }
    const source = input || options;
    const hostname = source.hostname || source.host || 'localhost';
    const port = source.port ? `:${source.port}` : '';
    return new URL(`${protocol}//${hostname}${port}${source.path || source.pathname || '/'}`);
}

async function sendHttpRequest(fetch, target, options, chunks, callback, requestListeners, Buffer) {
    try {
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const response = await fetch(target, {
            method: options.method || (body ? 'POST' : 'GET'),
            headers: options.headers,
            body,
            signal: options.signal,
        });
        const bytes = Buffer.from(await response.arrayBuffer());
        const listeners = new Map();
        const incoming = {
            statusCode: response.status,
            statusMessage: response.statusText,
            headers: Object.fromEntries(response.headers),
            on(name, listener) {
                listeners.set(name, listener);
                if (name === 'data') queueMicrotask(() => listener(bytes));
                if (name === 'end') queueMicrotask(listener);
                return this;
            },
            once(name, listener) {
                return this.on(name, listener);
            },
        };
        callback?.(incoming);
    } catch (error) {
        requestListeners.get('error')?.(error);
    }
}

function createUrlModule() {
    return {
        URL,
        URLSearchParams,
        pathToFileURL(path) {
            return new URL(`file://${displayPath(path)}`);
        },
        fileURLToPath(value) {
            const url = value instanceof URL ? value : new URL(value);
            if (url.protocol !== 'file:') throw new TypeError('URL must use file: protocol');
            return decodeURIComponent(url.pathname);
        },
    };
}

function createQueryStringModule() {
    return {
        parse(value) {
            return Object.fromEntries(new URLSearchParams(String(value || '')));
        },
        stringify(value) {
            return new URLSearchParams(value || {}).toString();
        },
    };
}

function createUtilModule() {
    return {
        types: {},
        format(...values) {
            return values.map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join(' ');
        },
        promisify(fn) {
            return (...args) => new Promise((resolve, reject) => {
                fn(...args, (error, value) => error ? reject(error) : resolve(value));
            });
        },
    };
}

function createAssertModule() {
    const assert = (value, message = 'Assertion failed') => {
        if (!value) throw new Error(message);
    };
    assert.ok = assert;
    assert.equal = (actual, expected, message) => assert(actual == expected, message || `${actual} != ${expected}`);
    assert.strictEqual = (actual, expected, message) => assert(actual === expected, message || `${actual} !== ${expected}`);
    assert.deepStrictEqual = (actual, expected, message) => assert(
        JSON.stringify(actual) === JSON.stringify(expected),
        message || 'Values are not deeply equal',
    );
    return assert;
}

export {NodeWorker, nodeWorkerError};
