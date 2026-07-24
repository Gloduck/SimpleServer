const DEFAULT_LIMITS = Object.freeze({
    maxEntryCount: 100,
    maxTotalBytes: 20 * 1024 * 1024,
    lruEntryCount: 50,
    lruTotalBytes: 10 * 1024 * 1024,
    cleanupIntervalMs: 60_000,
});

class DependencyStore {
    #entries = new Map();
    #order = 0;
    #totalBytes = 0;
    #limits;
    #cleanupTimer = 0;

    constructor({limits = {}} = {}) {
        this.#limits = normalizeLimits({...DEFAULT_LIMITS, ...limits});
        this.#startCleanupTimer();
    }

    getMetadata(name) {
        return this.#get(metadataKey(name));
    }

    setMetadata(name, metadata) {
        return this.#set(metadataKey(name), 'metadata', metadata, getValueSize(metadata));
    }

    getPackage(name, version) {
        return this.#get(packageKey(name, version));
    }

    setPackage(packageRecord) {
        const name = normalizePackageName(packageRecord?.name);
        const version = normalizeVersion(packageRecord?.version);
        const normalized = {...packageRecord, name, version};
        delete normalized.source;
        const size = Number.isFinite(normalized.totalBytes) ? normalized.totalBytes : getPackageSize(normalized);
        return this.#set(packageKey(name, version), 'package', normalized, size);
    }

    getPackageVersions(name) {
        const normalizedName = normalizePackageName(name);
        const result = [];
        for (const entry of this.#entries.values()) {
            if (entry.type !== 'package') continue;
            if (entry.value.name !== normalizedName) continue;
            this.#touch(entry);
            result.push(entry.value);
        }
        return result;
    }

    getRemoteModule(url) {
        return this.#get(remoteKey(url));
    }

    setRemoteModule(url, moduleRecord) {
        const normalizedUrl = normalizeUrl(url);
        const normalized = {...moduleRecord, url: normalizedUrl};
        return this.#set(remoteKey(normalizedUrl), 'remote', normalized, getRemoteModuleSize(normalized));
    }

    cleanup() {
        if (this.#entries.size <= this.#limits.lruEntryCount && this.#totalBytes <= this.#limits.lruTotalBytes) return;
        this.#evictTo(this.#limits.lruEntryCount, this.#limits.lruTotalBytes);
    }

    getStats() {
        const result = {
            entryCount: this.#entries.size,
            totalBytes: this.#totalBytes,
            metadataCount: 0,
            packageCount: 0,
            remoteModuleCount: 0,
        };
        for (const entry of this.#entries.values()) {
            if (entry.type === 'metadata') result.metadataCount += 1;
            else if (entry.type === 'package') result.packageCount += 1;
            else if (entry.type === 'remote') result.remoteModuleCount += 1;
        }
        return result;
    }

    clear() {
        this.#entries.clear();
        this.#totalBytes = 0;
    }

    dispose() {
        if (this.#cleanupTimer) clearInterval(this.#cleanupTimer);
        this.#cleanupTimer = 0;
        this.clear();
    }

    #get(key) {
        const entry = this.#entries.get(key);
        if (!entry) return undefined;
        this.#touch(entry);
        return entry.value;
    }

    #set(key, type, value, size) {
        const normalizedSize = Math.max(0, Number(size) || 0);
        if (normalizedSize > this.#limits.maxTotalBytes) {
            throw storeError('DEPENDENCY_ENTRY_TOO_LARGE', 'Dependency cache entry exceeds the maximum size', {
                size: normalizedSize,
                maxSize: this.#limits.maxTotalBytes,
            });
        }
        const previous = this.#entries.get(key);
        if (previous) this.#totalBytes -= previous.size;
        const entry = {key, type, value, size: normalizedSize, order: ++this.#order};
        this.#entries.set(key, entry);
        this.#totalBytes += normalizedSize;
        this.#evictTo(this.#limits.maxEntryCount, this.#limits.maxTotalBytes, key);
        return value;
    }

    #touch(entry) {
        entry.order = ++this.#order;
    }

    #evictTo(maxCount, maxBytes, protectedKey = '') {
        while (this.#entries.size > maxCount || this.#totalBytes > maxBytes) {
            let candidate;
            for (const entry of this.#entries.values()) {
                if (entry.key === protectedKey) continue;
                if (!candidate || entry.order < candidate.order) candidate = entry;
            }
            if (!candidate) break;
            this.#entries.delete(candidate.key);
            this.#totalBytes -= candidate.size;
        }
    }

    #startCleanupTimer() {
        if (!this.#limits.cleanupIntervalMs) return;
        this.#cleanupTimer = setInterval(() => this.cleanup(), this.#limits.cleanupIntervalMs);
        this.#cleanupTimer?.unref?.();
    }
}

function normalizeLimits(limits) {
    const maxEntryCount = normalizeLimit(limits.maxEntryCount, 'maxEntryCount', 1);
    const maxTotalBytes = normalizeLimit(limits.maxTotalBytes, 'maxTotalBytes', 1);
    const lruEntryCount = normalizeLimit(limits.lruEntryCount, 'lruEntryCount', 0);
    const lruTotalBytes = normalizeLimit(limits.lruTotalBytes, 'lruTotalBytes', 0);
    const cleanupIntervalMs = normalizeLimit(limits.cleanupIntervalMs, 'cleanupIntervalMs', 0);
    if (lruEntryCount > maxEntryCount || lruTotalBytes > maxTotalBytes) {
        throw new RangeError('DependencyStore LRU limits must not exceed maximum limits');
    }
    return {maxEntryCount, maxTotalBytes, lruEntryCount, lruTotalBytes, cleanupIntervalMs};
}

function normalizeLimit(value, name, minimum) {
    const result = Number(value);
    if (!Number.isFinite(result) || result < minimum) throw new RangeError(`${name} must be at least ${minimum}`);
    return Math.floor(result);
}

function metadataKey(name) {
    return `metadata\0${normalizePackageName(name)}`;
}

function packageKey(name, version) {
    return `package\0${normalizePackageName(name)}@${normalizeVersion(version)}`;
}

function remoteKey(url) {
    return `remote\0${normalizeUrl(url)}`;
}

function normalizePackageName(value) {
    const name = String(value || '').trim();
    if (!name) throw new TypeError('Package name is required');
    return name;
}

function normalizeVersion(value) {
    const version = String(value || '').trim();
    if (!version) throw new TypeError('Package version is required');
    return version;
}

function normalizeUrl(value) {
    return new URL(String(value || '')).href;
}

function getPackageSize(packageRecord) {
    return (packageRecord.files || []).reduce((total, file) => total + getValueSize(file.content), 0);
}

function getRemoteModuleSize(moduleRecord) {
    if (Number.isFinite(moduleRecord.size)) return moduleRecord.size;
    return getValueSize(moduleRecord.source ?? moduleRecord.content);
}

function getValueSize(value) {
    if (typeof value === 'string') return new TextEncoder().encode(value).byteLength;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
    if (value == null) return 0;
    try {
        return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    } catch {
        return 0;
    }
}

function storeError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

const dependencyStore = new DependencyStore();

export {DependencyStore, dependencyStore};
