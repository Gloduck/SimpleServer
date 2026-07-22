import {getFileName, isPathUnder, normalizeFilePath} from './file-path.js';

class FileChangeSet {
    constructor(changes = []) {
        this.changes = new Map();
        for (const change of changes) this.changes.set(normalizeFilePath(change.path), {...change});
    }

    get(path) {
        return this.changes.get(normalizeFilePath(path));
    }

    has(path) {
        return this.changes.has(normalizeFilePath(path));
    }

    stageText(path, value, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const text = String(value);
        const size = new Blob([text]).size;
        return this.#stage(normalizedPath, 'text', text, size, options);
    }

    stageBlob(path, value, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const blob = value instanceof Blob ? value : new Blob([value], {type: options.mimeType});
        return this.#stage(normalizedPath, 'blob', blob, blob.size, {
            ...options,
            mimeType: options.mimeType || blob.type || undefined,
        });
    }

    stageDelete(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const current = this.changes.get(normalizedPath);
        if (current?.status === 'created') {
            this.changes.delete(normalizedPath);
            return undefined;
        }

        const change = {
            path: normalizedPath,
            name: getFileName(normalizedPath),
            status: 'deleted',
            dataType: null,
            value: null,
            size: 0,
            mimeType: options.mimeType || current?.mimeType || 'application/octet-stream',
            baseVersion: options.baseVersion !== undefined ? options.baseVersion : current?.baseVersion,
            baseSize: options.baseSize !== undefined ? options.baseSize : current?.baseSize,
        };
        this.changes.set(normalizedPath, change);
        return change;
    }

    remove(path) {
        return this.changes.delete(normalizeFilePath(path));
    }

    list() {
        return [...this.changes.values()].sort((left, right) => left.path.localeCompare(right.path));
    }

    listUnder(path) {
        const normalizedPath = normalizeFilePath(path);
        return this.list().filter((change) => isPathUnder(change.path, normalizedPath));
    }

    clear() {
        this.changes.clear();
    }

    #stage(path, dataType, value, size, options) {
        const current = this.changes.get(path);
        const baseVersion = options.baseVersion !== undefined ? options.baseVersion : current?.baseVersion;
        const baseSize = options.baseSize !== undefined ? options.baseSize : current?.baseSize;
        const change = {
            path,
            name: getFileName(path),
            status: options.status || current?.status || (baseVersion === null ? 'created' : 'modified'),
            dataType,
            value,
            size,
            mimeType: options.mimeType || current?.mimeType || (dataType === 'text' ? 'text/plain;charset=utf-8' : 'application/octet-stream'),
            baseVersion,
            baseSize,
        };
        this.changes.set(path, change);
        return change;
    }
}

export {FileChangeSet};
