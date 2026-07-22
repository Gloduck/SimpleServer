import {normalizeFilePath} from '../file-utils.js';
import {FileUnsupportedError} from './file-system-errors.js';

class FileResourceResolver {
    #resources = new Map();
    #sourceIds = new WeakMap();
    #nextSourceId = 1;
    #disposed = false;

    constructor() {
    }

    async acquire(path, {source, view = 'effective'} = {}) {
        if (this.#disposed) throw new FileUnsupportedError('acquire', {message: 'FileResourceResolver has been disposed'});
        if (!source) throw new TypeError('acquire requires a session or fileSystem');
        const normalizedPath = normalizeFilePath(path);
        const directResource = await source.getResourceUrl(normalizedPath, {view});
        if (directResource?.url) {
            return {
                url: directResource.url,
                mimeType: directResource.mimeType || 'application/octet-stream',
                size: directResource.size,
                release: () => {},
            };
        }
        if (typeof globalThis.URL?.createObjectURL !== 'function' || typeof globalThis.URL?.revokeObjectURL !== 'function') {
            throw new FileUnsupportedError('createObjectURL', {
                message: 'Object URLs are not supported in this environment',
            });
        }

        const sourceId = this.#getSourceId(source);
        const sourceView = view;
        const key = `${sourceId}:${sourceView}:${normalizedPath}`;
        let holder = this.#resources.get(key);
        if (!holder) {
            holder = {
                references: 0,
                revoked: false,
            };
            holder.promise = (async () => {
                const blob = await source.readBlob(normalizedPath, {view});
                const resource = {
                    url: globalThis.URL.createObjectURL(blob),
                    mimeType: blob.type || 'application/octet-stream',
                    size: blob.size,
                };
                if (this.#disposed) {
                    globalThis.URL.revokeObjectURL(resource.url);
                    throw new FileUnsupportedError('acquire', {message: 'FileResourceResolver has been disposed'});
                }
                holder.resource = resource;
                return resource;
            })();
            this.#resources.set(key, holder);
        }

        let resource;
        try {
            resource = await holder.promise;
        } catch (error) {
            if (this.#resources.get(key) === holder) this.#resources.delete(key);
            throw error;
        }
        holder.references += 1;

        let released = false;
        return {
            url: resource.url,
            mimeType: resource.mimeType,
            size: resource.size,
            release: () => {
                if (released) return;
                released = true;
                holder.references -= 1;
                if (holder.references === 0 && !holder.revoked) {
                    globalThis.URL.revokeObjectURL(resource.url);
                    holder.revoked = true;
                    if (this.#resources.get(key) === holder) this.#resources.delete(key);
                }
            },
        };
    }

    invalidate(path, {source, view = 'effective'} = {}) {
        if (!source) throw new TypeError('invalidate requires a session or fileSystem');
        const normalizedPath = normalizeFilePath(path);
        const sourceId = this.#getSourceId(source);
        const sourceView = view;
        const key = `${sourceId}:${sourceView}:${normalizedPath}`;
        const holder = this.#resources.get(key);
        if (!holder) return false;

        this.#resources.delete(key);
        if (holder.resource && holder.references === 0 && !holder.revoked) {
            globalThis.URL.revokeObjectURL(holder.resource.url);
            holder.revoked = true;
        }
        return true;
    }

    dispose() {
        for (const holder of this.#resources.values()) {
            if (holder.resource && !holder.revoked) {
                globalThis.URL.revokeObjectURL(holder.resource.url);
                holder.revoked = true;
            }
        }
        this.#resources.clear();
        this.#disposed = true;
    }

    #getSourceId(source) {
        let id = this.#sourceIds.get(source);
        if (!id) {
            id = this.#nextSourceId++;
            this.#sourceIds.set(source, id);
        }
        return id;
    }
}

export {FileResourceResolver};
