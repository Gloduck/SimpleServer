import {
    getFileName,
    getMimeType,
    getParentFilePath,
    isPathUnder,
    joinFilePath,
    normalizeFilePath,
} from '../../file-utils.js';
import {FileSystemProvider} from '../file-system-provider.js';
import {
    FileConflictError,
    FileNotFoundError,
    FilePermissionError,
    FileSystemError,
    FileUnsupportedError,
} from '../file-system-errors.js';

class BrowserHandleProvider extends FileSystemProvider {
    #root;

    constructor({root, handle, directoryHandle} = {}) {
        super();
        root ||= handle || directoryHandle;
        if (!root || root.kind !== 'directory') throw new TypeError('BrowserHandleProvider requires a FileSystemDirectoryHandle');
        this.#root = root;
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
            removeFile: true,
            removeDirectory: true,
            recursiveRemove: true,
            copyTargetValidation: true,
            move: false,
            optimisticLocking: true,
            versionPrecondition: 'best-effort',
        };
    }

    async checkAccess(path = '', options = {}) {
        const {writable = false, request = false} = options;
        throwIfAborted(options.signal);
        const mode = writable ? 'readwrite' : 'read';
        const method = request ? 'requestPermission' : 'queryPermission';
        if (typeof this.#root[method] !== 'function') return true;
        const permission = await this.#root[method]({mode});
        if (permission !== 'granted') throw new FilePermissionError(normalizeFilePath(path), {permission});
        return true;
    }

    async isCopyDestinationInside(sourcePath, destinationProvider, destinationPath, options = {}) {
        throwIfAborted(options.signal);
        if (!(destinationProvider instanceof BrowserHandleProvider)) return false;
        const normalizedSourcePath = normalizeFilePath(sourcePath);
        const normalizedDestinationPath = normalizeFilePath(destinationPath);
        try {
            if (typeof this.#root.resolve === 'function') {
                const destinationRootPath = await this.#root.resolve(destinationProvider.#root);
                if (Array.isArray(destinationRootPath)) {
                    const resolvedDestinationPath = joinFilePath(...destinationRootPath, normalizedDestinationPath);
                    if (isPathUnder(resolvedDestinationPath, normalizedSourcePath)) return true;
                }
            }

            const source = await this.#getDirectory(normalizedSourcePath);
            let candidatePath = normalizedDestinationPath;
            let destination = null;
            while (!destination) {
                try {
                    destination = await destinationProvider.#getDirectory(candidatePath);
                } catch (error) {
                    if (!isMissingOrWrongKind(error)) throw error;
                    const parentPath = getParentFilePath(candidatePath);
                    if (parentPath === candidatePath) return false;
                    candidatePath = parentPath;
                }
            }
            return typeof source.resolve === 'function' && Array.isArray(await source.resolve(destination));
        } catch (error) {
            if (isMissingOrWrongKind(error)) return false;
            throw translateHandleError(error, normalizedSourcePath);
        }
    }

    async isSameFileTarget(path, target, options = {}) {
        throwIfAborted(options.signal);
        if (!target || target.kind !== 'file' || typeof target.isSameEntry !== 'function') return false;
        const normalizedPath = normalizeFilePath(path);
        try {
            const parent = await this.#getDirectory(getParentFilePath(normalizedPath));
            const source = await parent.getFileHandle(getFileName(normalizedPath));
            return Boolean(await target.isSameEntry(source));
        } catch (error) {
            if (isMissingOrWrongKind(error)) return false;
            throw translateHandleError(error, normalizedPath);
        }
    }

    async stat(path = '', options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        if (normalizedPath === '') {
            return {path: '', name: this.#root.name || '', kind: 'directory', size: 0, mimeType: null, version: null};
        }

        try {
            const handle = await this.#getEntry(normalizedPath);
            if (handle.kind === 'directory') {
                return {path: normalizedPath, name: handle.name, kind: 'directory', size: 0, mimeType: null, version: null};
            }
            const file = await handle.getFile();
            return fileEntry(normalizedPath, file);
        } catch (error) {
            throw translateHandleError(error, normalizedPath);
        }
    }

    async list(path = '', options = {}) {
        const {limit = Infinity} = options;
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        try {
            const directory = await this.#getDirectory(normalizedPath);
            const entries = [];
            for await (const [name, handle] of directory.entries()) {
                const entryPath = joinFilePath(normalizedPath, name);
                if (handle.kind === 'directory') {
                    entries.push({path: entryPath, name, kind: 'directory', size: 0, mimeType: null, version: null});
                } else {
                    entries.push(fileEntry(entryPath, await handle.getFile()));
                }
            }
            return entries
                .sort((left, right) => left.name.localeCompare(right.name))
                .slice(0, limit);
        } catch (error) {
            if (error?.name === 'TypeMismatchError') {
                throw new FileUnsupportedError('list', {path: normalizedPath, cause: error});
            }
            throw translateHandleError(error, normalizedPath);
        }
    }

    async openRead(path, options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        try {
            const parent = await this.#getDirectory(getParentFilePath(normalizedPath));
            const handle = await parent.getFileHandle(getFileName(normalizedPath));
            const file = await handle.getFile();
            return {
                ...fileEntry(normalizedPath, file),
                blob: file,
                stream: file.stream(),
            };
        } catch (error) {
            if (error?.name === 'TypeMismatchError') {
                throw new FileUnsupportedError('openRead', {path: normalizedPath, cause: error});
            }
            throw translateHandleError(error, normalizedPath);
        }
    }

    async openWrite(path, options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        await this.#checkExpectedVersion(normalizedPath, options.expectedVersion);

        let writable;
        try {
            const parent = await this.#getDirectory(getParentFilePath(normalizedPath), options.createParents === true);
            const handle = await parent.getFileHandle(getFileName(normalizedPath), {create: true});
            writable = await handle.createWritable();
            return {
                stream: writable,
                commit: async () => {
                    try {
                        await writable.close();
                        return await this.stat(normalizedPath);
                    } catch (error) {
                        throw translateHandleError(error, normalizedPath);
                    }
                },
                abort: async (reason) => {
                    if (typeof writable.abort === 'function') await writable.abort(reason);
                },
            };
        } catch (error) {
            if (writable && typeof writable.abort === 'function') {
                try {
                    await writable.abort(error);
                } catch {
                }
            }
            throw translateHandleError(error, normalizedPath);
        }
    }

    async createDirectory(path, options = {}) {
        const {recursive = false} = options;
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        if (normalizedPath === '') return this.stat('');
        try {
            if (recursive) {
                await this.#getDirectory(normalizedPath, true);
            } else {
                const parent = await this.#getDirectory(getParentFilePath(normalizedPath));
                await parent.getDirectoryHandle(getFileName(normalizedPath), {create: true});
            }
            return this.stat(normalizedPath);
        } catch (error) {
            throw translateHandleError(error, normalizedPath);
        }
    }

    async remove(path, options = {}) {
        throwIfAborted(options.signal);
        const normalizedPath = normalizeFilePath(path);
        if (normalizedPath === '') throw new FileSystemError('Cannot remove the file system root', {
            code: 'INVALID_FILE_PATH',
            path: normalizedPath,
        });
        await this.#checkExpectedVersion(normalizedPath, options.expectedVersion);
        try {
            const parent = await this.#getDirectory(getParentFilePath(normalizedPath));
            await parent.removeEntry(getFileName(normalizedPath), {recursive: options.recursive === true});
            return true;
        } catch (error) {
            throw translateHandleError(error, normalizedPath);
        }
    }

    async #getDirectory(path, create = false) {
        let directory = this.#root;
        for (const name of normalizeFilePath(path).split('/').filter(Boolean)) {
            directory = await directory.getDirectoryHandle(name, {create});
        }
        return directory;
    }

    async #getEntry(path) {
        const parent = await this.#getDirectory(getParentFilePath(path));
        const name = getFileName(path);
        try {
            return await parent.getFileHandle(name);
        } catch (error) {
            if (!isMissingOrWrongKind(error)) throw error;
        }
        return parent.getDirectoryHandle(name);
    }

    async #checkExpectedVersion(path, expectedVersion) {
        let exists = true;
        let actualVersion = null;
        try {
            actualVersion = (await this.stat(path)).version;
        } catch (error) {
            if (error?.code !== FileNotFoundError.code) throw error;
            exists = false;
        }
        if (expectedVersion !== undefined && expectedVersion !== actualVersion) {
            throw new FileConflictError(path, {expectedVersion, actualVersion});
        }
        return {exists, version: actualVersion};
    }
}

function fileEntry(path, file) {
    return {
        path,
        name: getFileName(path),
        kind: 'file',
        size: file.size,
        mimeType: file.type || getMimeType(path),
        version: `${file.lastModified}:${file.size}`,
        lastModified: file.lastModified,
    };
}

function isMissingOrWrongKind(error) {
    return error?.name === 'NotFoundError' || error?.name === 'TypeMismatchError';
}

function translateHandleError(error, path) {
    if (error instanceof FileSystemError) return error;
    if (error?.name === 'NotFoundError') return new FileNotFoundError(path, {cause: error});
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        return new FilePermissionError(path, {cause: error});
    }
    return new FileSystemError(error?.message || `File system operation failed: ${path}`, {
        code: 'FILE_SYSTEM_ERROR',
        path,
        cause: error,
    });
}

function throwIfAborted(signal) {
    signal?.throwIfAborted?.();
    if (signal?.aborted) {
        const error = signal.reason instanceof Error ? signal.reason : new Error('Aborted');
        error.name = 'AbortError';
        throw error;
    }
}

export {BrowserHandleProvider};
