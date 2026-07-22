import {FileUnsupportedError} from './file-system-errors.js';

/**
 * @typedef {Object} FileSystemOperationOptions
 * @property {AbortSignal} [signal]
 * @property {boolean} [writable]
 * @property {boolean} [request]
 * @property {number} [limit]
 * @property {string|null} [expectedVersion]
 * @property {string} [mimeType]
 * @property {string} [message]
 * @property {boolean} [createParents]
 * @property {boolean} [recursive]
 * @property {boolean} [overwrite]
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
    move: false,
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
    async move(sourcePath, destinationPath, options = {}) {
        throw unsupported('move', sourcePath);
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

export {DEFAULT_FILE_SYSTEM_CAPABILITIES, FileSystemProvider};
