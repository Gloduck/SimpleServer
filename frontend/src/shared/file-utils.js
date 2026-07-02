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

const FileUtils = {
    getFileName,
    getFileExtension,
    isImageFile,
    isImageFileName,
    isTextFile,
    formatFileSize,
};

export { FileUtils };
