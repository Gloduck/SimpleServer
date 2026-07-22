import {FileSystemError} from './file-system/file-system-errors.js';

const IMAGE_EXTENSIONS = new Set([
    'apng', 'avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'
]);

const TEXT_EXTENSIONS = new Set([
    'astro', 'bat', 'c', 'cc', 'cfg', 'conf', 'cpp', 'cs', 'css', 'csv', 'dart', 'dockerfile', 'env', 'fs', 'go', 'gql', 'graphql', 'h', 'handlebars', 'hbs', 'hpp', 'htm', 'html', 'ini', 'java', 'js', 'json', 'json5', 'jsonc', 'jsx', 'kt', 'less', 'log', 'lua', 'md', 'mdx', 'mjs', 'php', 'properties', 'ps1', 'py', 'r', 'rb', 'rs', 'sass', 'scss', 'sh', 'sql', 'svelte', 'swift', 'toml', 'ts', 'tsx', 'txt', 'vue', 'xml', 'yaml', 'yml'
]);

const TEXT_FILE_NAMES = new Set([
    '.babelrc', '.browserslistrc', '.dockerignore', '.editorconfig', '.env', '.env.example', '.eslintignore', '.eslintrc', '.gitattributes', '.gitignore', '.gitkeep', '.npmignore', '.npmrc', '.nvmrc', '.prettierignore', '.prettierrc', '.stylelintignore', '.stylelintrc', 'dockerfile', 'license', 'makefile', 'readme'
]);

const TEXT_MIME_TYPES = new Set([
    'application/javascript',
    'application/json',
    'application/ld+json',
    'application/sql',
    'application/typescript',
    'application/x-httpd-php',
    'application/x-javascript',
    'application/x-sh',
    'application/xhtml+xml',
    'application/xml',
]);

const MIME_TYPES = {
    apng: 'image/apng',
    avif: 'image/avif',
    bmp: 'image/bmp',
    css: 'text/css',
    csv: 'text/csv',
    gif: 'image/gif',
    htm: 'text/html',
    html: 'text/html',
    ico: 'image/x-icon',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    js: 'text/javascript',
    json: 'application/json',
    md: 'text/markdown',
    mjs: 'text/javascript',
    pdf: 'application/pdf',
    png: 'image/png',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    vue: 'text/plain',
    webp: 'image/webp',
    xml: 'application/xml',
    yaml: 'application/yaml',
    yml: 'application/yaml',
};

function normalizeFilePath(path = '') {
    if (path === null || path === undefined) path = '';
    if (typeof path !== 'string') path = String(path);
    if (path.includes('\0')) {
        throw new FileSystemError('File path cannot contain null bytes', {
            code: 'INVALID_FILE_PATH',
            path,
        });
    }

    const parts = path.replace(/\\/g, '/').split('/');
    const normalized = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (normalized.length === 0) {
                throw new FileSystemError(`File path escapes the root: ${path}`, {
                    code: 'INVALID_FILE_PATH',
                    path,
                });
            }
            normalized.pop();
            continue;
        }
        normalized.push(part);
    }
    return normalized.join('/');
}

function joinFilePath(...paths) {
    return normalizeFilePath(paths.filter((path) => path !== '').join('/'));
}

function getParentFilePath(path) {
    const normalizedPath = normalizeFilePath(path);
    const separatorIndex = normalizedPath.lastIndexOf('/');
    return separatorIndex === -1 ? '' : normalizedPath.slice(0, separatorIndex);
}

function getFileName(path) {
    return String(path || '').split(/[\\/]/).pop();
}

function isPathUnder(path, directory, includeSelf = true) {
    const normalizedPath = normalizeFilePath(path);
    const normalizedDirectory = normalizeFilePath(directory);
    if (normalizedPath === normalizedDirectory) return includeSelf;
    return normalizedDirectory === '' || normalizedPath.startsWith(`${normalizedDirectory}/`);
}

function getFileExtension(fileName) {
    const name = getFileName(fileName).toLowerCase();
    return name.includes('.') ? name.split('.').pop() : name;
}

function isImageFile(file) {
    return file?.type?.startsWith('image/') || IMAGE_EXTENSIONS.has(getFileExtension(file?.name));
}

function isImageFileName(fileName) {
    return IMAGE_EXTENSIONS.has(getFileExtension(fileName));
}

function isTextFile(file) {
    if (!file || isImageFile(file)) return false;
    const mimeType = String(file.type || '').toLowerCase();
    const name = getFileName(file.name).toLowerCase();
    return mimeType.startsWith('text/') || TEXT_MIME_TYPES.has(mimeType) || TEXT_EXTENSIONS.has(getFileExtension(name)) || TEXT_FILE_NAMES.has(name);
}

function formatFileSize(bytes) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const unit = 1024;
    const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(unit)), units.length - 1);
    return `${parseFloat((bytes / Math.pow(unit, index)).toFixed(2))} ${units[index]}`;
}

function getMimeType(path, fallback = 'application/octet-stream') {
    return MIME_TYPES[getFileExtension(path)] || fallback;
}

function toBlob(value, mimeType = '') {
    if (value instanceof Blob) return value;
    return new Blob([value], mimeType ? {type: mimeType} : undefined);
}

function withBlobType(value, mimeType = '') {
    const blob = toBlob(value);
    return mimeType && blob.type !== mimeType ? new Blob([blob], {type: mimeType}) : blob;
}

function textToBlob(value, mimeType = 'text/plain;charset=utf-8') {
    return new Blob([new TextEncoder().encode(String(value))], {type: mimeType});
}

function getTextByteLength(value) {
    return new TextEncoder().encode(String(value)).byteLength;
}

async function blobToText(value) {
    const blob = toBlob(value);
    return new TextDecoder('utf-8').decode(await blob.arrayBuffer());
}

function toReadableStream(source) {
    if (source instanceof ReadableStream) return source;
    if (typeof source?.stream === 'function') {
        const stream = source.stream();
        if (stream instanceof ReadableStream) return stream;
    }
    return toBlob(source).stream();
}

async function streamToBlob(source, mimeType = '') {
    return withBlobType(await new Response(toReadableStream(source)).blob(), mimeType);
}

function base64ToBytes(value) {
    const base64 = getBase64Value(value).replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = globalThis.atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function bytesToBase64(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return globalThis.btoa(binary);
}

function base64ToBlob(value, mimeType = '') {
    const data = getBase64Data(value);
    return new Blob([base64ToBytes(data.value)], {type: mimeType || data.mimeType || 'application/octet-stream'});
}

function getBase64DecodedSize(value) {
    const base64 = getBase64Value(value).replace(/-/g, '+').replace(/_/g, '/');
    return Math.max(0, Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0));
}

function bytesToBase64Url(value) {
    return bytesToBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
    return base64ToBytes(value);
}

function getBase64Value(value) {
    return getBase64Data(value).value;
}

function getBase64Data(value) {
    const input = String(value || '');
    const dataUrl = input.match(/^data:([^,]*);base64,/i);
    const metadata = dataUrl?.[1] || '';
    return {
        value: (dataUrl ? input.slice(dataUrl[0].length) : input).replace(/\s/g, ''),
        mimeType: metadata.split(';')[0] || '',
    };
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function normalizeImageDataUrl(dataUrl, mimeType) {
    const value = String(dataUrl || '');
    const commaIndex = value.indexOf(',');
    if (!value.startsWith('data:') || commaIndex === -1) throw new Error('Failed to encode image as data URL');
    if (/^data:[^;,]+;base64,/i.test(value)) return value;
    if (/^data:.*;base64,/i.test(value)) return `data:${mimeType};base64,${value.slice(commaIndex + 1)}`;
    throw new Error('Failed to encode image as base64 data URL');
}

function getImageMimeType(fileName, fallback = '') {
    const mimeType = String(fallback || '').trim().toLowerCase();
    if (mimeType.startsWith('image/')) return mimeType;
    const detectedMimeType = getMimeType(fileName, '');
    return detectedMimeType.startsWith('image/') ? detectedMimeType : 'image/png';
}

const FileUtils = {
    normalizeFilePath,
    joinFilePath,
    getParentFilePath,
    getFileName,
    isPathUnder,
    getFileExtension,
    getMimeType,
    isImageFile,
    isImageFileName,
    isTextFile,
    formatFileSize,
    toBlob,
    withBlobType,
    textToBlob,
    getTextByteLength,
    blobToText,
    toReadableStream,
    streamToBlob,
    base64ToBytes,
    bytesToBase64,
    base64ToBlob,
    getBase64DecodedSize,
    bytesToBase64Url,
    base64UrlToBytes,
    readFileAsDataUrl,
    normalizeImageDataUrl,
    getImageMimeType,
};

export {
    FileUtils,
    base64ToBlob,
    base64ToBytes,
    base64UrlToBytes,
    blobToText,
    bytesToBase64,
    bytesToBase64Url,
    formatFileSize,
    getBase64DecodedSize,
    getFileExtension,
    getFileName,
    getImageMimeType,
    getMimeType,
    getParentFilePath,
    getTextByteLength,
    isImageFile,
    isImageFileName,
    isPathUnder,
    isTextFile,
    joinFilePath,
    normalizeFilePath,
    normalizeImageDataUrl,
    readFileAsDataUrl,
    streamToBlob,
    textToBlob,
    toBlob,
    toReadableStream,
    withBlobType,
};
