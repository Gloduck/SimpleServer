import {
    isPathUnder,
    joinFilePath,
    normalizeFilePath,
    streamToBlob,
} from '../file-utils.js';
import {
    FileAlreadyExistsError,
    FileConflictError,
    FileIsDirectoryError,
    FileNotDirectoryError,
    FileNotFoundError,
    FileSystemError,
    FileUnsupportedError,
} from './file-system-errors.js';

/**
 * @typedef {Object} FileSystemOperationOptions
 * @property {AbortSignal} [signal]
 * @property {boolean} [writable]
 * @property {boolean} [request]
 * @property {number} [limit]
 * @property {string|null} [expectedVersion]
 * @property {string|null} [sourceExpectedVersion]
 * @property {string|null} [destinationExpectedVersion]
 * @property {string} [mimeType]
 * @property {string} [message]
 * @property {boolean} [createParents]
 * @property {boolean} [recursive]
 * @property {boolean} [overwrite]
 * @property {boolean} [force]
 * @property {'file'|'directory'} [kind]
 * @property {number} [size]
 */

/**
 * @typedef {Object} FileEntry
 * @property {string} path
 * @property {string} name
 * @property {'file'|'directory'} kind
 * @property {number} size
 * @property {string|null} mimeType
 * @property {string|null} version
 */

/**
 * @typedef {FileEntry & {kind: 'file', stream: ReadableStream, blob?: Blob}} OpenedFileRead
 */

/**
 * @typedef {Object} OpenedFileWrite
 * @property {WritableStream} stream
 * @property {() => Promise<FileEntry>} commit
 * @property {(reason?: unknown) => Promise<void>} abort
 */

const DEFAULT_FILE_SYSTEM_CAPABILITIES = Object.freeze({
    read: false,
    write: false,
    streamingRead: false,
    streamingWrite: false,
    directories: false,
    createDirectory: false,
    emptyDirectories: false,
    implicitDirectories: false,
    removeFile: false,
    removeDirectory: false,
    recursiveRemove: false,
    copy: false,
    copyDirectory: false,
    move: false,
    moveDirectory: false,
    atomicMove: false,
    resourceUrl: false,
    copyTargetValidation: false,
    optimisticLocking: false,
    versionPrecondition: 'none',
    requiresExpectedVersionForUpdate: false,
    requiresExpectedVersionForDelete: false,
});

class FileSystemProvider {
    /** @param {string} path @param {FileSystemOperationOptions} options */
    async checkAccess(path = '', options = {}) {
        return true;
    }

    /** @returns {Readonly<typeof DEFAULT_FILE_SYSTEM_CAPABILITIES>} */
    getCapabilities() {
        return DEFAULT_FILE_SYSTEM_CAPABILITIES;
    }

    /** @param {string} path @param {FileSystemOperationOptions} options @returns {Promise<FileEntry>} */
    async stat(path = '', options = {}) {
        throw unsupported('stat', path);
    }

    /** @param {string} path @param {FileSystemOperationOptions} options @returns {Promise<FileEntry[]>} */
    async list(path = '', options = {}) {
        throw unsupported('list', path);
    }

    /** @param {string} path @param {FileSystemOperationOptions} options */
    async getResourceUrl(path, options = {}) {
        return null;
    }

    /** @param {string} path @param {FileSystemOperationOptions} options @returns {Promise<OpenedFileRead>} */
    async openRead(path, options = {}) {
        throw unsupported('openRead', path);
    }

    /** @param {string} path @param {FileSystemOperationOptions} options @returns {Promise<OpenedFileWrite>} */
    async openWrite(path, options = {}) {
        throw unsupported('openWrite', path);
    }

    /** @param {string} path @param {Blob} blob @param {FileSystemOperationOptions} options @returns {Promise<FileEntry>} */
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

    /** @param {string} path @param {FileSystemOperationOptions} options @returns {Promise<FileEntry>} */
    async createDirectory(path, options = {}) {
        throw unsupported('createDirectory', path);
    }

    /** @param {string} path @param {FileSystemOperationOptions} options @returns {Promise<boolean>} */
    async remove(path, options = {}) {
        throw unsupported('remove', path);
    }

    /** @param {string} sourcePath @param {string} destinationPath @param {FileSystemOperationOptions} options @returns {Promise<FileEntry>} */
    async copy(sourcePath, destinationPath, options = {}) {
        const source = normalizeFilePath(sourcePath);
        const destination = normalizeFilePath(destinationPath);
        throwIfAborted(options.signal);
        if (source === destination) throw new FileAlreadyExistsError(destination, {operation: 'copy'});

        const sourceEntry = await this.stat(source, options);
        assertExpectedVersion(
            source,
            sourceEntry.version,
            selectExpectedVersion(options.sourceExpectedVersion, options.expectedVersion),
        );
        if (sourceEntry.kind === 'directory' && this.getCapabilities().copyDirectory !== true) {
            throw new FileUnsupportedError('copyDirectory', {path: source});
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
        return copyEntry(this, sourceEntry, destination, options, true);
    }

    /** @param {string} sourcePath @param {string} destinationPath @param {FileSystemOperationOptions} options @returns {Promise<FileEntry>} */
    async move(sourcePath, destinationPath, options = {}) {
        const source = normalizeFilePath(sourcePath);
        const destination = normalizeFilePath(destinationPath);
        throwIfAborted(options.signal);
        const sourceEntry = await this.stat(source, options);
        const sourceExpectedVersion = selectExpectedVersion(options.sourceExpectedVersion, options.expectedVersion);
        assertExpectedVersion(source, sourceEntry.version, sourceExpectedVersion);
        if (options.destinationExpectedVersion !== undefined && source === destination) {
            assertExpectedVersion(destination, sourceEntry.version, options.destinationExpectedVersion);
        }
        if (source === destination) return sourceEntry;
        if (source === '') {
            throw new FileSystemError('Cannot move the file system root', {
                code: 'INVALID_FILE_OPERATION',
                operation: 'move',
                path: source,
                destinationPath: destination,
            });
        }

        if (sourceEntry.kind === 'directory' && this.getCapabilities().moveDirectory !== true) {
            throw new FileUnsupportedError('moveDirectory', {path: source});
        }
        const sourceManifest = sourceEntry.kind === 'directory'
            ? await collectEntryTree(this, sourceEntry, options)
            : [sourceEntry];
        const copied = await this.copy(source, destination, {
            ...options,
            sourceExpectedVersion,
        });
        if (sourceEntry.kind === 'directory') {
            const currentManifest = await collectEntryTree(this, await this.stat(source, options), options);
            assertManifestUnchanged(source, sourceManifest, currentManifest);
            await removeManifest(this, sourceManifest, options);
        } else {
            await this.remove(source, {
                ...copyMutationOptions(options),
                expectedVersion: sourceExpectedVersion !== undefined ? sourceExpectedVersion : sourceEntry.version,
                kind: 'file',
            });
        }
        return copied;
    }

    /** @param {string} sourcePath @param {FileSystemProvider} destinationProvider @param {string} destinationPath @param {FileSystemOperationOptions} options */
    async isCopyDestinationInside(sourcePath, destinationProvider, destinationPath, options = {}) {
        return false;
    }

    /** @param {string} path @param {unknown} target @param {FileSystemOperationOptions} options */
    async isSameFileTarget(path, target, options = {}) {
        return false;
    }
}

function unsupported(operation, path) {
    return new FileUnsupportedError(operation, {path});
}

async function copyEntry(provider, sourceEntry, destinationPath, options, root) {
    throwIfAborted(options.signal);
    const destinationEntry = await optionalStat(provider, destinationPath, options);
    const destinationExpectedVersion = root ? options.destinationExpectedVersion : undefined;
    if (destinationExpectedVersion !== undefined) {
        assertExpectedVersion(destinationPath, destinationEntry?.version ?? null, destinationExpectedVersion);
    }

    if (sourceEntry.kind === 'file') {
        if (destinationEntry?.kind === 'directory') {
            throw new FileIsDirectoryError(destinationPath, {operation: 'copy'});
        }
        if (destinationEntry && options.overwrite !== true) {
            throw new FileAlreadyExistsError(destinationPath, {operation: 'copy'});
        }

        const opened = await provider.openRead(sourceEntry.path, options);
        if (opened.version !== undefined && opened.version !== sourceEntry.version) {
            throw new FileConflictError(sourceEntry.path, {
                expectedVersion: sourceEntry.version,
                actualVersion: opened.version,
            });
        }
        const blob = opened.blob || await streamToBlob(opened.stream, opened.mimeType || sourceEntry.mimeType || '');
        return provider.write(destinationPath, blob, {
            ...copyMutationOptions(options),
            createParents: true,
            expectedVersion: destinationEntry?.version ?? null,
            mimeType: opened.mimeType || sourceEntry.mimeType || blob.type,
        });
    }

    if (options.recursive !== true) {
        throw new FileUnsupportedError('copyDirectory', {
            path: sourceEntry.path,
            message: `Copying a directory requires recursive: true: ${sourceEntry.path}`,
        });
    }
    if (destinationEntry?.kind === 'file') {
        if (options.overwrite !== true) throw new FileAlreadyExistsError(destinationPath, {operation: 'copy'});
        await provider.remove(destinationPath, {
            ...copyMutationOptions(options),
            expectedVersion: destinationEntry.version,
            kind: 'file',
        });
    }

    const capabilities = provider.getCapabilities();
    const destinationDirectoryExists = destinationEntry?.kind === 'directory';
    if (!destinationDirectoryExists && capabilities.createDirectory) {
        await provider.createDirectory(destinationPath, {...copyMutationOptions(options), recursive: true});
    } else if (!destinationDirectoryExists && !capabilities.implicitDirectories) {
        throw new FileUnsupportedError('copyDirectory', {path: destinationPath});
    }

    const children = await provider.list(sourceEntry.path, {...options, limit: Infinity});
    if (children.length === 0 && !destinationDirectoryExists && !capabilities.createDirectory) {
        throw new FileUnsupportedError('copyEmptyDirectory', {path: sourceEntry.path});
    }
    for (const child of children) {
        await copyEntry(provider, child, joinFilePath(destinationPath, child.name), {
            ...options,
            sourceExpectedVersion: undefined,
            destinationExpectedVersion: undefined,
            expectedVersion: undefined,
        }, false);
    }
    return provider.stat(destinationPath, options);
}

async function optionalStat(provider, path, options) {
    try {
        return await provider.stat(path, options);
    } catch (error) {
        if (error?.code === FileNotFoundError.code) return null;
        throw error;
    }
}

async function collectEntryTree(provider, rootEntry, options) {
    const result = [rootEntry];
    const directories = rootEntry.kind === 'directory' ? [rootEntry] : [];
    while (directories.length > 0) {
        throwIfAborted(options.signal);
        const directory = directories.shift();
        const children = await provider.list(directory.path, {...options, limit: Infinity});
        for (const child of children) {
            result.push(child);
            if (child.kind === 'directory') directories.push(child);
        }
    }
    return result;
}

function assertManifestUnchanged(path, expected, actual) {
    const summarize = (entries) => entries
        .map((entry) => `${entry.path}\0${entry.kind}\0${entry.version ?? ''}`)
        .sort();
    const expectedSummary = summarize(expected);
    const actualSummary = summarize(actual);
    if (expectedSummary.length !== actualSummary.length
        || expectedSummary.some((value, index) => value !== actualSummary[index])) {
        throw new FileConflictError(path, {
            message: `Source changed while moving: ${path}`,
            expectedEntries: expectedSummary,
            actualEntries: actualSummary,
        });
    }
}

async function removeManifest(provider, manifest, options) {
    const capabilities = provider.getCapabilities();
    const entries = [...manifest].sort((left, right) => {
        const depthDifference = pathDepth(right.path) - pathDepth(left.path);
        if (depthDifference !== 0) return depthDifference;
        if (left.kind !== right.kind) return left.kind === 'file' ? -1 : 1;
        return right.path.localeCompare(left.path);
    });
    for (const entry of entries) {
        throwIfAborted(options.signal);
        if (entry.kind === 'directory' && !capabilities.removeDirectory) continue;
        await provider.remove(entry.path, {
            ...copyMutationOptions(options),
            expectedVersion: entry.version,
            kind: entry.kind,
        });
    }
}

function assertExpectedVersion(path, actualVersion, expectedVersion) {
    if (expectedVersion !== undefined && expectedVersion !== actualVersion) {
        throw new FileConflictError(path, {expectedVersion, actualVersion});
    }
}

function selectExpectedVersion(primary, fallback) {
    return primary !== undefined ? primary : fallback;
}

function pathDepth(path) {
    return path ? path.split('/').length : 0;
}

function copyMutationOptions(options) {
    const {
        expectedVersion,
        sourceExpectedVersion,
        destinationExpectedVersion,
        limit,
        overwrite,
        recursive,
        kind,
        ...result
    } = options;
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

export {DEFAULT_FILE_SYSTEM_CAPABILITIES, FileSystemProvider};
