import {getTextByteLength} from '../file-utils.js';
import {FileTooLargeError} from './file-system-errors.js';

const MEBIBYTE = 1024 * 1024;

class FileOperationPolicy {
    constructor({
        maxMemoryReadBytes = 50 * MEBIBYTE,
        maxMemoryWriteBytes = 50 * MEBIBYTE,
        maxListEntries = 1000,
        maxWalkEntries = 3000,
    } = {}) {
        this.maxMemoryReadBytes = normalizeNonNegativeNumber(maxMemoryReadBytes, 'maxMemoryReadBytes');
        this.maxMemoryWriteBytes = normalizeNonNegativeNumber(maxMemoryWriteBytes, 'maxMemoryWriteBytes');
        this.maxListEntries = normalizePositiveInteger(maxListEntries, 'maxListEntries');
        this.maxWalkEntries = normalizePositiveInteger(maxWalkEntries, 'maxWalkEntries');
    }

    getTextSize(value) {
        return getTextByteLength(value);
    }

    assertMemoryRead(path, size) {
        this.#assertSize(path, size, this.maxMemoryReadBytes, 'memory read');
    }

    assertMemoryWrite(path, size) {
        this.#assertSize(path, size, this.maxMemoryWriteBytes, 'memory write');
    }

    normalizeListLimit(limit, maximum = this.maxListEntries) {
        const normalizedMaximum = normalizePositiveInteger(maximum, 'maximum');
        if (limit === undefined || limit === null) return normalizedMaximum;
        const normalizedLimit = normalizePositiveInteger(limit, 'limit');
        return Math.min(normalizedLimit, normalizedMaximum);
    }

    #assertSize(path, size, maxSize, operation) {
        if (Number.isFinite(size) && size > maxSize) {
            throw new FileTooLargeError(path, {size, maxSize, operation});
        }
    }
}

function normalizeNonNegativeNumber(value, name) {
    if (value === Infinity) return value;
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative number`);
    return value;
}

function normalizePositiveInteger(value, name) {
    if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
    return value;
}

export {FileOperationPolicy};
