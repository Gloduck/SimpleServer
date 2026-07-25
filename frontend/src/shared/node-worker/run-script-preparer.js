import {
    getParentFilePath,
    joinFilePath,
    normalizeFilePath,
} from '../file-utils.js';
import {dependencyStore} from './dependency-store.js';
import {escapeModuleSpecifier, scanJavaScriptModuleSource} from './module-source-scanner.js';
import {
    PackageDownloader,
    satisfiesVersion,
} from './package-downloader.js';

const BUILTIN_MODULES = new Set([
    'assert',
    'assert/strict',
    'buffer',
    'crypto',
    'events',
    'fs',
    'fs/promises',
    'http',
    'https',
    'path',
    'path/posix',
    'punycode',
    'querystring',
    'process',
    'stream',
    'stream/promises',
    'stream/web',
    'string_decoder',
    'timers',
    'timers/promises',
    'tty',
    'url',
    'util',
    'util/types',
    'zlib',
]);
const DEFAULT_LIMITS = Object.freeze({
    maxModuleCount: 1000,
    maxDependencyDepth: 100,
    maxFileCount: 20_000,
    maxSourceBytes: 20 * 1024 * 1024,
    maxTotalBytes: 100 * 1024 * 1024,
    maxDownloadBytes: 20 * 1024 * 1024,
    maxDownloadTotalBytes: 50 * 1024 * 1024,
    maxPackageFileCount: 10_000,
});
const REMOTE_ROOT = '__runscript__/remote';
const PACKAGE_ROOT = '__runscript__/packages';

function createRunScriptPreparer(config = {}) {
    const {
        workspace = null,
        fetch: configuredFetch = globalThis.fetch,
        store = dependencyStore,
        registryUrl,
        packageDownloader: configuredPackageDownloader = null,
        limits: configuredLimits = {},
        signal: defaultSignal,
    } = config;
    const fetch = typeof configuredFetch === 'function' ? configuredFetch.bind(globalThis) : null;
    const limits = {...DEFAULT_LIMITS, ...configuredLimits};
    const packageDownloader = configuredPackageDownloader || (fetch
        ? new PackageDownloader({fetch, store, registryUrl, limits: configuredLimits, signal: defaultSignal})
        : null);

    async function prepare({
        code,
        entryFile,
        format = 'auto',
        resolveFrom = '',
        cwd = '',
        input,
        env,
        args,
        dependencies = [],
        inputFiles = [],
        signal,
    } = {}) {
        if (code !== undefined && entryFile) throw prepareError('INVALID_ENTRY', 'code and entryFile are mutually exclusive');
        if (code === undefined && !entryFile) throw prepareError('ENTRY_REQUIRED', 'code or entryFile is required');

        const context = createContext(signal || defaultSignal, resolveFrom, dependencies);
        throwIfAborted(context.signal);
        await loadInputFiles(context, inputFiles);

        let entryPath;
        let entryRecord;
        if (code !== undefined) {
            entryPath = joinFilePath(context.resolveFrom, '.runscript', defaultEntryName(format));
            if (context.files.has(entryPath)) {
                throw prepareError('RESERVED_FILE_PATH', `Input file conflicts with the generated entry: ${entryPath}`, {path: entryPath});
            }
            entryRecord = createModuleRecord({
                id: `inline:${entryPath}`,
                path: entryPath,
                source: String(code),
                origin: 'inline',
                depth: 0,
                inline: true,
                requestedFormat: format,
            });
            context.modules.set(entryRecord.id, entryRecord);
            context.modulePaths.set(entryPath, entryRecord);
            const entrySize = getContentSize(entryRecord.source);
            context.inlineBytes = entrySize;
            context.sourceBytes += entrySize;
            context.totalBytes += entrySize;
            assertPreparedSizes(context);
        } else {
            entryPath = normalizeWorkspacePath(entryFile);
            if (isReservedRuntimePath(entryPath)) throw prepareError('RESERVED_FILE_PATH', `Reserved runtime path: ${entryPath}`, {path: entryPath});
            entryRecord = await getWorkspaceModule(context, entryPath, 0);
            entryRecord.requestedFormat = format;
        }

        await prepareModule(context, entryRecord);
        if (entryRecord.inline) {
            const finalEntrySize = getContentSize(entryRecord.source);
            const difference = finalEntrySize - context.inlineBytes;
            context.inlineBytes = finalEntrySize;
            context.sourceBytes += difference;
            context.totalBytes += difference;
            assertPreparedSizes(context);
        }
        const preparedCode = entryRecord.inline ? entryRecord.source : undefined;
        return {
            code: preparedCode,
            format,
            entryPath,
            cwd: normalizeFilePath(cwd || ''),
            input,
            env,
            args,
            files: [...context.files.values()]
                .filter((file) => !(entryRecord.inline && file.path === entryPath))
                .map(({sourceModule, ...file}) => file)
                .sort((left, right) => left.path.localeCompare(right.path)),
        };
    }

    function createContext(signal, resolveFrom, dependencies) {
        return {
            signal,
            resolveFrom: normalizeWorkspacePath(resolveFrom || ''),
            dependencies: normalizeDeclaredDependencies(dependencies),
            files: new Map(),
            modules: new Map(),
            modulePaths: new Map(),
            remoteModules: new Map(),
            localPackages: new Map(),
            packageMounts: new Map(),
            moduleCount: 0,
            totalBytes: 0,
            sourceBytes: 0,
            downloadBytes: 0,
            remoteSequence: 0,
            inlineBytes: 0,
        };
    }

    async function loadInputFiles(context, inputFiles) {
        for (const inputFile of inputFiles || []) {
            throwIfAborted(context.signal);
            const path = normalizeWorkspacePath(inputFile?.path);
            if (!path) throw prepareError('INVALID_FILE_PATH', 'Input file path is required', {path});
            if (isReservedRuntimePath(path)) throw prepareError('RESERVED_FILE_PATH', `Reserved runtime path: ${path}`, {path});
            let content = inputFile.content;
            if (content === undefined) {
                requireWorkspace(path);
                content = inputFile.type === 'bytes'
                    ? await readWorkspaceBytes(path, inputFile.view || 'effective', context.signal)
                    : await workspace.readText(path, {view: inputFile.view || 'effective', signal: context.signal});
            }
            if (typeof Blob !== 'undefined' && content instanceof Blob) {
                content = new Uint8Array(await content.arrayBuffer());
            }
            addFile(context, {
                path,
                content,
                ...(inputFile.mimeType ? {mimeType: inputFile.mimeType} : {}),
            });
        }
    }

    function createModuleRecord(values) {
        return {...values, state: 'pending'};
    }

    async function prepareModule(context, module) {
        if (module.state === 'done' || module.state === 'processing') return module;
        assertDepth(module.depth);
        module.state = 'processing';
        context.moduleCount += 1;
        if (context.moduleCount > limits.maxModuleCount) {
            throw prepareError('MODULE_COUNT_EXCEEDED', 'Too many JavaScript modules', {
                size: context.moduleCount,
                maxSize: limits.maxModuleCount,
            });
        }

        if (module.path.endsWith('.json')) {
            addPreparedModule(context, module);
            module.state = 'done';
            return module;
        }

        const packageManifest = module.origin !== 'remote' && module.path.endsWith('.js')
            ? await includePackageScopeManifest(context, module.path)
            : null;

        const analysis = await scanJavaScriptModuleSource(module.source);
        const effectiveFormat = getEffectiveModuleFormat(module, packageManifest, analysis.format);
        const dependencies = effectiveFormat === 'module'
            ? analysis.esmSpecifiers
            : mergeModuleSpecifiers(
                analysis.commonJsSpecifiers,
                analysis.esmSpecifiers.filter((dependency) => dependency.kind === 'dynamic-import'),
            );
        const replacements = [];
        for (const dependency of dependencies) {
            throwIfAborted(context.signal);
            if (!dependency.literal || !dependency.specifier) continue;
            if (effectiveFormat !== 'module' && dependency.kind === 'dynamic-import') {
                throw prepareError('DYNAMIC_IMPORT_UNSUPPORTED', `CommonJS dynamic import is not supported: ${dependency.specifier}`, {
                    path: module.path,
                    specifier: dependency.specifier,
                });
            }
            const replacement = await resolveDependency(context, module, dependency);
            if (replacement && replacement !== dependency.specifier) {
                replacements.push({start: dependency.start, end: dependency.end, value: replacement, quote: dependency.quote});
            }
        }
        module.source = applyReplacements(module.source, replacements);
        addPreparedModule(context, module);
        module.state = 'done';
        return module;
    }

    async function resolveDependency(context, parent, dependency) {
        const specifier = dependency.specifier;
        if (specifier === 'path/posix') return 'node:path/posix';
        if (isBuiltinSpecifier(specifier)) return null;
        if (specifier.startsWith('npm:')) {
            const target = await resolveNpmSpecifier(context, specifier, parent, parent.depth + 1);
            return displayVirtualPath(target);
        }
        if (isHttpUrl(specifier)) {
            const remote = await getRemoteModule(context, specifier, parent.depth + 1);
            await prepareModule(context, remote);
            return displayVirtualPath(remote.path);
        }
        if (isRelativeSpecifier(specifier) || specifier.startsWith('/')) {
            if (parent.origin === 'remote') {
                const url = new URL(specifier, parent.sourceUrl).href;
                const remote = await getRemoteModule(context, url, parent.depth + 1);
                await prepareModule(context, remote);
                return displayVirtualPath(remote.path);
            }
            const resolutionParent = parent.inline ? joinFilePath(context.resolveFrom, 'entry.js') : parent.path;
            const path = await resolveWorkspaceModulePath(context, specifier, resolutionParent, dependency.kind);
            const child = await getWorkspaceModule(context, path, parent.depth + 1);
            await prepareModule(context, child);
            return parent.inline ? displayVirtualPath(path) : null;
        }

        const packageTarget = await resolveLocalPackage(context, specifier, parent, parent.depth + 1);
        if (!packageTarget) {
            const parsed = parseBarePackageSpecifier(specifier);
            const version = context.dependencies.get(parsed.name);
            if (version) {
                const declaredSpecifier = `npm:${parsed.name}@${version}${parsed.subpath ? `/${parsed.subpath}` : ''}`;
                const declaredTarget = await resolveNpmSpecifier(context, declaredSpecifier, parent, parent.depth + 1);
                return displayVirtualPath(declaredTarget);
            }
            throw prepareError('MODULE_NOT_FOUND', `Cannot find package '${specifier}'`, {
                specifier,
                parent: parent.path,
            });
        }
        return parent.origin === 'remote' ? displayVirtualPath(packageTarget) : null;
    }

    async function getWorkspaceModule(context, path, depth) {
        const normalizedPath = normalizeWorkspacePath(path);
        if (isReservedRuntimePath(normalizedPath)) {
            throw prepareError('RESERVED_FILE_PATH', `Reserved runtime path: ${normalizedPath}`, {path: normalizedPath});
        }
        if (context.modulePaths.has(normalizedPath)) return context.modulePaths.get(normalizedPath);
        const id = `workspace:${normalizedPath}`;
        if (context.modules.has(id)) return context.modules.get(id);
        const source = await readWorkspaceText(context, normalizedPath);
        const module = createModuleRecord({id, path: normalizedPath, source, origin: 'workspace', depth});
        context.modules.set(id, module);
        context.modulePaths.set(normalizedPath, module);
        return module;
    }

    async function readWorkspaceText(context, path) {
        const prepared = context.files.get(path);
        if (prepared) return contentToText(prepared.content);
        requireWorkspace(path);
        return workspace.readText(path, {view: 'effective', signal: context.signal});
    }

    async function resolveWorkspaceModulePath(context, specifier, parentPath, kind) {
        const base = specifier.startsWith('/') ? '' : getParentFilePath(parentPath);
        const candidate = specifier.startsWith('/')
            ? normalizeFilePath(specifier)
            : joinFilePath(base, specifier);
        const mode = kind === 'require' || kind === 'require-resolve' ? 'require' : 'import';
        const resolved = await resolveWorkspaceCandidate(context, candidate, mode, new Set());
        if (resolved) return resolved;
        throw prepareError('MODULE_NOT_FOUND', `Cannot find module '${specifier}'`, {
            specifier,
            parent: parentPath,
        });
    }

    async function resolveWorkspaceCandidate(context, path, mode, visited) {
        const normalizedPath = normalizeWorkspacePath(path);
        if (visited.has(normalizedPath)) return '';
        visited.add(normalizedPath);
        const kind = await getWorkspaceKind(context, normalizedPath);
        if (kind === 'file') return normalizedPath;
        const extensions = mode === 'import' ? ['.mjs', '.js', '.cjs', '.json'] : ['.js', '.cjs', '.json', '.mjs'];
        for (const extension of extensions) {
            if (await getWorkspaceKind(context, `${normalizedPath}${extension}`) === 'file') return `${normalizedPath}${extension}`;
        }
        if (kind !== 'directory') return '';

        const packagePath = joinFilePath(normalizedPath, 'package.json');
        if (await getWorkspaceKind(context, packagePath) === 'file') {
            try {
                const manifestSource = await readWorkspaceText(context, packagePath);
                addFile(context, {path: packagePath, content: manifestSource});
                const manifest = JSON.parse(manifestSource);
                const entry = packageEntry(manifest, mode);
                if (entry) {
                    const resolved = await resolveWorkspaceCandidate(context, joinFilePath(normalizedPath, entry), mode, visited);
                    if (resolved) return resolved;
                }
            } catch (error) {
                if (error?.code) throw error;
            }
        }
        const indexes = mode === 'import'
            ? ['index.mjs', 'index.js', 'index.cjs', 'index.json']
            : ['index.js', 'index.cjs', 'index.json', 'index.mjs'];
        for (const name of indexes) {
            const indexPath = joinFilePath(normalizedPath, name);
            if (await getWorkspaceKind(context, indexPath) === 'file') return indexPath;
        }
        return '';
    }

    async function includePackageScopeManifest(context, path) {
        let directory = getParentFilePath(path);
        while (true) {
            const packagePath = joinFilePath(directory, 'package.json');
            if (await getWorkspaceKind(context, packagePath) === 'file') {
                const content = await readWorkspaceText(context, packagePath);
                addFile(context, {path: packagePath, content});
                try {
                    return JSON.parse(content);
                } catch {
                    return null;
                }
            }
            if (!directory) return null;
            directory = getParentFilePath(directory);
        }
    }

    async function getWorkspaceKind(context, path) {
        if (context.modulePaths.has(path)) return 'file';
        if (context.files.has(path)) return 'file';
        const prefix = path ? `${path}/` : '';
        for (const filePath of context.files.keys()) {
            if (prefix && filePath.startsWith(prefix)) return 'directory';
        }
        if (!workspace) return '';
        try {
            return (await workspace.stat(path, {view: 'effective', signal: context.signal})).kind;
        } catch (error) {
            if (error?.code === 'FILE_NOT_FOUND') return '';
            throw error;
        }
    }

    async function resolveLocalPackage(context, specifier, parent, depth) {
        const parsed = parseBarePackageSpecifier(specifier);
        const anchor = parent.origin === 'remote' ? context.resolveFrom : getParentFilePath(parent.path);
        const root = await findLocalPackageRoot(context, parsed.name, anchor);
        if (!root) return '';
        await loadLocalPackage(context, root, depth);
        return parsed.subpath ? joinFilePath(root, parsed.subpath) : root;
    }

    async function findLocalPackageRoot(context, name, startDirectory) {
        validatePackageName(name, name);
        let directory = normalizeWorkspacePath(startDirectory || '');
        while (true) {
            const candidate = joinFilePath(directory, 'node_modules', name);
            if (await getWorkspaceKind(context, candidate) === 'directory') return candidate;
            if (!directory) return '';
            directory = getParentFilePath(directory);
        }
    }

    async function loadLocalPackage(context, root, depth) {
        if (context.localPackages.has(root)) return context.localPackages.get(root);
        assertDepth(depth);
        const packagePath = joinFilePath(root, 'package.json');
        const manifest = JSON.parse(await readWorkspaceText(context, packagePath));
        const record = {root, name: manifest.name || getPackageNameFromRoot(root), version: String(manifest.version || '0.0.0'), manifest};
        context.localPackages.set(root, record);

        const packageFiles = await collectLocalPackageFiles(context, root, record.name);
        const totalBytes = packageFiles.reduce((total, file) => total + getContentSize(file.content), 0);
        cachePackage({name: record.name, version: record.version, manifest, files: packageFiles, totalBytes});

        const optionalDependencies = {...manifest.optionalDependencies};
        const dependencies = Object.fromEntries(Object.entries(manifest.dependencies || {})
            .filter(([name]) => !Object.prototype.hasOwnProperty.call(optionalDependencies, name)));
        for (const [name, range] of Object.entries(dependencies)) {
            const localRoot = await findLocalPackageRoot(context, name, root);
            if (localRoot && !context.packageMounts.has(localRoot)) {
                await loadLocalPackage(context, localRoot, depth + 1);
            } else {
                const packageRecord = await downloadPackage(name, range, context.signal);
                await mountPackageDependency(context, packageRecord, root, packageScopeRoot(root), depth + 1);
            }
        }
        for (const [name, range] of Object.entries(optionalDependencies)) {
            await prepareOptionalDependency(context, async () => {
                const localRoot = await findLocalPackageRoot(context, name, root);
                if (localRoot && !context.packageMounts.has(localRoot)) await loadLocalPackage(context, localRoot, depth + 1);
                else {
                    const packageRecord = await downloadPackage(name, range, context.signal);
                    await mountPackageDependency(context, packageRecord, root, packageScopeRoot(root), depth + 1);
                }
            });
        }
        return record;
    }

    async function collectLocalPackageFiles(context, root, packageName) {
        const files = new Map();
        for (const [path, file] of context.files) {
            if (path.startsWith(`${root}/`)) files.set(relativePath(path, root), file.content);
        }
        if (workspace) {
            const directories = [root];
            let visitedEntries = 0;
            while (directories.length) {
                const directory = directories.shift();
                const listLimit = Math.min(limits.maxPackageFileCount + 1, workspace.policy?.maxListEntries ?? Infinity);
                let entries;
                try {
                    entries = await workspace.list(directory, {
                        view: 'effective',
                        signal: context.signal,
                        limit: listLimit,
                    });
                } catch (error) {
                    if (error?.code === 'FILE_NOT_FOUND' && files.size) break;
                    throw error;
                }
                if (Number.isFinite(listLimit) && entries.length >= listLimit) {
                    throw prepareError('PACKAGE_LIST_TRUNCATED', `Package directory is too large to enumerate: ${packageName}`, {
                        path: directory,
                        size: entries.length,
                        maxSize: listLimit,
                    });
                }
                visitedEntries += entries.length;
                if (visitedEntries > limits.maxPackageFileCount * 2) {
                    throw prepareError('PACKAGE_FILE_COUNT_EXCEEDED', `Package contains too many entries: ${packageName}`, {
                        path: root,
                        size: visitedEntries,
                        maxSize: limits.maxPackageFileCount * 2,
                    });
                }
                for (const entry of entries) {
                    if (entry.kind === 'directory') {
                        directories.push(entry.path);
                        continue;
                    }
                    if (entry.kind !== 'file') continue;
                    const relative = relativePath(entry.path, root);
                    if (!files.has(relative)) files.set(relative, await readWorkspaceBytes(entry.path, 'effective', context.signal));
                }
            }
        }
        if (!files.size) requireWorkspace(root);
        if (files.size > limits.maxPackageFileCount) {
            throw prepareError('PACKAGE_FILE_COUNT_EXCEEDED', `Package contains too many files: ${packageName}`, {
                path: root,
                size: files.size,
                maxSize: limits.maxPackageFileCount,
            });
        }
        const result = [...files.entries()]
            .map(([path, content]) => ({path, content}))
            .sort((left, right) => left.path.localeCompare(right.path));
        for (const file of result) addFile(context, {path: joinFilePath(root, file.path), content: file.content});
        return result;
    }

    async function resolveNpmSpecifier(context, specifier, parent, depth) {
        const parsed = parseNpmSpecifier(specifier);
        const anchor = parent.origin === 'remote' ? context.resolveFrom : getParentFilePath(parent.path);
        const localRoot = await findLocalPackageRoot(context, parsed.name, anchor);
        if (localRoot) {
            const manifest = JSON.parse(await readWorkspaceText(context, joinFilePath(localRoot, 'package.json')));
            if (satisfiesVersion(String(manifest.version || '0.0.0'), parsed.version)) {
                await loadLocalPackage(context, localRoot, depth);
                return parsed.subpath ? joinFilePath(localRoot, parsed.subpath) : localRoot;
            }
        }

        const packageRecord = await downloadPackage(parsed.name, parsed.version, context.signal);
        const root = joinFilePath(PACKAGE_ROOT, packageDirectoryName(packageRecord.name, packageRecord.version));
        await mountPackage(context, packageRecord, root, depth, PACKAGE_ROOT);
        return parsed.subpath ? joinFilePath(root, parsed.subpath) : root;
    }

    async function downloadPackage(name, version, signal) {
        validatePackageName(name, name);
        if (!packageDownloader) {
            throw prepareError('PACKAGE_DOWNLOADER_UNAVAILABLE', `Cannot download package: ${name}@${version}`, {name, version});
        }
        return packageDownloader.download(name, version, {signal});
    }

    async function mountPackage(context, packageRecord, root, depth, scopeRoot) {
        const existing = context.packageMounts.get(root);
        if (existing) {
            if (samePackage(existing, packageRecord)) return existing;
            throw prepareError('PACKAGE_MOUNT_CONFLICT', `Conflicting packages cannot be mounted at ${root}`, {
                path: root,
                name: packageRecord.name,
                version: packageRecord.version,
                existingName: existing.name,
                existingVersion: existing.version,
            });
        }
        assertDepth(depth);
        const mounted = {
            root,
            scopeRoot: normalizeFilePath(scopeRoot),
            name: packageRecord.name,
            version: packageRecord.version,
        };
        context.packageMounts.set(root, mounted);
        for (const file of packageRecord.files || []) {
            addFile(context, {path: joinFilePath(root, file.path), content: file.content});
        }

        const optionalDependencies = {...packageRecord.manifest?.optionalDependencies};
        const dependencies = Object.fromEntries(Object.entries(packageRecord.manifest?.dependencies || {})
            .filter(([name]) => !Object.prototype.hasOwnProperty.call(optionalDependencies, name)));
        for (const [name, range] of Object.entries(dependencies)) {
            const dependency = await downloadPackage(name, range, context.signal);
            await mountPackageDependency(context, dependency, root, mounted.scopeRoot, depth + 1);
        }
        for (const [name, range] of Object.entries(optionalDependencies)) {
            await prepareOptionalDependency(context, async () => {
                const dependency = await downloadPackage(name, range, context.signal);
                await mountPackageDependency(context, dependency, root, mounted.scopeRoot, depth + 1);
            });
        }
        return mounted;
    }

    async function mountPackageDependency(context, packageRecord, parentRoot, scopeRoot, depth) {
        const candidates = packageMountCandidates(parentRoot, scopeRoot, packageRecord.name);
        const nearestRoot = candidates[0];
        for (const candidate of candidates) {
            const existing = await inspectPackageRoot(context, candidate);
            if (!existing) continue;
            if (samePackage(existing, packageRecord)) {
                if (existing.local) await loadLocalPackage(context, candidate, depth);
                return existing;
            }
            if (context.packageMounts.has(nearestRoot) || await getWorkspaceKind(context, nearestRoot) === 'directory') {
                throw prepareError('PACKAGE_MOUNT_CONFLICT', `Conflicting packages cannot be mounted at ${nearestRoot}`, {
                    path: nearestRoot,
                    name: packageRecord.name,
                    version: packageRecord.version,
                });
            }
            return mountPackage(context, packageRecord, nearestRoot, depth, scopeRoot);
        }
        return mountPackage(context, packageRecord, candidates.at(-1), depth, scopeRoot);
    }

    async function inspectPackageRoot(context, root) {
        const mounted = context.packageMounts.get(root);
        if (mounted) return mounted;
        const local = context.localPackages.get(root);
        if (local) return {...local, local: true};
        if (await getWorkspaceKind(context, root) !== 'directory') return null;
        const packagePath = joinFilePath(root, 'package.json');
        if (await getWorkspaceKind(context, packagePath) !== 'file') return {root, opaque: true};
        try {
            const manifest = JSON.parse(await readWorkspaceText(context, packagePath));
            return {
                root,
                name: manifest.name || getPackageNameFromRoot(root),
                version: String(manifest.version || '0.0.0'),
                local: true,
            };
        } catch {
            return {root, opaque: true};
        }
    }

    async function getRemoteModule(context, value, depth) {
        const requestedUrl = normalizeRemoteUrl(value);
        if (context.remoteModules.has(requestedUrl)) return context.remoteModules.get(requestedUrl);
        assertDepth(depth);
        const cached = store.getRemoteModule(requestedUrl);
        let source;
        let sourceUrl = requestedUrl;
        if (cached) {
            source = contentToText(cached.source ?? cached.content ?? '');
            sourceUrl = cached.finalUrl || cached.url || requestedUrl;
        } else {
            const downloaded = await downloadRemoteSource(context, requestedUrl);
            source = downloaded.source;
            sourceUrl = downloaded.finalUrl;
            store.setRemoteModule(requestedUrl, downloaded);
        }

        if (context.remoteModules.has(sourceUrl)) {
            const existing = context.remoteModules.get(sourceUrl);
            context.remoteModules.set(requestedUrl, existing);
            return existing;
        }

        const path = createRemotePath(context, sourceUrl);
        const module = createModuleRecord({
            id: `remote:${requestedUrl}`,
            path,
            source,
            sourceUrl,
            origin: 'remote',
            depth,
        });
        context.remoteModules.set(requestedUrl, module);
        context.remoteModules.set(sourceUrl, module);
        context.modules.set(module.id, module);
        context.modulePaths.set(path, module);
        return module;
    }

    async function downloadRemoteSource(context, url) {
        if (!fetch) throw prepareError('FETCH_UNAVAILABLE', `Cannot download remote module: ${url}`, {url});
        throwIfAborted(context.signal);
        const response = await fetch(url, {method: 'GET', credentials: 'omit', signal: context.signal});
        if (!response?.ok) {
            throw prepareError('REMOTE_MODULE_DOWNLOAD_FAILED', `Remote module request failed: ${response?.status || 0}`, {
                url,
                status: response?.status || 0,
            });
        }
        const bytes = await readResponseBytes(response, limits.maxDownloadBytes, context.signal, url);
        context.downloadBytes += bytes.byteLength;
        if (context.downloadBytes > limits.maxDownloadTotalBytes) {
            throw prepareError('REMOTE_DOWNLOAD_TOTAL_EXCEEDED', 'Remote module downloads exceed the total limit', {
                size: context.downloadBytes,
                maxSize: limits.maxDownloadTotalBytes,
            });
        }
        return {
            source: new TextDecoder().decode(bytes),
            size: bytes.byteLength,
            finalUrl: response.url || url,
        };
    }

    function addPreparedModule(context, module) {
        if (module.inline) return;
        addFile(context, {path: module.path, content: module.source, sourceModule: true});
    }

    function addFile(context, file) {
        const path = normalizeFilePath(file.path);
        const size = getContentSize(file.content);
        const previous = context.files.get(path);
        const previousSize = previous ? getContentSize(previous.content) : 0;
        const previousSourceSize = previous && (previous.sourceModule || isJavaScriptPath(previous.path)) ? previousSize : 0;
        const sourceSize = file.sourceModule || isJavaScriptPath(path) ? size : 0;
        const nextFileCount = context.files.size + (previous ? 0 : 1);
        const nextTotalBytes = context.totalBytes - previousSize + size;
        const nextSourceBytes = context.sourceBytes - previousSourceSize + sourceSize;
        if (nextFileCount > limits.maxFileCount) {
            throw prepareError('FILE_COUNT_EXCEEDED', 'Prepared file count exceeds the limit', {
                size: nextFileCount,
                maxSize: limits.maxFileCount,
            });
        }
        if (nextTotalBytes > limits.maxTotalBytes) {
            throw prepareError('FILE_TOTAL_SIZE_EXCEEDED', 'Prepared files exceed the total size limit', {
                size: nextTotalBytes,
                maxSize: limits.maxTotalBytes,
            });
        }
        if (nextSourceBytes > limits.maxSourceBytes) {
            throw prepareError('SOURCE_SIZE_EXCEEDED', 'JavaScript source exceeds the total size limit', {
                size: nextSourceBytes,
                maxSize: limits.maxSourceBytes,
            });
        }
        context.files.set(path, {...file, path});
        context.totalBytes = nextTotalBytes;
        context.sourceBytes = nextSourceBytes;
    }

    function assertPreparedSizes(context) {
        if (context.sourceBytes > limits.maxSourceBytes) {
            throw prepareError('SOURCE_SIZE_EXCEEDED', 'JavaScript source exceeds the total size limit', {
                size: context.sourceBytes,
                maxSize: limits.maxSourceBytes,
            });
        }
        if (context.totalBytes > limits.maxTotalBytes) {
            throw prepareError('FILE_TOTAL_SIZE_EXCEEDED', 'Prepared files exceed the total size limit', {
                size: context.totalBytes,
                maxSize: limits.maxTotalBytes,
            });
        }
    }

    function cachePackage(packageRecord) {
        try {
            store.setPackage(packageRecord);
        } catch (error) {
            if (error?.code !== 'DEPENDENCY_ENTRY_TOO_LARGE') throw error;
        }
    }

    async function prepareOptionalDependency(context, callback) {
        const files = new Map(context.files);
        const packageMounts = new Map(context.packageMounts);
        const localPackages = new Map(context.localPackages);
        const totalBytes = context.totalBytes;
        const sourceBytes = context.sourceBytes;
        try {
            await callback();
        } catch (error) {
            if (context.signal?.aborted) throw context.signal.reason || error;
            if (!isOptionalDependencyFailure(error)) throw error;
            context.files = files;
            context.packageMounts = packageMounts;
            context.localPackages = localPackages;
            context.totalBytes = totalBytes;
            context.sourceBytes = sourceBytes;
        }
    }

    async function readWorkspaceBytes(path, view = 'effective', signal = defaultSignal) {
        requireWorkspace(path);
        const blob = await workspace.readBlob(path, {view, signal});
        return new Uint8Array(await blob.arrayBuffer());
    }

    function requireWorkspace(path) {
        if (!workspace) throw prepareError('WORKSPACE_REQUIRED', `Workspace is required to read: ${path}`, {path});
    }

    function assertDepth(depth) {
        if (depth > limits.maxDependencyDepth) {
            throw prepareError('DEPENDENCY_DEPTH_EXCEEDED', 'Dependency depth exceeds the limit', {
                size: depth,
                maxSize: limits.maxDependencyDepth,
            });
        }
    }

    return prepare;
}

async function prepareRunScript(options = {}, config = {}) {
    return createRunScriptPreparer(config)(options);
}

async function readResponseBytes(response, maxBytes, signal, url) {
    const declaredSize = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
        throw prepareError('REMOTE_MODULE_TOO_LARGE', `Remote module is too large: ${url}`, {url, size: declaredSize, maxSize: maxBytes});
    }
    if (!response.body?.getReader) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > maxBytes) throw prepareError('REMOTE_MODULE_TOO_LARGE', `Remote module is too large: ${url}`, {url, size: bytes.byteLength, maxSize: maxBytes});
        return bytes;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            throwIfAborted(signal);
            const {done, value} = await reader.read();
            if (done) break;
            const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
            total += chunk.byteLength;
            if (total > maxBytes) throw prepareError('REMOTE_MODULE_TOO_LARGE', `Remote module is too large: ${url}`, {url, size: total, maxSize: maxBytes});
            chunks.push(chunk);
        }
    } finally {
        reader.releaseLock();
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

function applyReplacements(source, replacements) {
    let result = source;
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
        const value = escapeModuleSpecifier(replacement.value, replacement.quote);
        result = `${result.slice(0, replacement.start)}${value}${result.slice(replacement.end)}`;
    }
    return result;
}

function mergeModuleSpecifiers(...collections) {
    const result = new Map();
    for (const collection of collections) {
        for (const item of collection || []) result.set(`${item.start}:${item.end}`, item);
    }
    return [...result.values()].sort((left, right) => left.start - right.start);
}

function packageEntry(manifest, mode) {
    const exports = manifest?.exports;
    if (typeof exports === 'string') return exports;
    if (exports && typeof exports === 'object') {
        const root = exports['.'] || exports;
        if (typeof root === 'string') return root;
        if (root && typeof root === 'object') {
            const target = root[mode] || root.default || root.require || root.import;
            if (typeof target === 'string') return target;
        }
    }
    return typeof manifest?.main === 'string' ? manifest.main : '';
}

function getEffectiveModuleFormat(module, packageManifest, detectedFormat) {
    const requested = String(module.requestedFormat || '').trim().toLowerCase();
    if (requested === 'esm' || requested === 'mjs' || requested === 'module') return 'module';
    if (requested === 'cjs' || requested === 'commonjs') return 'commonjs';
    if (requested === 'umd') return 'umd';
    if (requested === 'global' || requested === 'iife' || requested === 'script') return 'global';
    if (module.path.endsWith('.mjs')) return 'module';
    if (module.path.endsWith('.cjs')) return 'commonjs';
    if (module.path.endsWith('.js') && packageManifest) {
        return packageManifest.type === 'module' ? 'module' : 'commonjs';
    }
    return detectedFormat;
}

function parseNpmSpecifier(specifier) {
    const value = String(specifier).slice(4);
    const parsed = splitPackageSpecifier(value);
    if (!parsed.name) throw prepareError('INVALID_NPM_SPECIFIER', `Invalid npm specifier: ${specifier}`, {specifier});
    validatePackageName(parsed.name, specifier);
    return {...parsed, version: parsed.version || 'latest', subpath: normalizePackageSubpath(parsed.subpath, specifier)};
}

function parseBarePackageSpecifier(specifier) {
    const parsed = splitPackageSpecifier(String(specifier), false);
    if (!parsed.name) throw prepareError('INVALID_PACKAGE_SPECIFIER', `Invalid package specifier: ${specifier}`, {specifier});
    validatePackageName(parsed.name, specifier);
    return {name: parsed.name, subpath: normalizePackageSubpath(parsed.subpath, specifier)};
}

function normalizeDeclaredDependencies(dependencies) {
    if (dependencies == null) return new Map();
    if (!Array.isArray(dependencies)) throw prepareError('INVALID_DEPENDENCIES', 'dependencies must be an array');
    const result = new Map();
    for (const dependency of dependencies) {
        const value = String(dependency || '').trim();
        if (!value) throw prepareError('INVALID_NPM_SPECIFIER', 'Dependency specifier is required', {specifier: value});
        const parsed = parseNpmSpecifier(value.startsWith('npm:') ? value : `npm:${value}`);
        if (parsed.subpath) {
            throw prepareError('INVALID_NPM_SPECIFIER', `Dependency must reference a package root: ${dependency}`, {specifier: value});
        }
        const existing = result.get(parsed.name);
        if (existing && existing !== parsed.version) {
            throw prepareError('PACKAGE_VERSION_CONFLICT', `Conflicting dependency versions: ${parsed.name}@${existing} and ${parsed.name}@${parsed.version}`, {
                name: parsed.name,
                version: parsed.version,
                existingVersion: existing,
            });
        }
        result.set(parsed.name, parsed.version);
    }
    return result;
}

function splitPackageSpecifier(value, allowVersion = true) {
    const text = String(value || '');
    let packageEnd;
    if (text.startsWith('@')) {
        const scopeSeparator = text.indexOf('/');
        if (scopeSeparator === -1) return {name: '', version: '', subpath: ''};
        const versionSeparator = allowVersion ? text.indexOf('@', scopeSeparator + 1) : -1;
        const subpathSeparator = text.indexOf('/', scopeSeparator + 1);
        packageEnd = firstPositive(versionSeparator, subpathSeparator, text.length);
    } else {
        const versionSeparator = allowVersion ? text.indexOf('@') : -1;
        const subpathSeparator = text.indexOf('/');
        packageEnd = firstPositive(versionSeparator, subpathSeparator, text.length);
    }
    const name = text.slice(0, packageEnd);
    let offset = packageEnd;
    let version = '';
    if (allowVersion && text[offset] === '@') {
        const versionEnd = text.indexOf('/', offset + 1);
        version = text.slice(offset + 1, versionEnd === -1 ? text.length : versionEnd);
        offset = versionEnd === -1 ? text.length : versionEnd;
    }
    const subpath = text[offset] === '/' ? text.slice(offset + 1) : '';
    return {name, version, subpath};
}

function firstPositive(...values) {
    return Math.min(...values.filter((value) => value >= 0));
}

function validatePackageName(name, specifier) {
    const validPattern = /^(?:@[a-z0-9._~-]+\/[a-z0-9._~-]+|[a-z0-9._~-]+)$/i.test(name);
    const validSegments = name.replace(/^@/, '').split('/').every((part) => part !== '.' && part !== '..');
    if (!validPattern || !validSegments) {
        throw prepareError('INVALID_PACKAGE_SPECIFIER', `Invalid package specifier: ${specifier}`, {specifier});
    }
}

function normalizePackageSubpath(value, specifier) {
    if (!value) return '';
    const parts = String(value).replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
    if (!parts.length || parts.some((part) => part === '..' || part.includes('\0'))) {
        throw prepareError('INVALID_PACKAGE_SPECIFIER', `Invalid package subpath: ${specifier}`, {specifier});
    }
    return parts.join('/');
}

function packageDirectoryName(name, version) {
    const safeName = name.replace(/^@/, '').replace(/[^A-Za-z0-9._-]+/g, '-');
    const safeVersion = version.replace(/[^A-Za-z0-9._-]+/g, '-');
    return `${safeName}@${safeVersion}-${hashString(name)}`;
}

function packageMountCandidates(parentRoot, scopeRoot, name) {
    const root = normalizeFilePath(parentRoot);
    const scope = normalizeFilePath(scopeRoot);
    if (root !== scope && scope && !root.startsWith(`${scope}/`)) {
        throw prepareError('INVALID_PACKAGE_SCOPE', `Package root is outside its installation scope: ${root}`, {
            path: root,
            scope,
        });
    }

    const candidates = [];
    let directory = root;
    while (true) {
        if (directory.split('/').at(-1) !== 'node_modules') {
            candidates.push(joinFilePath(directory, 'node_modules', name));
        }
        if (directory === scope) break;
        directory = getParentFilePath(directory);
    }
    return [...new Set(candidates)];
}

function packageScopeRoot(root) {
    const parts = normalizeFilePath(root).split('/');
    const nodeModulesIndex = parts.indexOf('node_modules');
    return nodeModulesIndex === -1
        ? getParentFilePath(root)
        : parts.slice(0, nodeModulesIndex).join('/');
}

function samePackage(left, right) {
    return Boolean(left && right
        && left.name === right.name
        && String(left.version) === String(right.version));
}

function getPackageNameFromRoot(root) {
    const values = root.split('/');
    const nodeModules = values.lastIndexOf('node_modules');
    if (nodeModules === -1) return values.at(-1) || '';
    return values[nodeModules + 1]?.startsWith('@')
        ? `${values[nodeModules + 1]}/${values[nodeModules + 2] || ''}`
        : values[nodeModules + 1] || '';
}

function createRemotePath(context, url) {
    const parsed = new URL(url);
    const extension = parsed.pathname.match(/\.(?:cjs|js|json|mjs)$/i)?.[0].toLowerCase() || '.js';
    return joinFilePath(REMOTE_ROOT, `${hashString(url)}-${context.remoteSequence++}${extension}`);
}

function hashString(value) {
    let hash = 0x811c9dc5;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function isBuiltinSpecifier(specifier) {
    if (specifier.startsWith('node:')) return true;
    return BUILTIN_MODULES.has(specifier);
}

function isHttpUrl(value) {
    return /^https?:\/\//i.test(value);
}

function isRelativeSpecifier(value) {
    return value.startsWith('./') || value.startsWith('../');
}

function isJavaScriptPath(path) {
    return /\.(?:cjs|js|mjs)$/i.test(path);
}

function isReservedRuntimePath(path) {
    return path === '__runscript__'
        || path.startsWith('__runscript__/')
        || path === '.runscript'
        || path.startsWith('.runscript/')
        || path.includes('/.runscript/');
}

function normalizeWorkspacePath(value) {
    const raw = String(value || '').trim();
    if (/^(?:[\\/]|[A-Za-z]:[\\/])/.test(raw)) {
        throw prepareError('INVALID_FILE_PATH', `Absolute workspace path is not allowed: ${raw}`, {path: raw});
    }
    return normalizeFilePath(raw);
}

function normalizeRemoteUrl(value) {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw prepareError('INVALID_REMOTE_URL', `Unsupported remote URL: ${value}`, {url: String(value || '')});
    }
    return url.href;
}

function displayVirtualPath(path) {
    const normalized = normalizeFilePath(path);
    return normalized ? `/${normalized}` : '/';
}

function defaultEntryName(format) {
    return ['esm', 'mjs', 'module'].includes(String(format || '').toLowerCase()) ? 'entry.mjs' : 'entry.js';
}

function relativePath(path, root) {
    return path === root ? '' : path.slice(root.length + 1);
}

function contentToText(value) {
    if (typeof value === 'string') return value;
    if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
    if (ArrayBuffer.isView(value)) return new TextDecoder().decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return String(value ?? '');
}

function getContentSize(value) {
    if (typeof value === 'string') return new TextEncoder().encode(value).byteLength;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
    return new TextEncoder().encode(String(value ?? '')).byteLength;
}

function throwIfAborted(signal) {
    if (signal?.aborted) throw signal.reason || new DOMException('The operation was aborted', 'AbortError');
}

function isOptionalDependencyFailure(error) {
    if (error?.name === 'AbortError') return false;
    if (/(?:COUNT|DEPTH|SIZE|TOTAL)_EXCEEDED|TOO_LARGE/.test(String(error?.code || ''))) return false;
    return !error?.code || String(error.code).startsWith('PACKAGE_') || error.code === 'MODULE_NOT_FOUND';
}

function prepareError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

export {createRunScriptPreparer, prepareRunScript};
