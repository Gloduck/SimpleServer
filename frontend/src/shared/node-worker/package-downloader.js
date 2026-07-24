import {gunzipSync} from 'fflate';
import {dependencyStore} from './dependency-store.js';

const DEFAULT_LIMITS = Object.freeze({
    maxMetadataBytes: 5 * 1024 * 1024,
    maxPackageBytes: 20 * 1024 * 1024,
    maxPackageArchiveBytes: 40 * 1024 * 1024,
    maxPackageFileCount: 10_000,
});

class PackageDownloader {
    #fetch;
    #store;
    #registryUrl;
    #limits;
    #signal;
    #metadataRequests = new Map();
    #packageRequests = new Map();

    constructor({
        fetch = globalThis.fetch,
        store = dependencyStore,
        registryUrl = 'https://registry.npmjs.org',
        limits = {},
        signal,
    } = {}) {
        if (typeof fetch !== 'function') throw new TypeError('PackageDownloader requires fetch');
        this.#fetch = fetch.bind(globalThis);
        this.#store = store;
        this.#registryUrl = String(registryUrl || '').replace(/\/+$/, '');
        this.#limits = {...DEFAULT_LIMITS, ...limits};
        this.#signal = signal;
    }

    async download(name, requestedVersion = 'latest', options = {}) {
        const packageName = normalizePackageName(name);
        const signal = options.signal || this.#signal;
        throwIfAborted(signal);
        const metadata = await this.getMetadata(packageName, {signal});
        const version = selectPackageVersion(metadata, requestedVersion);
        const cached = this.#store.getPackage(packageName, version);
        if (cached) return cached;

        const key = `${packageName}@${version}`;
        if (!this.#packageRequests.has(key)) {
            this.#packageRequests.set(key, this.#downloadVersion(packageName, version, metadata, signal));
        }
        try {
            const packageRecord = await this.#packageRequests.get(key);
            return this.#store.getPackage(packageName, version) || packageRecord;
        } finally {
            this.#packageRequests.delete(key);
        }
    }

    async getMetadata(name, options = {}) {
        const packageName = normalizePackageName(name);
        const cached = this.#store.getMetadata(packageName);
        if (cached) return cached;
        if (!this.#metadataRequests.has(packageName)) {
            this.#metadataRequests.set(packageName, this.#fetchMetadata(packageName, options.signal || this.#signal));
        }
        try {
            const metadata = await this.#metadataRequests.get(packageName);
            return this.#store.getMetadata(packageName) || metadata;
        } finally {
            this.#metadataRequests.delete(packageName);
        }
    }

    async #fetchMetadata(name, signal) {
        const url = `${this.#registryUrl}/${encodeURIComponent(name)}`;
        const response = await this.#fetch(url, {
            method: 'GET',
            headers: {Accept: 'application/vnd.npm.install-v1+json, application/json'},
            credentials: 'omit',
            signal,
        });
        assertResponse(response, url);
        const bytes = await readResponseBytes(response, this.#limits.maxMetadataBytes, signal, url);
        let metadata;
        try {
            metadata = JSON.parse(new TextDecoder().decode(bytes));
        } catch (error) {
            throw packageError('INVALID_PACKAGE_METADATA', `Invalid npm metadata: ${name}`, {name, url, cause: error});
        }
        if (!metadata || typeof metadata !== 'object' || !metadata.versions) {
            throw packageError('INVALID_PACKAGE_METADATA', `Invalid npm metadata: ${name}`, {name, url});
        }
        return this.#store.setMetadata(name, metadata);
    }

    async #downloadVersion(name, version, metadata, signal) {
        throwIfAborted(signal);
        const manifest = metadata.versions?.[version];
        const tarballUrl = manifest?.dist?.tarball;
        if (!manifest || typeof tarballUrl !== 'string') {
            throw packageError('PACKAGE_TARBALL_NOT_FOUND', `Package tarball is unavailable: ${name}@${version}`, {name, version});
        }

        const response = await this.#fetch(tarballUrl, {
            method: 'GET',
            credentials: 'omit',
            signal,
        });
        assertResponse(response, tarballUrl);
        const compressed = await readResponseBytes(response, this.#limits.maxPackageBytes, signal, tarballUrl);
        let archive;
        try {
            if (isGzip(compressed)) {
                const advertisedSize = readGzipSize(compressed);
                assertArchiveSize(advertisedSize, this.#limits.maxPackageArchiveBytes, name, version);
            }
            archive = isGzip(compressed) ? gunzipSync(compressed) : compressed;
            assertArchiveSize(archive.byteLength, this.#limits.maxPackageArchiveBytes, name, version);
        } catch (error) {
            if (error?.code) throw error;
            throw packageError('INVALID_PACKAGE_ARCHIVE', `Cannot decompress package: ${name}@${version}`, {
                name,
                version,
                url: tarballUrl,
                cause: error,
            });
        }

        const extracted = extractTarFiles(archive, {
            maxBytes: this.#limits.maxPackageBytes,
            maxFiles: this.#limits.maxPackageFileCount,
            name,
            version,
        });
        const packageJson = extracted.files.find((file) => file.path === 'package.json');
        let extractedManifest = manifest;
        if (packageJson) {
            try {
                extractedManifest = JSON.parse(new TextDecoder().decode(packageJson.content));
            } catch (error) {
                throw packageError('INVALID_PACKAGE_MANIFEST', `Invalid package.json: ${name}@${version}`, {
                    name,
                    version,
                    cause: error,
                });
            }
        }

        return this.#store.setPackage({
            name,
            version,
            manifest: extractedManifest,
            files: extracted.files,
            totalBytes: extracted.totalBytes,
            tarballUrl,
        });
    }
}

async function readResponseBytes(response, maxBytes, signal, url) {
    const declaredSize = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
        throw packageError('PACKAGE_DOWNLOAD_TOO_LARGE', `Download is too large: ${url}`, {
            url,
            size: declaredSize,
            maxSize: maxBytes,
        });
    }

    if (!response.body?.getReader) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        assertSize(bytes.byteLength, maxBytes, url);
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
            assertSize(total, maxBytes, url);
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

function extractTarFiles(bytes, {maxBytes, maxFiles, name, version}) {
    const files = new Map();
    let totalBytes = 0;
    let offset = 0;
    let longPath = '';
    let localPax = {};
    let globalPax = {};

    while (offset + 512 <= bytes.byteLength) {
        const header = bytes.subarray(offset, offset + 512);
        if (isEmptyBlock(header)) break;
        const size = readTarNumber(header, 124, 12);
        const type = String.fromCharCode(header[156] || 0);
        const dataStart = offset + 512;
        const dataEnd = dataStart + size;
        if (dataEnd > bytes.byteLength) {
            throw packageError('INVALID_PACKAGE_ARCHIVE', `Truncated package archive: ${name}@${version}`, {name, version});
        }
        const data = bytes.subarray(dataStart, dataEnd);
        const headerPath = readTarPath(header);

        if (type === 'L') {
            longPath = readNullTerminated(data);
        } else if (type === 'x' || type === 'g') {
            const pax = parsePax(data);
            if (type === 'g') globalPax = {...globalPax, ...pax};
            else localPax = pax;
        } else {
            const archivePath = localPax.path || globalPax.path || longPath || headerPath;
            if (type === '' || type === '\0' || type === '0') {
                const path = normalizeArchivePath(archivePath);
                if (path) {
                    const content = new Uint8Array(data);
                    totalBytes += content.byteLength;
                    if (totalBytes > maxBytes) {
                        throw packageError('PACKAGE_CONTENT_TOO_LARGE', `Extracted package is too large: ${name}@${version}`, {
                            name,
                            version,
                            size: totalBytes,
                            maxSize: maxBytes,
                        });
                    }
                    files.set(path, {path, content});
                    if (files.size > maxFiles) {
                        throw packageError('PACKAGE_FILE_COUNT_EXCEEDED', `Package contains too many files: ${name}@${version}`, {
                            name,
                            version,
                            size: files.size,
                            maxSize: maxFiles,
                        });
                    }
                }
            }
            longPath = '';
            localPax = {};
        }
        offset = dataStart + Math.ceil(size / 512) * 512;
    }

    return {files: [...files.values()].sort((left, right) => left.path.localeCompare(right.path)), totalBytes};
}

function selectPackageVersion(metadata, requestedVersion = 'latest') {
    const requested = String(requestedVersion || 'latest').trim();
    const versions = metadata?.versions || {};
    const exact = requested.replace(/^v(?=\d)/, '');
    if (versions[exact]) return exact;
    const tagged = metadata?.['dist-tags']?.[requested];
    if (tagged && versions[tagged]) return tagged;

    const matches = Object.keys(versions)
        .filter((version) => satisfiesVersion(version, requested))
        .sort(compareVersions)
        .reverse();
    if (matches.length) return matches[0];
    throw packageError('PACKAGE_VERSION_NOT_FOUND', `No matching package version: ${metadata?.name || ''}@${requested}`, {
        name: metadata?.name,
        requestedVersion: requested,
    });
}

function satisfiesVersion(version, range) {
    const parsedVersion = parseVersion(version);
    if (!parsedVersion) return false;
    const requested = String(range || '*').trim();
    if (!requested || requested === '*' || /^latest$/i.test(requested)) return parsedVersion.prerelease.length === 0;
    if (parsedVersion.prerelease.length > 0 && !requested.includes('-')) return false;
    return requested.split(/\s*\|\|\s*/).some((part) => satisfiesRangeSet(parsedVersion, part.trim()));
}

function satisfiesRangeSet(version, range) {
    const hyphen = range.match(/^\s*(\S+)\s+-\s+(\S+)\s*$/);
    if (hyphen) {
        const minimum = partialVersion(hyphen[1], 0);
        const maximum = partialVersion(hyphen[2], Number.MAX_SAFE_INTEGER);
        return minimum && maximum && compareParsedVersions(version, minimum) >= 0 && compareParsedVersions(version, maximum) <= 0;
    }

    const normalized = range.replace(/([<>]=?|[=~^])\s+/g, '$1').trim();
    if (!normalized || normalized === '*') return version.prerelease.length === 0;
    return normalized.split(/\s+/).every((token) => satisfiesComparator(version, token));
}

function satisfiesComparator(version, token) {
    if (!token || token === '*') return true;
    if (token.startsWith('^')) return satisfiesCaret(version, token.slice(1));
    if (token.startsWith('~')) return satisfiesTilde(version, token.slice(1));

    const comparator = token.match(/^(>=|<=|>|<|=)?(.*)$/);
    const operator = comparator[1] || '=';
    const value = comparator[2];
    if (/[xX*]/.test(value) || /^\d+(?:\.\d+)?$/.test(value)) return satisfiesPartial(version, value, operator);
    const expected = parseVersion(value);
    if (!expected) return false;
    const compared = compareParsedVersions(version, expected);
    if (operator === '>') return compared > 0;
    if (operator === '>=') return compared >= 0;
    if (operator === '<') return compared < 0;
    if (operator === '<=') return compared <= 0;
    return compared === 0;
}

function satisfiesCaret(version, value) {
    const minimum = partialVersion(value, 0);
    if (!minimum) return false;
    const parts = String(value).replace(/^v/, '').split('-')[0].split('.');
    let maximum;
    if (minimum.major > 0 || parts.length === 1) maximum = {...minimum, major: minimum.major + 1, minor: 0, patch: 0, prerelease: []};
    else if (minimum.minor > 0 || parts.length === 2) maximum = {...minimum, minor: minimum.minor + 1, patch: 0, prerelease: []};
    else maximum = {...minimum, patch: minimum.patch + 1, prerelease: []};
    return compareParsedVersions(version, minimum) >= 0 && compareParsedVersions(version, maximum) < 0;
}

function satisfiesTilde(version, value) {
    const minimum = partialVersion(value, 0);
    if (!minimum) return false;
    const parts = String(value).replace(/^v/, '').split('.');
    const maximum = parts.length <= 1
        ? {...minimum, major: minimum.major + 1, minor: 0, patch: 0, prerelease: []}
        : {...minimum, minor: minimum.minor + 1, patch: 0, prerelease: []};
    return compareParsedVersions(version, minimum) >= 0 && compareParsedVersions(version, maximum) < 0;
}

function satisfiesPartial(version, value, operator) {
    if (operator !== '=') {
        const expected = partialVersion(value, 0);
        if (!expected) return false;
        return satisfiesComparator(version, `${operator}${expected.major}.${expected.minor}.${expected.patch}`);
    }
    const parts = String(value).replace(/^v/, '').split('.');
    const major = parsePartialNumber(parts[0]);
    const minor = parsePartialNumber(parts[1]);
    const patch = parsePartialNumber(parts[2]);
    if (major == null) return true;
    if (version.major !== major) return false;
    if (minor == null) return true;
    if (version.minor !== minor) return false;
    return patch == null || version.patch === patch;
}

function partialVersion(value, wildcardValue) {
    const source = String(value || '').replace(/^v/, '');
    const [main, prerelease = ''] = source.split('-', 2);
    const parts = main.split('.');
    const major = parsePartialComponent(parts[0], wildcardValue);
    const minor = parsePartialComponent(parts[1], wildcardValue);
    const patch = parsePartialComponent(parts[2], wildcardValue);
    if (![major, minor, patch].every(Number.isFinite)) return null;
    return {major, minor, patch, prerelease: prerelease ? prerelease.split('.') : []};
}

function parsePartialComponent(value, wildcardValue) {
    if (value === undefined || value === '' || /^[xX*]$/.test(value)) return wildcardValue;
    return /^\d+$/.test(value) ? Number(value) : NaN;
}

function parsePartialNumber(value) {
    if (value === undefined || value === '' || /^[xX*]$/.test(value)) return null;
    return /^\d+$/.test(value) ? Number(value) : null;
}

function parseVersion(value) {
    const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
    if (!match) return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] ? match[4].split('.') : [],
    };
}

function compareVersions(left, right) {
    const parsedLeft = parseVersion(left);
    const parsedRight = parseVersion(right);
    if (!parsedLeft && !parsedRight) return left.localeCompare(right);
    if (!parsedLeft) return -1;
    if (!parsedRight) return 1;
    return compareParsedVersions(parsedLeft, parsedRight);
}

function compareParsedVersions(left, right) {
    for (const key of ['major', 'minor', 'patch']) {
        if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
    }
    if (!left.prerelease.length && !right.prerelease.length) return 0;
    if (!left.prerelease.length) return 1;
    if (!right.prerelease.length) return -1;
    const length = Math.max(left.prerelease.length, right.prerelease.length);
    for (let index = 0; index < length; index += 1) {
        const leftValue = left.prerelease[index];
        const rightValue = right.prerelease[index];
        if (leftValue === undefined) return -1;
        if (rightValue === undefined) return 1;
        if (leftValue === rightValue) continue;
        const leftNumber = /^\d+$/.test(leftValue) ? Number(leftValue) : null;
        const rightNumber = /^\d+$/.test(rightValue) ? Number(rightValue) : null;
        if (leftNumber != null && rightNumber != null) return leftNumber < rightNumber ? -1 : 1;
        if (leftNumber != null) return -1;
        if (rightNumber != null) return 1;
        return leftValue < rightValue ? -1 : 1;
    }
    return 0;
}

function readTarPath(header) {
    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    return prefix ? `${prefix}/${name}` : name;
}

function readTarString(bytes, offset, length) {
    return new TextDecoder().decode(bytes.subarray(offset, offset + length)).replace(/\0.*$/, '').trim();
}

function readTarNumber(bytes, offset, length) {
    const field = bytes.subarray(offset, offset + length);
    if (field[0] & 0x80) {
        let value = field[0] & 0x7f;
        for (let index = 1; index < field.length; index += 1) value = value * 256 + field[index];
        return value;
    }
    const value = readTarString(bytes, offset, length).replace(/\s/g, '');
    return value ? parseInt(value, 8) || 0 : 0;
}

function parsePax(bytes) {
    const result = {};
    let offset = 0;
    while (offset < bytes.byteLength) {
        let space = offset;
        while (space < bytes.byteLength && bytes[space] !== 0x20) space += 1;
        if (space >= bytes.byteLength) break;
        const length = Number(new TextDecoder().decode(bytes.subarray(offset, space)));
        if (!Number.isFinite(length) || length <= 0 || offset + length > bytes.byteLength) break;
        const record = new TextDecoder().decode(bytes.subarray(space + 1, offset + length)).replace(/\n$/, '');
        const separator = record.indexOf('=');
        if (separator !== -1) result[record.slice(0, separator)] = record.slice(separator + 1);
        offset += length;
    }
    return result;
}

function normalizeArchivePath(value) {
    let path = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
    if (path === 'package') return '';
    if (path.startsWith('package/')) path = path.slice('package/'.length);
    if (!path || path.startsWith('/') || /^[A-Za-z]:\//.test(path)) return '';
    const parts = path.split('/').filter((part) => part && part !== '.');
    if (!parts.length || parts.some((part) => part === '..' || part.includes('\0'))) return '';
    return parts.join('/');
}

function readNullTerminated(bytes) {
    return new TextDecoder().decode(bytes).replace(/\0.*$/, '').replace(/\n$/, '');
}

function isEmptyBlock(bytes) {
    for (const value of bytes) if (value !== 0) return false;
    return true;
}

function isGzip(bytes) {
    return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function readGzipSize(bytes) {
    if (bytes.byteLength < 4) return 0;
    const offset = bytes.byteLength - 4;
    return bytes[offset]
        + bytes[offset + 1] * 0x100
        + bytes[offset + 2] * 0x10000
        + bytes[offset + 3] * 0x1000000;
}

function assertArchiveSize(size, maxSize, name, version) {
    if (size > maxSize) {
        throw packageError('PACKAGE_ARCHIVE_TOO_LARGE', `Package archive is too large: ${name}@${version}`, {
            name,
            version,
            size,
            maxSize,
        });
    }
}

function assertResponse(response, url) {
    if (!response?.ok) {
        throw packageError('PACKAGE_DOWNLOAD_FAILED', `Package request failed: ${response?.status || 0}`, {
            url,
            status: response?.status || 0,
        });
    }
}

function assertSize(size, maxSize, url) {
    if (size > maxSize) throw packageError('PACKAGE_DOWNLOAD_TOO_LARGE', `Download is too large: ${url}`, {url, size, maxSize});
}

function throwIfAborted(signal) {
    if (signal?.aborted) throw signal.reason || new DOMException('The operation was aborted', 'AbortError');
}

function normalizePackageName(value) {
    const name = String(value || '').trim();
    if (!/^(?:@[a-z0-9._~-]+\/[a-z0-9._~-]+|[a-z0-9._~-]+)$/i.test(name)) {
        throw packageError('INVALID_PACKAGE_NAME', `Invalid package name: ${name}`, {name});
    }
    return name;
}

function packageError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

export {
    PackageDownloader,
    compareVersions,
    satisfiesVersion,
    selectPackageVersion,
};
