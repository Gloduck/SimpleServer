import {FileSystemError} from './file-system-errors.js';

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
    const normalizedPath = normalizeFilePath(path);
    const separatorIndex = normalizedPath.lastIndexOf('/');
    return separatorIndex === -1 ? normalizedPath : normalizedPath.slice(separatorIndex + 1);
}

function isPathUnder(path, directory, includeSelf = true) {
    const normalizedPath = normalizeFilePath(path);
    const normalizedDirectory = normalizeFilePath(directory);
    if (normalizedPath === normalizedDirectory) return includeSelf;
    return normalizedDirectory === '' || normalizedPath.startsWith(`${normalizedDirectory}/`);
}

function getMimeType(path, fallback = 'application/octet-stream') {
    const extension = getFileName(path).toLowerCase().split('.').pop();
    const mimeTypes = {
        css: 'text/css',
        csv: 'text/csv',
        gif: 'image/gif',
        htm: 'text/html',
        html: 'text/html',
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
    return mimeTypes[extension] || fallback;
}

export {
    normalizeFilePath,
    joinFilePath,
    getParentFilePath,
    getFileName,
    isPathUnder,
    getMimeType,
};
