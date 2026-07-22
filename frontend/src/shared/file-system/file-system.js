import {
    blobToText,
    getFileName,
    joinFilePath,
    normalizeFilePath,
    streamToBlob,
    textToBlob,
    toBlob,
    withBlobType,
} from '../file-utils.js';
import {FileOperationPolicy} from './file-operation-policy.js';
import {FileSystemError} from './file-system-errors.js';
import {DEFAULT_FILE_SYSTEM_CAPABILITIES, FileSystemProvider} from './file-system-provider.js';

class FileSystem {
    #provider;

    constructor({provider, policy = new FileOperationPolicy()} = {}) {
        if (!(provider instanceof FileSystemProvider)) {
            throw new TypeError('FileSystem requires a FileSystemProvider');
        }
        this.#provider = provider;
        this.policy = policy;
    }

    async checkAccess(path = '', options = {}) {
        const normalizedPath = normalizeFilePath(path);
        return this.#provider.checkAccess(normalizedPath, providerOptions(options));
    }

    getCapabilities() {
        return Object.freeze({
            ...DEFAULT_FILE_SYSTEM_CAPABILITIES,
            ...this.#provider.getCapabilities(),
        });
    }

    supports(capability) {
        return Boolean(this.getCapabilities()[capability]);
    }

    async getResourceUrl(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const resource = await this.#provider.getResourceUrl(normalizedPath, providerOptions(options));
        if (resource === null) return null;
        if (!resource || typeof resource.url !== 'string') throw invalidProviderResponse('getResourceUrl', normalizedPath);
        return {
            url: resource.url,
            mimeType: resource.mimeType || 'application/octet-stream',
            size: Number.isFinite(resource.size) ? resource.size : undefined,
            version: resource.version ?? null,
        };
    }

    async stat(path = '', options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const entry = await this.#provider.stat(normalizedPath, providerOptions(options));
        return normalizeEntry(entry, normalizedPath);
    }

    async list(path = '', options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const limit = this.policy.normalizeListLimit(options.limit);
        const result = await this.#provider.list(normalizedPath, {...providerOptions(options), limit});
        if (!Array.isArray(result)) throw invalidProviderResponse('list', normalizedPath);
        return result
            .slice(0, limit)
            .map((entry) => normalizeEntry(entry, joinFilePath(normalizedPath, entry.name || '')));
    }

    async walk(path = '', options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const limit = this.policy.normalizeListLimit(options.limit, this.policy.maxWalkEntries);
        const entries = [];
        const directories = [normalizedPath];

        while (directories.length > 0 && entries.length < limit) {
            const directory = directories.shift();
            const children = await this.list(directory, {
                ...options,
                limit: Math.min(this.policy.maxListEntries, limit - entries.length),
            });
            for (const child of children) {
                entries.push(child);
                if (isDirectory(child)) directories.push(child.path);
                if (entries.length >= limit) break;
            }
        }
        return entries;
    }

    async openRead(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const opened = await this.#provider.openRead(normalizedPath, providerOptions(options));
        if (!opened || typeof opened !== 'object') throw invalidProviderResponse('openRead', normalizedPath);
        const entry = normalizeEntry({...opened, kind: 'file'}, normalizedPath, 'file');
        const stream = opened.stream || opened.blob?.stream?.();
        if (!(stream instanceof ReadableStream)) throw invalidProviderResponse('openRead.stream', normalizedPath);
        return {
            ...entry,
            kind: 'file',
            size: Number.isFinite(opened.size) ? opened.size : opened.blob?.size ?? entry.size,
            mimeType: opened.mimeType || opened.blob?.type || entry.mimeType || 'application/octet-stream',
            ...(opened.blob ? {blob: opened.blob} : {}),
            stream,
        };
    }

    async readBlob(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const opened = await this.openRead(normalizedPath, options);
        this.policy.assertMemoryRead(normalizedPath, opened.size);
        const blob = opened.blob || await streamToBlob(opened.stream);
        this.policy.assertMemoryRead(normalizedPath, blob.size);
        return withBlobType(blob, opened.mimeType);
    }

    async readText(path, options = {}) {
        const blob = await this.readBlob(path, options);
        return blobToText(blob);
    }

    async openWrite(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const opened = await this.#provider.openWrite(normalizedPath, providerOptions(options));
        if (!opened?.stream || typeof opened.commit !== 'function' || typeof opened.abort !== 'function') {
            throw invalidProviderResponse('openWrite', normalizedPath);
        }
        return {
            path: normalizedPath,
            stream: opened.stream,
            commit: async () => normalizeEntry(await opened.commit(), normalizedPath, 'file'),
            abort: (reason) => opened.abort(reason),
        };
    }

    async writeBlob(path, value, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const blob = toBlob(value, options.mimeType);
        this.policy.assertMemoryWrite(normalizedPath, blob.size);

        const result = await this.#provider.write(normalizedPath, blob, {
            ...providerOptions(options),
            mimeType: options.mimeType || blob.type || 'application/octet-stream',
        });
        return normalizeEntry(result, normalizedPath, 'file');
    }

    async writeText(path, value, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const text = String(value);
        const size = this.policy.getTextSize(text);
        this.policy.assertMemoryWrite(normalizedPath, size);
        return this.writeBlob(normalizedPath, textToBlob(text, options.mimeType || 'text/plain;charset=utf-8'), options);
    }

    async writeStream(path, source, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const stream = source instanceof ReadableStream ? source : source?.stream?.();
        if (!(stream instanceof ReadableStream)) throw new TypeError('writeStream requires a ReadableStream or stream source');

        if (!this.supports('streamingWrite')) {
            if (Number.isFinite(options.size)) this.policy.assertMemoryWrite(normalizedPath, options.size);
            const blob = await streamToBlob(stream, options.mimeType);
            return this.writeBlob(normalizedPath, blob, options);
        }

        const opened = await this.openWrite(normalizedPath, options);
        try {
            await stream.pipeTo(opened.stream, {
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

    async createDirectory(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        return normalizeEntry(
            await this.#provider.createDirectory(normalizedPath, providerOptions(options)),
            normalizedPath,
            'directory',
        );
    }

    async remove(path, options = {}) {
        return this.#provider.remove(normalizeFilePath(path), providerOptions(options));
    }

    async move(sourcePath, destinationPath, options = {}) {
        const normalizedDestination = normalizeFilePath(destinationPath);
        return normalizeEntry(
            await this.#provider.move(
                normalizeFilePath(sourcePath),
                normalizedDestination,
                providerOptions(options),
            ),
            normalizedDestination,
        );
    }

    async isCopyDestinationInside(sourcePath, destinationFileSystem, destinationPath, options = {}) {
        if (!(destinationFileSystem instanceof FileSystem)) throw new TypeError('destinationFileSystem must be a FileSystem');
        return this.#provider.isCopyDestinationInside(
            normalizeFilePath(sourcePath),
            destinationFileSystem.#provider,
            normalizeFilePath(destinationPath),
            providerOptions(options),
        );
    }

    async isSameFileTarget(path, target, options = {}) {
        return this.#provider.isSameFileTarget(
            normalizeFilePath(path),
            target,
            providerOptions(options),
        );
    }
}

function normalizeEntry(entry, fallbackPath, expectedKind) {
    if (!entry || typeof entry !== 'object') throw invalidProviderResponse('entry', fallbackPath);
    const path = normalizeFilePath(entry.path === undefined ? fallbackPath : entry.path);
    const kind = entry.kind || expectedKind;
    if (kind !== 'file' && kind !== 'directory') throw invalidProviderResponse('entry.kind', path);
    if (expectedKind && kind !== expectedKind) throw invalidProviderResponse(`entry.${expectedKind}`, path);
    return {
        path,
        name: entry.name || getFileName(path),
        kind,
        size: kind === 'directory' ? 0 : Number(entry.size) || 0,
        mimeType: kind === 'directory' ? null : entry.mimeType || 'application/octet-stream',
        version: entry.version ?? null,
    };
}

function isDirectory(entry) {
    return entry.kind === 'directory';
}

function providerOptions(options = {}) {
    const {view, baseEntry, createOnly, adoptBase, ...result} = options;
    return result;
}

function invalidProviderResponse(operation, path) {
    return new FileSystemError(`Invalid provider response for ${operation}: ${path}`, {
        code: 'INVALID_PROVIDER_RESPONSE',
        operation,
        path,
    });
}

export {FileSystem};
