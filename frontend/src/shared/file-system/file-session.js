import {
    blobToText,
    getFileName,
    getMimeType,
    isPathUnder,
    joinFilePath,
    normalizeFilePath,
    streamToBlob,
    toBlob,
    withBlobType,
} from '../file-utils.js';
import {FileChangeSet} from './file-change-set.js';
import {FileAlreadyExistsError, FileNotFoundError} from './file-system-errors.js';

const FILE_VIEWS = new Set(['effective', 'base', 'changes']);

class FileSession {
    #fileSystem;
    #changes;
    #baseEntries = new Map();
    #commits = new Map();

    constructor({fileSystem, changes = new FileChangeSet()} = {}) {
        if (!fileSystem) throw new TypeError('FileSession requires a fileSystem');
        this.#fileSystem = fileSystem;
        this.#changes = changes;
    }

    get policy() {
        return this.#fileSystem.policy;
    }

    getCapabilities() {
        return this.#fileSystem.getCapabilities();
    }

    supports(capability) {
        return this.#fileSystem.supports(capability);
    }

    async checkAccess(path = '', options = {}) {
        return this.#fileSystem.checkAccess(path, options);
    }

    async getResourceUrl(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const {view: requestedView = 'effective', ...fileOptions} = options;
        const view = normalizeView(requestedView);
        if (view === 'changes' && !this.#changes.has(normalizedPath)) return null;
        if (view !== 'base' && this.#changes.has(normalizedPath)) return null;
        return this.#fileSystem.getResourceUrl(normalizedPath, fileOptions);
    }

    async createDirectory(path, options = {}) {
        return this.#fileSystem.createDirectory(path, options);
    }

    async stat(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const {view: requestedView = 'effective', ...fileOptions} = options;
        const view = normalizeView(requestedView);
        if (view === 'base') return this.#rememberBase(await this.#fileSystem.stat(normalizedPath, fileOptions));

        const change = this.#changes.get(normalizedPath);
        if (change) {
            if (view === 'effective' && change.status === 'deleted') throw new FileNotFoundError(normalizedPath);
            return changeToEntry(change);
        }

        if (this.#hasVisibleDescendant(normalizedPath, view)) {
            return directoryEntry(normalizedPath, view === 'changes' ? 'changed' : undefined);
        }
        if (view === 'changes') throw new FileNotFoundError(normalizedPath);

        try {
            return this.#rememberBase(await this.#fileSystem.stat(normalizedPath, fileOptions));
        } catch (error) {
            if (error?.code === FileNotFoundError.code && this.#hasVisibleDescendant(normalizedPath, view)) {
                return directoryEntry(normalizedPath);
            }
            throw error;
        }
    }

    async list(path = '', options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const {view: requestedView = 'effective', ...fileOptions} = options;
        const view = normalizeView(requestedView);
        if (view === 'base') return this.#rememberBaseList(await this.#fileSystem.list(normalizedPath, fileOptions));

        const entries = new Map();
        if (view === 'effective') {
            try {
                for (const entry of this.#rememberBaseList(await this.#fileSystem.list(normalizedPath, fileOptions))) entries.set(entry.name, entry);
            } catch (error) {
                if (error?.code !== FileNotFoundError.code || !this.#hasVisibleDescendant(normalizedPath, view)) throw error;
            }
        }

        for (const change of this.#changes.listUnder(normalizedPath)) {
            const relativePath = relativeFilePath(change.path, normalizedPath);
            if (!relativePath) continue;
            const [name, ...remaining] = relativePath.split('/');
            if (remaining.length > 0) {
                if (!entries.has(name)) entries.set(name, directoryEntry(joinFilePath(normalizedPath, name), 'changed'));
                continue;
            }

            if (view === 'effective' && change.status === 'deleted') entries.delete(name);
            else entries.set(name, changeToEntry(change));
        }

        const limit = this.#fileSystem.policy.normalizeListLimit(fileOptions.limit);
        return [...entries.values()]
            .sort((left, right) => left.name.localeCompare(right.name))
            .slice(0, limit);
    }

    async walk(path = '', options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const limit = this.#fileSystem.policy.normalizeListLimit(options.limit, this.#fileSystem.policy.maxWalkEntries);
        const entries = [];
        const directories = [normalizedPath];
        while (directories.length > 0 && entries.length < limit) {
            const directory = directories.shift();
            const children = await this.list(directory, {
                ...options,
                limit: Math.min(this.#fileSystem.policy.maxListEntries, limit - entries.length),
            });
            for (const child of children) {
                entries.push(child);
                if (child.kind === 'directory') directories.push(child.path);
                if (entries.length >= limit) break;
            }
        }
        return entries;
    }

    async openRead(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const {view: requestedView = 'effective', adoptBase = false, ...fileOptions} = options;
        const view = normalizeView(requestedView);
        if (view !== 'base') {
            const change = this.#changes.get(normalizedPath);
            if (change) {
                if (change.status === 'deleted') throw new FileNotFoundError(normalizedPath);
                const blob = changeToBlob(change);
                return {
                    path: normalizedPath,
                    name: getFileName(normalizedPath),
                    kind: 'file',
                    size: blob.size,
                    mimeType: change.mimeType,
                    version: change.baseVersion,
                    blob,
                    stream: blob.stream(),
                };
            }
            if (view === 'changes') throw new FileNotFoundError(normalizedPath);
        }
        const opened = await this.#fileSystem.openRead(normalizedPath, fileOptions);
        this.#rememberBase(opened, {replace: adoptBase, observation: 'content'});
        return opened;
    }

    async readBlob(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const opened = await this.openRead(normalizedPath, options);
        this.#fileSystem.policy.assertMemoryRead(normalizedPath, opened.size);
        const blob = opened.blob || await streamToBlob(opened.stream);
        this.#fileSystem.policy.assertMemoryRead(normalizedPath, blob.size);
        return withBlobType(blob, opened.mimeType);
    }

    async readText(path, options = {}) {
        const blob = await this.readBlob(path, options);
        return blobToText(blob);
    }

    async stageText(path, value, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const text = String(value);
        this.#fileSystem.policy.assertMemoryWrite(normalizedPath, this.#fileSystem.policy.getTextSize(text));
        const {createOnly = false, ...changeOptions} = options;
        const base = createOnly
            ? await this.#getCreateBase(normalizedPath)
            : await this.#getStageBase(normalizedPath);
        return this.#changes.stageText(normalizedPath, text, {
            ...base,
            ...changeOptions,
            ...(createOnly ? {status: 'created', baseVersion: null, baseSize: null} : {}),
            mimeType: options.mimeType || base.mimeType || 'text/plain;charset=utf-8',
        });
    }

    async stageBlob(path, value, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const blob = toBlob(value, options.mimeType);
        this.#fileSystem.policy.assertMemoryWrite(normalizedPath, blob.size);
        const {createOnly = false, ...changeOptions} = options;
        const base = createOnly
            ? await this.#getCreateBase(normalizedPath)
            : await this.#getStageBase(normalizedPath);
        return this.#changes.stageBlob(normalizedPath, blob, {
            ...base,
            ...changeOptions,
            ...(createOnly ? {status: 'created', baseVersion: null, baseSize: null} : {}),
            mimeType: options.mimeType || blob.type || base.mimeType || getMimeType(normalizedPath),
        });
    }

    async stageDelete(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const current = this.#changes.get(normalizedPath);
        if (current?.status === 'created') {
            this.#changes.remove(normalizedPath);
            return undefined;
        }
        const base = current || this.#baseEntries.get(normalizedPath) || this.#rememberBase(await this.#fileSystem.stat(normalizedPath, options));
        return this.#changes.stageDelete(normalizedPath, {
            baseVersion: current?.baseVersion ?? base.version,
            baseSize: current?.baseSize ?? base.size,
            mimeType: current?.mimeType || base.mimeType,
        });
    }

    async commit(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const change = this.#changes.get(normalizedPath);
        if (!change) return undefined;

        const active = this.#commits.get(normalizedPath);
        if (active?.change === change) return active.promise;
        const previous = active?.promise || Promise.resolve();
        const queued = previous.catch(() => {}).then(() => this.#commitChange(normalizedPath, options, change));
        const record = {change, promise: queued};
        this.#commits.set(normalizedPath, record);
        try {
            return await queued;
        } finally {
            if (this.#commits.get(normalizedPath) === record) this.#commits.delete(normalizedPath);
        }
    }

    async #commitChange(normalizedPath, options, change) {
        let result;
        if (change.status === 'deleted') {
            result = await this.#fileSystem.remove(normalizedPath, {
                ...options,
                expectedVersion: change.baseVersion,
            });
        } else if (change.dataType === 'text') {
            result = await this.#fileSystem.writeText(normalizedPath, change.value, {
                ...options,
                mimeType: change.mimeType,
                expectedVersion: change.baseVersion,
                createParents: options.createParents === true || change.status === 'created',
            });
        } else {
            result = await this.#fileSystem.writeBlob(normalizedPath, change.value, {
                ...options,
                mimeType: change.mimeType,
                expectedVersion: change.baseVersion,
                createParents: options.createParents === true || change.status === 'created',
            });
        }
        const committedEntry = change.status === 'deleted'
            ? null
            : result && typeof result === 'object'
                ? this.#rememberBase(result, {replace: true, observation: 'content'})
                : undefined;
        if (change.status === 'deleted') this.#baseEntries.delete(normalizedPath);

        const current = this.#changes.get(normalizedPath);
        if (current === change) {
            this.#changes.remove(normalizedPath);
        } else if (current) {
            this.#rebaseChangeAfterCommit(current, committedEntry);
        }
        return result;
    }

    async commitAll(options = {}) {
        const results = [];
        for (const change of this.#changes.list()) {
            results.push(await this.commit(change.path, options));
        }
        return results;
    }

    revert(path) {
        return this.#changes.remove(normalizeFilePath(path));
    }

    revertAll() {
        this.#changes.clear();
    }

    hasChange(path) {
        return this.#changes.has(normalizeFilePath(path));
    }

    getChange(path) {
        return this.#changes.get(normalizeFilePath(path));
    }

    listChanges(path) {
        return path === undefined ? this.#changes.list() : this.#changes.listUnder(path);
    }

    async refreshChangeBase(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const {baseEntry, ...fileOptions} = options;
        this.forgetBase(normalizedPath);

        let entry = null;
        if (Object.prototype.hasOwnProperty.call(options, 'baseEntry')) {
            if (baseEntry) entry = this.#rememberBase(baseEntry, {replace: true, observation: 'content'});
        } else {
            try {
                entry = this.#rememberBase(await this.#fileSystem.stat(normalizedPath, fileOptions), {
                    replace: true,
                    observation: 'content',
                });
            } catch (error) {
                if (error?.code !== FileNotFoundError.code) throw error;
            }
        }
        const change = this.#changes.get(normalizedPath);
        if (!change) return entry;

        if (change.status === 'deleted') {
            if (!entry) {
                this.#changes.remove(normalizedPath);
                return undefined;
            }
            Object.assign(change, {
                baseVersion: entry.version,
                baseSize: entry.size,
                mimeType: change.mimeType || entry.mimeType,
            });
            return change;
        }

        Object.assign(change, {
            status: entry ? 'modified' : 'created',
            baseVersion: entry?.version ?? null,
            baseSize: entry?.size ?? null,
            mimeType: change.mimeType || entry?.mimeType,
        });
        return change;
    }

    forgetBase(path) {
        const normalizedPath = normalizeFilePath(path);
        for (const entryPath of this.#baseEntries.keys()) {
            if (isPathUnder(entryPath, normalizedPath)) this.#baseEntries.delete(entryPath);
        }
    }

    async #getStageBase(path) {
        const current = this.#changes.get(path);
        if (current) {
            return {
                status: current.status === 'deleted' ? (current.baseVersion === null ? 'created' : 'modified') : current.status,
                baseVersion: current.baseVersion,
                baseSize: current.baseSize,
                mimeType: current.mimeType,
            };
        }
        const observed = this.#baseEntries.get(path);
        if (observed) {
            return {
                status: 'modified',
                baseVersion: observed.version,
                baseSize: observed.size,
                mimeType: observed.mimeType,
            };
        }
        try {
            const entry = this.#rememberBase(await this.#fileSystem.stat(path));
            return {
                status: 'modified',
                baseVersion: entry.version,
                baseSize: entry.size,
                mimeType: entry.mimeType,
            };
        } catch (error) {
            if (error?.code !== FileNotFoundError.code) throw error;
            return {status: 'created', baseVersion: null, baseSize: null};
        }
    }

    async #getCreateBase(path) {
        const current = this.#changes.get(path);
        if (current?.status === 'created') {
            return {status: 'created', baseVersion: null, baseSize: null, mimeType: current.mimeType};
        }
        if (current) throw new FileAlreadyExistsError(path);

        try {
            this.#rememberBase(await this.#fileSystem.stat(path));
            throw new FileAlreadyExistsError(path);
        } catch (error) {
            if (error?.code !== FileNotFoundError.code) throw error;
            return {status: 'created', baseVersion: null, baseSize: null};
        }
    }

    #rebaseChangeAfterCommit(change, committedEntry) {
        if (committedEntry === undefined) return change;
        if (change.status === 'deleted') {
            if (!committedEntry) {
                this.#changes.remove(change.path);
                return undefined;
            }
            Object.assign(change, {
                baseVersion: committedEntry.version,
                baseSize: committedEntry.size,
                mimeType: change.mimeType || committedEntry.mimeType,
            });
            return change;
        }

        Object.assign(change, {
            status: committedEntry ? 'modified' : 'created',
            baseVersion: committedEntry?.version ?? null,
            baseSize: committedEntry?.size ?? null,
            mimeType: change.mimeType || committedEntry?.mimeType,
        });
        return change;
    }

    #rememberBase(entry, {replace = false, observation = 'metadata'} = {}) {
        if (entry?.kind === 'file' && entry.path !== undefined) {
            const path = normalizeFilePath(entry.path);
            const current = this.#baseEntries.get(path);
            if (replace || !current || (observation === 'content' && current.observation !== 'content')) {
                this.#baseEntries.set(path, {
                    path,
                    size: entry.size,
                    mimeType: entry.mimeType,
                    version: entry.version,
                    observation,
                });
            }
        }
        return entry;
    }

    #rememberBaseList(entries) {
        entries.forEach((entry) => this.#rememberBase(entry));
        return entries;
    }

    #hasVisibleDescendant(path, view) {
        return this.#changes.listUnder(path).some((change) => {
            if (change.path === path) return false;
            return view === 'changes' || change.status !== 'deleted';
        });
    }
}

function normalizeView(view = 'effective') {
    if (!FILE_VIEWS.has(view)) throw new RangeError(`Unknown file session view: ${view}`);
    return view;
}

function changeToBlob(change) {
    return change.dataType === 'blob'
        ? change.value
        : toBlob(change.value, change.mimeType);
}

function changeToEntry(change) {
    return {
        path: change.path,
        name: getFileName(change.path),
        kind: 'file',
        size: change.status === 'deleted' ? change.baseSize : change.size,
        mimeType: change.mimeType,
        version: change.baseVersion,
        status: change.status,
        dataType: change.dataType,
        baseVersion: change.baseVersion,
        baseSize: change.baseSize,
    };
}

function directoryEntry(path, status) {
    return {
        path,
        name: getFileName(path),
        kind: 'directory',
        size: 0,
        mimeType: null,
        version: null,
        ...(status ? {status} : {}),
    };
}

function relativeFilePath(path, directory) {
    if (!isPathUnder(path, directory) || path === directory) return '';
    return directory === '' ? path : path.slice(directory.length + 1);
}

export {FileSession};
