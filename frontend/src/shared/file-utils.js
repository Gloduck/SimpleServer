const IMAGE_EXTENSIONS = new Set([
    'apng', 'avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'
]);

const TEXT_EXTENSIONS = new Set([
    'astro', 'bat', 'c', 'cc', 'cfg', 'conf', 'cpp', 'cs', 'css', 'csv', 'dart', 'dockerfile', 'env', 'fs', 'go', 'gql', 'graphql', 'h', 'handlebars', 'hbs', 'hpp', 'htm', 'html', 'ini', 'java', 'js', 'json', 'json5', 'jsonc', 'jsx', 'kt', 'less', 'log', 'lua', 'md', 'mdx', 'mjs', 'php', 'properties', 'ps1', 'py', 'r', 'rb', 'rs', 'sass', 'scss', 'sh', 'sql', 'svelte', 'swift', 'toml', 'ts', 'tsx', 'txt', 'vue', 'xml', 'yaml', 'yml'
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

function getFileName(fileName) {
    return String(fileName || '').split(/[\\/]/).pop();
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
    return mimeType.startsWith('text/') || TEXT_MIME_TYPES.has(mimeType) || TEXT_EXTENSIONS.has(getFileExtension(file.name));
}

function formatFileSize(bytes) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const unit = 1024;
    const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(unit)), units.length - 1);
    return `${parseFloat((bytes / Math.pow(unit, index)).toFixed(2))} ${units[index]}`;
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
    const mimeTypes = {
        apng: 'image/apng',
        avif: 'image/avif',
        bmp: 'image/bmp',
        gif: 'image/gif',
        ico: 'image/x-icon',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
        png: 'image/png',
        svg: 'image/svg+xml',
        webp: 'image/webp',
    };
    return mimeTypes[getFileExtension(fileName)] || 'image/png';
}

const FileUtils = {
    getFileName,
    getFileExtension,
    isImageFile,
    isImageFileName,
    isTextFile,
    formatFileSize,
    readFileAsDataUrl,
    normalizeImageDataUrl,
    getImageMimeType,
};

export { FileUtils };
