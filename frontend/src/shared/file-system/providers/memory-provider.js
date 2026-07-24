import {
    getFileName,
    getMimeType,
    getParentFilePath,
    isPathUnder,
    normalizeFilePath,
} from '../../file-utils.js';
import {
    FileAlreadyExistsError,
    FileConflictError,
    FileDirectoryNotEmptyError,
    FileIsDirectoryError,
    FileNotDirectoryError,
    FileNotFoundError,
    FilePermissionError,
    FileSystemError,
    FileUnsupportedError,
} from '../file-system-errors.js';
import {FileSystemProvider} from '../file-system-provider.js';

class MemoryProvider extends FileSystemProvider {
    #entries = new Map();
    #permissions = new Map();
    #nextVersion = 1;

    constructor({
        entries = [],
        files = [],
        directories = [],
        writable = true,
        writableFiles = [],
        writableDirectories = [],
        readOnlyFiles = [],
        readOnlyDirectories = [],
    } = {}) {
        super();
        this.#entries.set('', directoryRecord());
        this.#permissions.set('', Boolean(writable));

        for (const descriptor of normalizeDescriptors(directories, 'directory')) this.#addInitialEntry(descriptor);
        for (const descriptor of normalizeDescriptors(files, 'file')) this.#addInitialEntry(descriptor);
        for (const descriptor of normalizeDescriptors(entries)) this.#addInitialEntry(descriptor);
        for (const path of writableDirectories) this.#permissions.set(normalizeFilePath(path), true);
        for (const path of writableFiles) this.#permissions.set(normalizeFilePath(path), true);
        for (const path of readOnlyDirectories) this.#permissions.set(normalizeFilePath(path), false);
        for (const path of readOnlyFiles) this.#permissions.set(normalizeFilePath(path), false);
    }

    getCapabilities() {
        return {
            ...super.getCapabilities(),
            read: true,
            write: true,
            streamingRead: true,
            streamingWrite: true,
            directories: true,
            createDirectory: true,
            emptyDirectories: true,
            implicitDirectories: false,
            removeFile: true,
            removeDirectory: true,
            recursiveRemove: true,
            copy: true,
            copyDirectory: true,
            move: true,
            moveDirectory: true,
            atomicMove: true,
            optimisticLocking: true,
            versionPrecondition: 'atomic',
        };
    }

    async checkAccess(path = '', options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        if (options.writable && !this.#isWritable(normalizedPath)) {
            throw new FilePermissionError(normalizedPath);
        }
        return true;
    }

    statSync(path = '', options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        return this.#entryResult(normalizedPath, this.#requireEntry(normalizedPath));
    }

    async stat(path = '', options = {}) {
        return this.statSync(path, options);
    }

    listSync(path = '', options = {}) {
        return this.#list(path, options, 'listSync');
    }

    async list(path = '', options = {}) {
        return this.#list(path, options, 'list');
    }

    #list(path, options, operation) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        const directory = this.#requireEntry(normalizedPath);
        if (directory.kind !== 'directory') throw new FileNotDirectoryError(normalizedPath, {operation});
        const prefix = normalizedPath ? `${normalizedPath}/` : '';
        const entries = [];
        for (const [entryPath, entry] of this.#entries) {
            if (!entryPath.startsWith(prefix) || entryPath === normalizedPath) continue;
            const relativePath = entryPath.slice(prefix.length);
            if (!relativePath || relativePath.includes('/')) continue;
            entries.push(this.#entryResult(entryPath, entry));
        }
        return entries
            .sort((left, right) => left.name.localeCompare(right.name))
            .slice(0, options.limit ?? Infinity);
    }

    readBytesSync(path, options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        const entry = this.#requireEntry(normalizedPath);
        if (entry.kind !== 'file') throw new FileIsDirectoryError(normalizedPath, {operation: 'readBytesSync'});
        return new Uint8Array(entry.bytes);
    }

    async openRead(path, options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        const entry = this.#requireEntry(normalizedPath);
        if (entry.kind !== 'file') throw new FileIsDirectoryError(normalizedPath, {operation: 'openRead'});
        const blob = new Blob([entry.bytes], {type: entry.mimeType});
        return {...this.#entryResult(normalizedPath, entry), blob, stream: blob.stream()};
    }

    async openWrite(path, options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        this.#assertWritable(normalizedPath);
        this.#assertExpectedVersion(normalizedPath, options.expectedVersion);
        this.#assertFileTarget(normalizedPath);
        if (options.createParents === true) this.#validateParentDirectories(normalizedPath);
        else this.#requireDirectory(getParentFilePath(normalizedPath));

        const chunks = [];
        let aborted = false;
        let committed = false;
        const stream = new WritableStream({
            write: async (chunk) => chunks.push(await toBytes(chunk)),
            abort: () => {
                aborted = true;
                chunks.length = 0;
            },
        });
        return {
            stream,
            commit: async () => {
                if (aborted) throw new FileSystemError(`Write was aborted: ${normalizedPath}`, {
                    code: 'FILE_WRITE_ABORTED',
                    path: normalizedPath,
                });
                if (committed) return this.stat(normalizedPath);
                throwIfAborted(options.signal);
                this.#assertWritable(normalizedPath);
                this.#assertExpectedVersion(normalizedPath, options.expectedVersion);
                this.#assertFileTarget(normalizedPath);
                if (options.createParents === true) this.#validateParentDirectories(normalizedPath);
                else this.#requireDirectory(getParentFilePath(normalizedPath));
                this.#setFile(normalizedPath, concatenateBytes(chunks), options.mimeType || getMimeType(normalizedPath));
                committed = true;
                return this.stat(normalizedPath);
            },
            abort: async () => {
                aborted = true;
                chunks.length = 0;
            },
        };
    }

    async write(path, blob, options = {}) {
        const opened = await this.openWrite(path, options);
        try {
            await blob.stream().pipeTo(opened.stream, {
                preventClose: true,
                ...(options.signal ? {signal: options.signal} : {}),
            });
            return await opened.commit();
        } catch (error) {
            try {
                await opened.abort(error);
            } catch {
            }
            throw error;
        }
    }

    writeBytesSync(path, value, options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        const bytes = toInitialBytes(value);
        this.#assertWritable(normalizedPath);
        this.#assertExpectedVersion(normalizedPath, options.expectedVersion);
        this.#assertFileTarget(normalizedPath);
        if (options.createParents === true) this.#validateParentDirectories(normalizedPath);
        else this.#requireDirectory(getParentFilePath(normalizedPath));
        this.#setFile(normalizedPath, bytes, options.mimeType || getMimeType(normalizedPath));
        return this.statSync(normalizedPath);
    }

    async createDirectory(path, options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        if (normalizedPath === '') return this.stat('');
        const existing = this.#entries.get(normalizedPath);
        if (existing?.kind === 'file') throw new FileAlreadyExistsError(normalizedPath, {operation: 'createDirectory'});
        if (existing) return this.stat(normalizedPath);
        this.#assertWritable(normalizedPath);
        if (options.recursive === true) this.#createParentDirectories(normalizedPath);
        else this.#requireDirectory(getParentFilePath(normalizedPath));
        this.#entries.set(normalizedPath, directoryRecord());
        return this.stat(normalizedPath);
    }

    async remove(path, options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        if (normalizedPath === '') throw new FileSystemError('Cannot remove the file system root', {
            code: 'INVALID_FILE_OPERATION',
            operation: 'remove',
            path: normalizedPath,
        });
        const entry = this.#entries.get(normalizedPath);
        if (!entry) {
            if (options.force === true) return false;
            throw new FileNotFoundError(normalizedPath);
        }
        if (options.kind === 'file' && entry.kind === 'directory') {
            throw new FileIsDirectoryError(normalizedPath, {operation: 'remove'});
        }
        if (options.kind === 'directory' && entry.kind === 'file') {
            throw new FileNotDirectoryError(normalizedPath, {operation: 'remove'});
        }
        this.#assertExpectedVersion(normalizedPath, options.expectedVersion);
        const descendants = this.#descendantPaths(normalizedPath);
        if (entry.kind === 'directory' && descendants.length > 0 && options.recursive !== true) {
            throw new FileDirectoryNotEmptyError(normalizedPath);
        }
        for (const candidate of [normalizedPath, ...descendants]) this.#assertWritable(candidate);
        for (const candidate of descendants.sort((left, right) => right.length - left.length)) {
            this.#entries.delete(candidate);
        }
        this.#entries.delete(normalizedPath);
        return true;
    }

    async copy(sourcePath, destinationPath, options = {}) {
        throwIfAborted(options.signal);
        const source = normalizeFilePath(sourcePath);
        const destination = normalizeFilePath(destinationPath);
        const state = this.#copyState(source, destination, options);
        this.#entries = state.entries;
        this.#nextVersion = state.nextVersion;
        return this.#entryResult(destination, this.#requireEntry(destination));
    }

    async move(sourcePath, destinationPath, options = {}) {
        throwIfAborted(options.signal);
        const source = normalizeFilePath(sourcePath);
        const destination = normalizeFilePath(destinationPath);
        const sourceEntry = this.#requireEntry(source);
        const sourceExpectedVersion = options.sourceExpectedVersion !== undefined
            ? options.sourceExpectedVersion
            : options.expectedVersion;
        this.#assertExpectedVersion(source, sourceExpectedVersion);
        if (options.destinationExpectedVersion !== undefined && source === destination) {
            this.#assertExpectedVersion(destination, options.destinationExpectedVersion);
        }
        if (source === destination) return this.#entryResult(source, sourceEntry);
        if (source === '') throw new FileSystemError('Cannot move the file system root', {
            code: 'INVALID_FILE_OPERATION',
            operation: 'move',
            path: source,
            destinationPath: destination,
        });

        const sourcePaths = [source, ...this.#descendantPaths(source)];
        for (const path of sourcePaths) this.#assertWritable(path);
        const state = this.#copyState(source, destination, options);
        for (const path of sourcePaths.sort((left, right) => right.length - left.length)) state.entries.delete(path);
        this.#entries = state.entries;
        this.#nextVersion = state.nextVersion;
        return this.#entryResult(destination, this.#requireEntry(destination));
    }

    #addInitialEntry(descriptor) {
        const path = normalizeFilePath(descriptor.path);
        if (path === '' && descriptor.kind !== 'directory') throw new TypeError('The memory file system root must be a directory');
        this.#createParentDirectories(path, {initializing: true});
        const existing = this.#entries.get(path);
        if (existing && path !== '') throw new FileAlreadyExistsError(path);
        if (descriptor.kind === 'directory') {
            this.#entries.set(path, directoryRecord());
        } else if (descriptor.kind === 'file') {
            const version = descriptor.version == null ? this.#newVersion() : descriptor.version;
            this.#trackVersion(version);
            this.#entries.set(path, fileRecord(
                toInitialBytes(descriptor.bytes ?? descriptor.data ?? descriptor.content ?? ''),
                descriptor.mimeType || getMimeType(path),
                version,
            ));
        } else {
            throw new TypeError(`Invalid memory file system entry kind: ${descriptor.kind}`);
        }
        if (descriptor.writable !== undefined) this.#permissions.set(path, Boolean(descriptor.writable));
    }

    #entryResult(path, entry) {
        return {
            path,
            name: getFileName(path),
            kind: entry.kind,
            size: entry.kind === 'file' ? entry.bytes.byteLength : 0,
            mimeType: entry.kind === 'file' ? entry.mimeType : null,
            version: entry.kind === 'file' ? entry.version : null,
        };
    }

    #requireEntry(path) {
        const entry = this.#entries.get(path);
        if (!entry) throw new FileNotFoundError(path);
        return entry;
    }

    #requireDirectory(path) {
        const entry = this.#requireEntry(path);
        if (entry.kind !== 'directory') throw new FileNotDirectoryError(path);
        return entry;
    }

    #assertFileTarget(path) {
        if (this.#entries.get(path)?.kind === 'directory') throw new FileIsDirectoryError(path, {operation: 'write'});
    }

    #assertExpectedVersion(path, expectedVersion) {
        if (expectedVersion === undefined) return;
        const actualVersion = this.#entries.get(path)?.version ?? null;
        if (actualVersion !== expectedVersion) {
            throw new FileConflictError(path, {expectedVersion, actualVersion});
        }
    }

    #setFile(path, bytes, mimeType) {
        this.#assertFileTarget(path);
        this.#createParentDirectories(path);
        this.#entries.set(path, fileRecord(bytes, mimeType, this.#newVersion()));
    }

    #copyState(source, destination, options) {
        if (source === destination) throw new FileAlreadyExistsError(destination, {operation: 'copy'});
        const sourceEntry = this.#requireEntry(source);
        const sourceExpectedVersion = options.sourceExpectedVersion !== undefined
            ? options.sourceExpectedVersion
            : options.expectedVersion;
        this.#assertExpectedVersion(source, sourceExpectedVersion);
        if (sourceEntry.kind === 'directory' && options.recursive !== true) {
            throw new FileUnsupportedError('copyDirectory', {
                message: `Copying a directory requires recursive: true: ${source}`,
                path: source,
            });
        }
        if (sourceEntry.kind === 'directory'
            && (isPathUnder(destination, source) || isPathUnder(source, destination))) {
            throw new FileSystemError(`Cannot copy between overlapping directories: ${source} -> ${destination}`, {
                code: 'INVALID_FILE_OPERATION',
                operation: 'copy',
                path: source,
                destinationPath: destination,
            });
        }

        const destinationEntry = this.#entries.get(destination);
        if (options.destinationExpectedVersion !== undefined) {
            const actualVersion = destinationEntry?.version ?? null;
            if (actualVersion !== options.destinationExpectedVersion) {
                throw new FileConflictError(destination, {
                    expectedVersion: options.destinationExpectedVersion,
                    actualVersion,
                });
            }
        }

        const entries = new Map([...this.#entries].map(([path, entry]) => [path, cloneRecord(entry)]));
        let nextVersion = this.#nextVersion;
        const newVersion = () => `memory-${nextVersion++}`;
        const sourceRecords = [source, ...this.#descendantPaths(source)]
            .sort((left, right) => left.length - right.length)
            .map((path) => ({path, entry: cloneRecord(this.#entries.get(path))}));

        for (const {path, entry} of sourceRecords) {
            const relativePath = path === source ? '' : path.slice(source.length + 1);
            const target = relativePath ? `${destination}/${relativePath}` : destination;
            const existing = entries.get(target);
            if (entry.kind === 'file') {
                if (existing?.kind === 'directory') throw new FileIsDirectoryError(target, {operation: 'copy'});
                if (existing && options.overwrite !== true) throw new FileAlreadyExistsError(target, {operation: 'copy'});
                this.#assertWritable(target);
                this.#ensureParentDirectoriesInState(entries, target);
                entries.set(target, fileRecord(entry.bytes, entry.mimeType, newVersion()));
                continue;
            }

            if (existing?.kind === 'file') {
                if (options.overwrite !== true) throw new FileAlreadyExistsError(target, {operation: 'copy'});
                this.#assertWritableTree(target);
                this.#removeTreeFromState(entries, target);
            }
            if (!entries.has(target)) {
                this.#assertWritable(target);
                this.#ensureParentDirectoriesInState(entries, target);
                entries.set(target, directoryRecord());
            }
        }
        return {entries, nextVersion};
    }

    #createParentDirectories(path, {initializing = false} = {}) {
        const missing = [];
        let parent = getParentFilePath(path);
        while (!this.#entries.has(parent)) {
            missing.push(parent);
            if (parent === '') break;
            parent = getParentFilePath(parent);
        }
        if (this.#entries.get(parent)?.kind !== 'directory') throw new FileNotDirectoryError(parent);
        if (!initializing) this.#assertWritable(path);
        for (const directory of missing.reverse()) this.#entries.set(directory, directoryRecord());
    }

    #validateParentDirectories(path) {
        let parent = getParentFilePath(path);
        while (!this.#entries.has(parent)) {
            if (parent === '') break;
            parent = getParentFilePath(parent);
        }
        if (this.#entries.get(parent)?.kind !== 'directory') throw new FileNotDirectoryError(parent);
    }

    #ensureParentDirectoriesInState(entries, path) {
        const missing = [];
        let parent = getParentFilePath(path);
        while (!entries.has(parent)) {
            missing.push(parent);
            if (parent === '') break;
            parent = getParentFilePath(parent);
        }
        if (entries.get(parent)?.kind !== 'directory') throw new FileNotDirectoryError(parent);
        for (const directory of missing.reverse()) entries.set(directory, directoryRecord());
    }

    #removeTreeFromState(entries, path) {
        for (const candidate of [...entries.keys()]) {
            if (candidate === path || isPathUnder(candidate, path)) entries.delete(candidate);
        }
    }

    #descendantPaths(path) {
        return [...this.#entries.keys()].filter((candidate) => candidate !== path && isPathUnder(candidate, path));
    }

    #isWritable(path) {
        let candidate = normalizeFilePath(path);
        while (true) {
            if (this.#permissions.has(candidate)) return this.#permissions.get(candidate);
            if (candidate === '') return false;
            candidate = getParentFilePath(candidate);
        }
    }

    #assertWritable(path) {
        if (!this.#isWritable(path)) throw new FilePermissionError(path);
    }

    #assertWritableTree(path) {
        this.#assertWritable(path);
        for (const descendant of this.#descendantPaths(path)) this.#assertWritable(descendant);
    }

    #newVersion() {
        return `memory-${this.#nextVersion++}`;
    }

    #trackVersion(version) {
        const match = /^memory-(\d+)$/.exec(String(version || ''));
        if (match) this.#nextVersion = Math.max(this.#nextVersion, Number(match[1]) + 1);
    }
}

function normalizeDescriptors(value, defaultKind) {
    if (Array.isArray(value)) {
        return value.map((entry) => {
            if (typeof entry === 'string') return {path: entry, kind: defaultKind};
            if (!entry || typeof entry !== 'object') throw new TypeError('Memory file system entries must be objects or paths');
            return {...entry, kind: entry.kind || defaultKind};
        });
    }
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).map(([path, entry]) => {
        if (entry
            && typeof entry === 'object'
            && !ArrayBuffer.isView(entry)
            && !(entry instanceof ArrayBuffer)
            && !(entry instanceof Blob)) {
            return {...entry, path, kind: entry.kind || defaultKind};
        }
        return {path, kind: defaultKind, content: entry};
    });
}

function directoryRecord() {
    return {kind: 'directory'};
}

function fileRecord(bytes, mimeType, version) {
    return {kind: 'file', bytes: new Uint8Array(bytes), mimeType, version};
}

function cloneRecord(entry) {
    return entry.kind === 'file' ? fileRecord(entry.bytes, entry.mimeType, entry.version) : directoryRecord();
}

function toInitialBytes(value) {
    if (typeof value === 'string') return new TextEncoder().encode(value);
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    if (value instanceof Blob) throw new TypeError('MemoryProvider initial files must use strings, ArrayBuffers, or typed arrays');
    throw new TypeError('Unsupported initial memory file content');
}

async function toBytes(value) {
    if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
    return toInitialBytes(value);
}

function concatenateBytes(chunks) {
    const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

function throwIfAborted(signal) {
    signal?.throwIfAborted?.();
    if (signal?.aborted) {
        const error = signal.reason instanceof Error ? signal.reason : new Error('Aborted');
        error.name = 'AbortError';
        throw error;
    }
}

export {MemoryProvider};
