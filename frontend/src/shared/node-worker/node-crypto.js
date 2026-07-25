import {blake2b, blake2s} from '@noble/hashes/blake2.js';
import {hkdf as nobleHkdf} from '@noble/hashes/hkdf.js';
import {hmac as nobleHmac} from '@noble/hashes/hmac.js';
import {md5, ripemd160, sha1} from '@noble/hashes/legacy.js';
import {pbkdf2 as noblePbkdf2, pbkdf2Async as noblePbkdf2Async} from '@noble/hashes/pbkdf2.js';
import {scrypt as nobleScrypt, scryptAsync as nobleScryptAsync} from '@noble/hashes/scrypt.js';
import {sha224, sha256, sha384, sha512, sha512_224, sha512_256} from '@noble/hashes/sha2.js';
import {sha3_224, sha3_256, sha3_384, sha3_512, shake128, shake256} from '@noble/hashes/sha3.js';
import {cbc, cfb, ctr, ecb, gcm} from '@noble/ciphers/aes.js';
import {chacha20poly1305} from '@noble/ciphers/chacha.js';
import {p256, p384, p521} from '@noble/curves/nist.js';
import {secp256k1} from '@noble/curves/secp256k1.js';

if (!globalThis.process) {
    Object.defineProperty(globalThis, 'process', {
        configurable: true,
        writable: true,
        value: {
            argv: [],
            browser: true,
            env: {},
            pid: 0,
            title: 'browser',
            version: '',
            versions: {},
            cwd: () => '/',
            nextTick: (callback, ...args) => queueMicrotask(() => callback(...args)),
        },
    });
}

globalThis.global ||= globalThis;

const HASH_DEFINITIONS = new Map([
    ['md5', md5],
    ['sha1', sha1],
    ['sha224', sha224],
    ['sha256', sha256],
    ['sha384', sha384],
    ['sha512', sha512],
    ['sha512-224', sha512_224],
    ['sha512-256', sha512_256],
    ['sha3-224', sha3_224],
    ['sha3-256', sha3_256],
    ['sha3-384', sha3_384],
    ['sha3-512', sha3_512],
    ['shake128', shake128],
    ['shake256', shake256],
    ['ripemd160', ripemd160],
    ['blake2b512', blake2b],
    ['blake2s256', blake2s],
]);
const HASH_ALIASES = new Map([
    ['sha-1', 'sha1'],
    ['sha-224', 'sha224'],
    ['sha-256', 'sha256'],
    ['sha-384', 'sha384'],
    ['sha-512', 'sha512'],
    ['sha512/224', 'sha512-224'],
    ['sha-512/224', 'sha512-224'],
    ['sha512/256', 'sha512-256'],
    ['sha-512/256', 'sha512-256'],
    ['rmd160', 'ripemd160'],
]);
const HASH_NAMES = Object.freeze([...HASH_DEFINITIONS.keys()]);
const CIPHER_NAMES = Object.freeze([
    'aes-128-cbc', 'aes-192-cbc', 'aes-256-cbc',
    'aes-128-ctr', 'aes-192-ctr', 'aes-256-ctr',
    'aes-128-cfb', 'aes-192-cfb', 'aes-256-cfb',
    'aes-128-ecb', 'aes-192-ecb', 'aes-256-ecb',
    'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm',
    'chacha20-poly1305',
]);
const CURVE_DEFINITIONS = new Map([
    ['secp256k1', {name: 'secp256k1', curve: secp256k1}],
    ['prime256v1', {name: 'prime256v1', curve: p256}],
    ['secp256r1', {name: 'prime256v1', curve: p256}],
    ['p-256', {name: 'prime256v1', curve: p256}],
    ['secp384r1', {name: 'secp384r1', curve: p384}],
    ['p-384', {name: 'secp384r1', curve: p384}],
    ['secp521r1', {name: 'secp521r1', curve: p521}],
    ['p-521', {name: 'secp521r1', curve: p521}],
]);
const CURVE_NAMES = Object.freeze(['prime256v1', 'secp256k1', 'secp384r1', 'secp521r1']);
const WEB_CRYPTO_RANDOM_CHUNK_SIZE = 65_536;
const MAX_SCRYPT_MEMORY = 64 * 1024 * 1024;

function createCryptoModule(Buffer) {
    const webcrypto = globalThis.crypto;

    class Hash {
        constructor(algorithm, options = {}, instance = null) {
            const definition = getHashDefinition(algorithm);
            this.algorithm = definition.name;
            this._definition = definition;
            this._hash = instance || createHashInstance(definition.hash, options);
            if (instance) applyHashOutputLength(this._hash, definition.hash, options);
            this._digested = false;
        }

        update(data, inputEncoding) {
            ensureNotFinalized(this, 'Hash');
            this._hash.update(toBytes(Buffer, data, inputEncoding));
            return this;
        }

        digest(encoding) {
            ensureNotFinalized(this, 'Hash');
            this._digested = true;
            return formatBytes(Buffer, this._hash.digest(), encoding);
        }

        copy(options = {}) {
            ensureNotFinalized(this, 'Hash');
            return new Hash(this.algorithm, options, this._hash.clone());
        }
    }

    class Hmac {
        constructor(algorithm, key, options = {}) {
            const definition = getHashDefinition(algorithm, {allowXof: false});
            this.algorithm = definition.name;
            this._hmac = nobleHmac.create(definition.hash, toBytes(Buffer, key, options?.encoding));
            this._digested = false;
        }

        update(data, inputEncoding) {
            ensureNotFinalized(this, 'Hmac');
            this._hmac.update(toBytes(Buffer, data, inputEncoding));
            return this;
        }

        digest(encoding) {
            ensureNotFinalized(this, 'Hmac');
            this._digested = true;
            return formatBytes(Buffer, this._hmac.digest(), encoding);
        }
    }

    class Cipheriv extends BufferedCipher {
        constructor(algorithm, key, iv, options = {}) {
            super(Buffer, algorithm, key, iv, options, false);
        }
    }

    class Decipheriv extends BufferedCipher {
        constructor(algorithm, key, iv, options = {}) {
            super(Buffer, algorithm, key, iv, options, true);
        }
    }

    class ECDH {
        constructor(curveName) {
            this._definition = getCurveDefinition(curveName);
            this._privateKey = null;
        }

        generateKeys(encoding, format = 'uncompressed') {
            this._privateKey = Buffer.from(this._definition.curve.utils.randomSecretKey());
            return formatBytes(Buffer, this._publicKey(format), encoding);
        }

        computeSecret(otherPublicKey, inputEncoding, outputEncoding) {
            this._requirePrivateKey();
            const publicKey = normalizePublicKey(Buffer, otherPublicKey, inputEncoding);
            const sharedPoint = this._definition.curve.getSharedSecret(this._privateKey, publicKey, true);
            return formatBytes(Buffer, sharedPoint.subarray(1), outputEncoding);
        }

        getPrivateKey(encoding) {
            this._requirePrivateKey();
            return formatBytes(Buffer, minimalPrivateKey(Buffer, this._privateKey), encoding);
        }

        getPublicKey(encoding, format = 'uncompressed') {
            this._requirePrivateKey();
            return formatBytes(Buffer, this._publicKey(format), encoding);
        }

        setPrivateKey(privateKey, encoding) {
            this._privateKey = normalizePrivateKey(Buffer, this._definition, privateKey, encoding);
            return this;
        }

        _publicKey(format) {
            const normalizedFormat = normalizePointFormat(format);
            const point = this._definition.curve.getPublicKey(this._privateKey, normalizedFormat === 'compressed');
            return normalizedFormat === 'hybrid' ? toHybridPoint(Buffer.from(point)) : point;
        }

        _requirePrivateKey() {
            if (!this._privateKey) throw cryptoError('ERR_CRYPTO_OPERATION_FAILED', 'No private key has been configured');
        }

        static convertKey(key, curveName, inputEncoding, outputEncoding, format = 'uncompressed') {
            const definition = getCurveDefinition(curveName);
            const point = definition.curve.Point.fromBytes(normalizePublicKey(Buffer, key, inputEncoding));
            const normalizedFormat = normalizePointFormat(format);
            const result = point.toBytes(normalizedFormat === 'compressed');
            return formatBytes(Buffer, normalizedFormat === 'hybrid' ? toHybridPoint(Buffer.from(result)) : result, outputEncoding);
        }
    }

    const randomBytes = (size, callback) => runOptionalCallback(callback, () => {
        const length = validateSize(size, 'size');
        return Buffer.from(fillRandomBytes(webcrypto, new Uint8Array(length)));
    });
    const randomFillSync = (buffer, offset = 0, size) => {
        const target = writableRandomTarget(buffer);
        const start = validateOffset(offset, target.length);
        const length = size === undefined ? target.length - start : validateSize(size, 'size');
        if (start + length > target.length) throw new RangeError('offset + size exceeds buffer length');
        const byteStart = start * target.bytesPerElement;
        const byteLength = length * target.bytesPerElement;
        fillRandomBytes(webcrypto, target.bytes.subarray(byteStart, byteStart + byteLength));
        return buffer;
    };
    const randomFill = (buffer, offset, size, callback) => {
        if (typeof offset === 'function') {
            callback = offset;
            offset = 0;
            size = undefined;
        } else if (typeof size === 'function') {
            callback = size;
            size = undefined;
        }
        requireCallback(callback);
        queueMicrotask(() => {
            try {
                callback(null, randomFillSync(buffer, offset, size));
            } catch (error) {
                callback(error);
            }
        });
    };
    const randomInt = (min, max, callback) => {
        if (typeof max === 'function') {
            callback = max;
            max = min;
            min = 0;
        } else if (max === undefined) {
            max = min;
            min = 0;
        }
        return runOptionalCallback(callback, () => secureRandomInt(webcrypto, min, max));
    };
    const randomUUID = () => {
        if (typeof webcrypto?.randomUUID === 'function') return webcrypto.randomUUID();
        const bytes = fillRandomBytes(webcrypto, new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };
    const pbkdf2Sync = (password, salt, iterations, keyLength, digest) => Buffer.from(noblePbkdf2(
        getHashDefinition(digest, {allowXof: false}).hash,
        toBytes(Buffer, password),
        toBytes(Buffer, salt),
        {c: validatePositiveInteger(iterations, 'iterations'), dkLen: validateSize(keyLength, 'keylen', {allowZero: false})},
    ));
    const pbkdf2 = (password, salt, iterations, keyLength, digest, callback) => {
        requireCallback(callback);
        const operation = noblePbkdf2Async(
            getHashDefinition(digest, {allowXof: false}).hash,
            toBytes(Buffer, password),
            toBytes(Buffer, salt),
            {c: validatePositiveInteger(iterations, 'iterations'), dkLen: validateSize(keyLength, 'keylen', {allowZero: false})},
        );
        operation.then((value) => callback(null, Buffer.from(value)), callback);
    };
    const hkdfSync = (digest, inputKeyMaterial, salt, info, keyLength) => toArrayBuffer(nobleHkdf(
        getHashDefinition(digest, {allowXof: false}).hash,
        toBytes(Buffer, inputKeyMaterial),
        toBytes(Buffer, salt),
        toBytes(Buffer, info),
        validateSize(keyLength, 'keylen'),
    ));
    const hkdf = (digest, inputKeyMaterial, salt, info, keyLength, callback) => {
        requireCallback(callback);
        queueMicrotask(() => {
            try {
                callback(null, hkdfSync(digest, inputKeyMaterial, salt, info, keyLength));
            } catch (error) {
                callback(error);
            }
        });
    };
    const scryptSync = (password, salt, keyLength, options = {}) => Buffer.from(nobleScrypt(
        toBytes(Buffer, password),
        toBytes(Buffer, salt),
        normalizeScryptOptions(options, keyLength),
    ));
    const scrypt = (password, salt, keyLength, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        requireCallback(callback);
        nobleScryptAsync(
            toBytes(Buffer, password),
            toBytes(Buffer, salt),
            normalizeScryptOptions(options, keyLength),
        ).then((value) => callback(null, Buffer.from(value)), callback);
    };

    return {
        webcrypto,
        subtle: webcrypto?.subtle,
        constants: Object.freeze({}),
        Hash,
        Hmac,
        Cipheriv,
        Decipheriv,
        ECDH,
        createHash: (algorithm, options) => new Hash(algorithm, options),
        createHmac: (algorithm, key, options) => new Hmac(algorithm, key, options),
        createCipheriv: (algorithm, key, iv, options) => new Cipheriv(algorithm, key, iv, options),
        createDecipheriv: (algorithm, key, iv, options) => new Decipheriv(algorithm, key, iv, options),
        createECDH: (curveName) => new ECDH(curveName),
        getHashes: () => [...HASH_NAMES],
        getCiphers: () => [...CIPHER_NAMES],
        getCurves: () => [...CURVE_NAMES],
        getCipherInfo: (algorithm) => getCipherInfo(algorithm),
        getRandomValues: (typedArray) => requireWebCrypto(webcrypto).getRandomValues(typedArray),
        randomBytes,
        randomFill,
        randomFillSync,
        randomInt,
        randomUUID,
        timingSafeEqual: (left, right) => timingSafeEqual(Buffer, left, right),
        pbkdf2,
        pbkdf2Sync,
        hkdf,
        hkdfSync,
        scrypt,
        scryptSync,
    };
}

class BufferedCipher {
    constructor(Buffer, algorithm, key, iv, options, decrypt) {
        this._Buffer = Buffer;
        this._definition = parseCipherDefinition(algorithm);
        this._key = Buffer.from(toBytes(Buffer, key));
        this._iv = iv == null ? null : Buffer.from(toBytes(Buffer, iv));
        this._decrypt = decrypt;
        this._chunks = [];
        this._aadChunks = [];
        this._authTag = null;
        this._autoPadding = true;
        this._finalized = false;
        this._updated = false;
        this._authTagLength = Number(options?.authTagLength || 16);
        validateCipherParameters(this._definition, this._key, this._iv, this._authTagLength);
    }

    update(data, inputEncoding, outputEncoding) {
        ensureNotFinalized(this, 'Cipher');
        if (typeof data !== 'string' && outputEncoding === undefined && typeof inputEncoding === 'string') {
            outputEncoding = inputEncoding;
            inputEncoding = undefined;
        }
        this._updated = true;
        this._chunks.push(this._Buffer.from(toBytes(this._Buffer, data, inputEncoding)));
        return formatBytes(this._Buffer, new Uint8Array(), outputEncoding);
    }

    final(outputEncoding) {
        ensureNotFinalized(this, 'Cipher');
        this._finalized = true;
        return formatBytes(this._Buffer, runBufferedCipher(this), outputEncoding);
    }

    setAAD(value) {
        ensureNotFinalized(this, 'Cipher');
        if (!this._definition.authenticated) throw cryptoError('ERR_CRYPTO_INVALID_STATE', 'setAAD is only available for authenticated ciphers');
        if (this._updated) throw cryptoError('ERR_CRYPTO_INVALID_STATE', 'setAAD must be called before update');
        this._aadChunks.push(this._Buffer.from(toBytes(this._Buffer, value)));
        return this;
    }

    setAuthTag(value) {
        ensureNotFinalized(this, 'Cipher');
        if (!this._decrypt || !this._definition.authenticated) throw cryptoError('ERR_CRYPTO_INVALID_STATE', 'setAuthTag is only available on authenticated decipher instances');
        const tag = this._Buffer.from(toBytes(this._Buffer, value));
        if (tag.byteLength !== this._authTagLength) throw new RangeError(`Authentication tag must be ${this._authTagLength} bytes`);
        this._authTag = tag;
        return this;
    }

    getAuthTag() {
        if (this._decrypt || !this._definition.authenticated || !this._finalized || !this._authTag) {
            throw cryptoError('ERR_CRYPTO_INVALID_STATE', 'Authentication tag is not available');
        }
        return this._Buffer.from(this._authTag);
    }

    setAutoPadding(value = true) {
        ensureNotFinalized(this, 'Cipher');
        this._autoPadding = Boolean(value);
        return this;
    }
}

function runBufferedCipher(cipher) {
    const Buffer = cipher._Buffer;
    const input = Buffer.concat(cipher._chunks);
    const definition = cipher._definition;
    const aad = cipher._aadChunks.length ? Buffer.concat(cipher._aadChunks) : undefined;
    let codec;
    if (definition.family === 'aes') {
        if (definition.mode === 'cbc') codec = cbc(cipher._key, cipher._iv, {disablePadding: !cipher._autoPadding});
        else if (definition.mode === 'ctr') codec = ctr(cipher._key, cipher._iv);
        else if (definition.mode === 'cfb') codec = cfb(cipher._key, cipher._iv);
        else if (definition.mode === 'ecb') codec = ecb(cipher._key, {disablePadding: !cipher._autoPadding});
        else codec = gcm(cipher._key, cipher._iv, aad);
    } else {
        codec = chacha20poly1305(cipher._key, cipher._iv, aad);
    }

    if (!definition.authenticated) return Buffer.from(cipher._decrypt ? codec.decrypt(input) : codec.encrypt(input));
    if (cipher._decrypt) {
        if (!cipher._authTag) throw cryptoError('ERR_CRYPTO_INVALID_STATE', 'Authentication tag must be set before final()');
        return Buffer.from(codec.decrypt(Buffer.concat([input, cipher._authTag])));
    }
    const encrypted = Buffer.from(codec.encrypt(input));
    cipher._authTag = encrypted.subarray(encrypted.byteLength - cipher._authTagLength);
    return encrypted.subarray(0, encrypted.byteLength - cipher._authTagLength);
}

function parseCipherDefinition(algorithm) {
    const name = String(algorithm || '').trim().toLowerCase();
    if (name === 'chacha20-poly1305') {
        return {name, family: 'chacha', mode: 'stream', keyLength: 32, ivLength: 12, authenticated: true, blockSize: undefined};
    }
    const match = /^aes-(128|192|256)-(cbc|ctr|cfb|ecb|gcm)$/.exec(name);
    if (!match) throw cryptoError('ERR_CRYPTO_UNKNOWN_CIPHER', `Unknown cipher: ${algorithm}`);
    const mode = match[2];
    return {
        name,
        family: 'aes',
        mode,
        keyLength: Number(match[1]) / 8,
        ivLength: mode === 'ecb' ? undefined : mode === 'gcm' ? 12 : 16,
        authenticated: mode === 'gcm',
        blockSize: mode === 'cbc' || mode === 'ecb' ? 16 : 1,
    };
}

function validateCipherParameters(definition, key, iv, authTagLength) {
    if (key.byteLength !== definition.keyLength) throw new RangeError(`${definition.name} requires a ${definition.keyLength}-byte key`);
    if (definition.mode === 'ecb') {
        if (iv && iv.byteLength) throw new RangeError(`${definition.name} does not use an IV`);
    } else if (definition.mode === 'gcm') {
        if (!iv || iv.byteLength < 8) throw new RangeError(`${definition.name} requires an IV of at least 8 bytes`);
    } else if (!iv || iv.byteLength !== definition.ivLength) {
        throw new RangeError(`${definition.name} requires a ${definition.ivLength}-byte IV`);
    }
    if (definition.authenticated && authTagLength !== 16) throw new RangeError(`${definition.name} supports only 16-byte authentication tags`);
}

function cipherInfo(definition) {
    const result = {
        name: definition.name,
        keyLength: definition.keyLength,
        mode: definition.mode,
    };
    if (definition.blockSize !== undefined) result.blockSize = definition.blockSize;
    if (definition.ivLength !== undefined) result.ivLength = definition.ivLength;
    return Object.freeze(result);
}

function getCipherInfo(algorithm) {
    try {
        return cipherInfo(parseCipherDefinition(algorithm));
    } catch (error) {
        if (error?.code === 'ERR_CRYPTO_UNKNOWN_CIPHER') return undefined;
        throw error;
    }
}

function getHashDefinition(algorithm, {allowXof = true} = {}) {
    const requested = String(algorithm || '').trim().toLowerCase().replace(/_/g, '-');
    const name = HASH_ALIASES.get(requested) || requested;
    const hash = HASH_DEFINITIONS.get(name);
    if (!hash || (!allowXof && hash.canXOF)) throw cryptoError('ERR_OSSL_EVP_UNSUPPORTED', `Unsupported digest: ${algorithm}`);
    return {name, hash};
}

function createHashInstance(hash, options) {
    if (!hash.canXOF) {
        validateFixedHashOutputLength(hash, options?.outputLength);
        return hash.create();
    }
    const outputLength = validateSize(options?.outputLength ?? hash.outputLen, 'outputLength');
    return hash.create({dkLen: outputLength});
}

function applyHashOutputLength(instance, hash, options) {
    if (options?.outputLength === undefined) return;
    if (!hash.canXOF) {
        validateFixedHashOutputLength(hash, options.outputLength);
        return;
    }
    instance.outputLen = validateSize(options.outputLength, 'outputLength');
}

function validateFixedHashOutputLength(hash, outputLength) {
    if (outputLength === undefined) return;
    const length = validateSize(outputLength, 'outputLength');
    if (length !== hash.outputLen) {
        throw cryptoError('ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH', 'Digest method is not an XOF or the requested output length is invalid');
    }
}

function normalizeScryptOptions(options, keyLength) {
    const value = options && typeof options === 'object' ? options : {};
    const maxmem = validatePositiveInteger(value.maxmem ?? 32 * 1024 * 1024, 'maxmem');
    if (maxmem > MAX_SCRYPT_MEMORY) throw new RangeError(`scrypt maxmem cannot exceed ${MAX_SCRYPT_MEMORY} bytes`);
    return {
        N: validatePositiveInteger(value.N ?? value.cost ?? 16_384, 'cost'),
        r: validatePositiveInteger(value.r ?? value.blockSize ?? 8, 'blockSize'),
        p: validatePositiveInteger(value.p ?? value.parallelization ?? 1, 'parallelization'),
        dkLen: validateSize(keyLength, 'keylen', {allowZero: false}),
        maxmem,
    };
}

function getCurveDefinition(curveName) {
    const name = String(curveName || '').trim().toLowerCase();
    const definition = CURVE_DEFINITIONS.get(name);
    if (!definition) throw cryptoError('ERR_CRYPTO_INVALID_CURVE', `Unsupported curve: ${curveName}`);
    return definition;
}

function normalizePointFormat(format) {
    const value = String(format || 'uncompressed').toLowerCase();
    if (!['compressed', 'hybrid', 'uncompressed'].includes(value)) throw new TypeError(`Unsupported EC point format: ${format}`);
    return value;
}

function normalizePublicKey(Buffer, value, encoding) {
    const bytes = Buffer.from(toBytes(Buffer, value, encoding));
    if (bytes[0] === 6 || bytes[0] === 7) {
        const expectedParity = bytes[0] & 1;
        if ((bytes.at(-1) & 1) !== expectedParity) throw cryptoError('ERR_CRYPTO_OPERATION_FAILED', 'Invalid hybrid EC public key');
        bytes[0] = 4;
    }
    return bytes;
}

function normalizePrivateKey(Buffer, definition, value, encoding) {
    const source = Buffer.from(toBytes(Buffer, value, encoding));
    let offset = 0;
    while (offset < source.byteLength - 1 && source[offset] === 0) offset += 1;
    const compact = source.subarray(offset);
    const width = definition.curve.lengths.secretKey;
    if (compact.byteLength > width) {
        throw cryptoError('ERR_CRYPTO_INVALID_KEYTYPE', `Invalid private key for ${definition.name}`);
    }
    const padded = Buffer.alloc(width);
    compact.copy(padded, width - compact.byteLength);
    if (!definition.curve.utils.isValidSecretKey(padded)) {
        throw cryptoError('ERR_CRYPTO_INVALID_KEYTYPE', `Invalid private key for ${definition.name}`);
    }
    return padded;
}

function minimalPrivateKey(Buffer, value) {
    let offset = 0;
    while (offset < value.byteLength - 1 && value[offset] === 0) offset += 1;
    return Buffer.from(value.subarray(offset));
}

function toHybridPoint(bytes) {
    if (bytes[0] !== 4) throw cryptoError('ERR_CRYPTO_OPERATION_FAILED', 'Hybrid EC points require an uncompressed public key');
    bytes[0] = (bytes.at(-1) & 1) ? 7 : 6;
    return bytes;
}

function toBytes(Buffer, value, encoding) {
    if (typeof value === 'string') return Buffer.from(value, encoding || 'utf8');
    if (value instanceof ArrayBuffer) return Buffer.from(value);
    if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError('Expected a string, ArrayBuffer, Buffer, or typed array');
}

function formatBytes(Buffer, value, encoding) {
    const result = Buffer.from(value);
    return encoding && String(encoding).toLowerCase() !== 'buffer' ? result.toString(encoding) : result;
}

function toArrayBuffer(value) {
    const copy = Uint8Array.from(value);
    return copy.buffer;
}

function writableRandomTarget(value) {
    if (value instanceof ArrayBuffer) {
        return {bytes: new Uint8Array(value), bytesPerElement: 1, length: value.byteLength};
    }
    if (ArrayBuffer.isView(value)) {
        const bytesPerElement = value instanceof DataView ? 1 : Number(value.BYTES_PER_ELEMENT) || 1;
        return {
            bytes: new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
            bytesPerElement,
            length: value.byteLength / bytesPerElement,
        };
    }
    throw new TypeError('buffer must be an ArrayBuffer or typed array');
}

function fillRandomBytes(webcrypto, bytes) {
    const crypto = requireWebCrypto(webcrypto);
    for (let offset = 0; offset < bytes.byteLength; offset += WEB_CRYPTO_RANDOM_CHUNK_SIZE) {
        crypto.getRandomValues(bytes.subarray(offset, Math.min(bytes.byteLength, offset + WEB_CRYPTO_RANDOM_CHUNK_SIZE)));
    }
    return bytes;
}

function requireWebCrypto(webcrypto) {
    if (!webcrypto?.getRandomValues) throw cryptoError('ERR_CRYPTO_UNAVAILABLE', 'Web Crypto is unavailable in this runtime');
    return webcrypto;
}

function secureRandomInt(webcrypto, minimum, maximum) {
    const min = Number(minimum);
    const max = Number(maximum);
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) throw new TypeError('min and max must be safe integers');
    const range = max - min;
    if (range <= 0 || range > 2 ** 48) throw new RangeError('max must be greater than min and the range cannot exceed 2^48');
    const limit = Math.floor(2 ** 48 / range) * range;
    const bytes = new Uint8Array(6);
    let value;
    do {
        fillRandomBytes(webcrypto, bytes);
        value = 0;
        for (const byte of bytes) value = value * 256 + byte;
    } while (value >= limit);
    return min + (value % range);
}

function timingSafeEqual(Buffer, left, right) {
    const first = toBytes(Buffer, left);
    const second = toBytes(Buffer, right);
    if (first.byteLength !== second.byteLength) throw new RangeError('Input buffers must have the same byte length');
    let difference = 0;
    for (let index = 0; index < first.byteLength; index += 1) difference |= first[index] ^ second[index];
    return difference === 0;
}

function runOptionalCallback(callback, operation) {
    if (callback === undefined) return operation();
    requireCallback(callback);
    queueMicrotask(() => {
        try {
            callback(null, operation());
        } catch (error) {
            callback(error);
        }
    });
}

function requireCallback(callback) {
    if (typeof callback !== 'function') throw new TypeError('Callback must be a function');
}

function validateSize(value, name, {allowZero = true} = {}) {
    const size = Number(value);
    if (!Number.isSafeInteger(size) || size < (allowZero ? 0 : 1)) throw new RangeError(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} safe integer`);
    return size;
}

function validatePositiveInteger(value, name) {
    return validateSize(value, name, {allowZero: false});
}

function validateOffset(value, length) {
    const offset = validateSize(value, 'offset');
    if (offset > length) throw new RangeError('offset exceeds buffer length');
    return offset;
}

function ensureNotFinalized(value, name) {
    if (value._digested || value._finalized) throw cryptoError('ERR_CRYPTO_HASH_FINALIZED', `${name} has already been finalized`);
}

function cryptoError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

export {createCryptoModule};
