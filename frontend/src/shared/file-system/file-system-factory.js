import {FileSystem} from './file-system.js';
import {BrowserHandleProvider} from './providers/browser-handle-provider.js';
import {GithubProvider} from './providers/github-provider.js';

const providerFactories = new Map();

function registerFileSystemProvider(type, factory, {replace = false} = {}) {
    const normalizedType = normalizeType(type);
    if (typeof factory !== 'function') throw new TypeError('File system provider factory must be a function');
    if (!replace && providerFactories.has(normalizedType)) {
        throw new Error(`File system provider type is already registered: ${normalizedType}`);
    }
    providerFactories.set(normalizedType, factory);
}

function createFileSystem({type, config = {}, policy} = {}) {
    const normalizedType = normalizeType(type);
    const factory = providerFactories.get(normalizedType);
    if (!factory) throw new RangeError(`Unknown file system provider type: ${type}`);
    return new FileSystem({provider: factory(config || {}), policy});
}

function normalizeType(type) {
    const normalized = String(type || '').trim().toLowerCase();
    if (!normalized) throw new TypeError('File system provider type is required');
    return normalized;
}

const createBrowserProvider = (config) => new BrowserHandleProvider({
    root: config.root || config.handle || config.directoryHandle,
});

registerFileSystemProvider('browser', createBrowserProvider);
registerFileSystemProvider('local', createBrowserProvider);
registerFileSystemProvider('opfs', createBrowserProvider);
registerFileSystemProvider('github', (config) => new GithubProvider(config));

export {createFileSystem, registerFileSystemProvider};
