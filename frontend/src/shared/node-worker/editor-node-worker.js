import {isTextFile, normalizeFilePath} from '../file-utils.js';
import {FileOperationPolicy} from '../file-system/index.js';
import {ProxyRequest} from '../script-runtime/network-adapter.js';
import {NodeWorker} from './node-worker.js';

class EditorNodeWorker extends NodeWorker {
    constructor(options = {}) {
        super(options);
        this.initialVersions = new Map();
        for (const path of this.options.initialFilePaths || []) {
            try {
                this.initialVersions.set(path, this.fileSystem.statSync(path).version);
            } catch {
            }
        }
    }

    normalizeOptions(options) {
        const inputFiles = options.inputFiles || [];
        const normalized = super.normalizeOptions({
            ...options,
            files: [...(options.files || []), ...inputFiles],
        });
        return {
            ...normalized,
            network: options.network,
            limits: options.limits,
            outputFiles: (options.outputFiles || []).map(normalizeOutputDeclaration),
            outputDirectories: (options.outputDirectories || []).map(normalizeOutputDeclaration),
            initialFilePaths: normalized.files.map((file) => file.path),
            inputEntries: inputFiles.map((file) => ({
                path: normalizeFilePath(file.path),
                size: getContentSize(file.content ?? ''),
            })),
        };
    }

    createFileSystemConfig(options) {
        const writableFiles = new Set(options.outputFiles.map((item) => item.path));
        return {
            writable: false,
            files: options.files.map((file) => ({
                ...file,
                writable: writableFiles.has(file.path),
            })),
            writableFiles: [...writableFiles],
            writableDirectories: options.outputDirectories.map((item) => item.path),
        };
    }

    createNetwork(options) {
        const network = options.network || {};
        const adapter = new ProxyRequest(network.serverUrl ?? (network.proxy ? network.backendBaseUrl : ''), {
            baseUrl: network.baseUrl || globalThis.location?.href || '',
            fetch: typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null,
            XMLHttpRequest: globalThis.XMLHttpRequest,
        });
        return {
            fetch: adapter.fetch,
            XMLHttpRequest: adapter.XMLHttpRequest,
            adapter,
        };
    }

    createFileSystemPolicy(options) {
        const limits = options.limits || {};
        return new FileOperationPolicy({
            maxMemoryReadBytes: limits.maxMemoryReadBytes,
            maxMemoryWriteBytes: limits.maxMemoryWriteBytes,
            maxListEntries: limits.maxListEntries,
            maxWalkEntries: limits.maxWalkEntries,
        });
    }

    async run() {
        this.validateInputLimits();
        const result = await super.run();
        return {
            ...result,
            outputFiles: await this.collectOutputFiles(),
        };
    }

    validateInputLimits() {
        const entries = this.options.inputEntries || [];
        const limits = this.options.limits || {};
        if (entries.length > (limits.maxInputFileCount ?? Infinity)) {
            throw limitError('INPUT_FILE_COUNT_EXCEEDED', 'Too many input files', entries.length, limits.maxInputFileCount);
        }
        let total = 0;
        for (const entry of entries) {
            total += entry.size;
            if (entry.size > (limits.maxInputFileBytes ?? Infinity)) {
                throw limitError('FILE_TOO_LARGE', `Input file is too large: ${entry.path}`, entry.size, limits.maxInputFileBytes, entry.path);
            }
        }
        if (total > (limits.maxInputTotalBytes ?? Infinity)) {
            throw limitError('FILE_TOO_LARGE', 'Total input size is too large', total, limits.maxInputTotalBytes);
        }
    }

    async collectOutputFiles() {
        const declarations = new Map((this.options.outputFiles || []).map((item) => [item.path, item]));
        const paths = new Set(declarations.keys());
        for (const directory of this.options.outputDirectories || []) {
            let entries;
            try {
                entries = await this.fileSystem.walk(directory.path);
            } catch (error) {
                if (error?.code === 'FILE_NOT_FOUND') continue;
                throw error;
            }
            for (const entry of entries) {
                if (entry.kind === 'file') paths.add(entry.path);
            }
        }

        const outputs = [];
        const limits = this.options.limits || {};
        let totalSize = 0;
        for (const path of [...paths].sort()) {
            let entry;
            try {
                entry = await this.fileSystem.stat(path);
            } catch (error) {
                if (error?.code === 'FILE_NOT_FOUND') continue;
                throw error;
            }
            if (entry.kind !== 'file' || this.initialVersions.get(path) === entry.version) continue;
            const blob = await this.fileSystem.readBlob(path);
            const declaration = declarations.get(path) || resolveOutputDirectory(path, this.options.outputDirectories || []);
            const type = declaration?.type || (isTextFile({name: path, type: blob.type}) ? 'text' : 'bytes');
            totalSize += blob.size;
            if (blob.size > (limits.maxOutputFileBytes ?? Infinity)) {
                throw limitError('FILE_TOO_LARGE', `Output file is too large: ${path}`, blob.size, limits.maxOutputFileBytes, path);
            }
            if (totalSize > (limits.maxOutputTotalBytes ?? Infinity)) {
                throw limitError('FILE_TOO_LARGE', 'Total output size is too large', totalSize, limits.maxOutputTotalBytes, path);
            }
            outputs.push({
                path,
                type,
                content: type === 'text' ? await blob.text() : new Uint8Array(await blob.arrayBuffer()),
                size: blob.size,
                mimeType: blob.type || 'application/octet-stream',
                overwrite: declaration?.overwrite === true,
            });
            if (outputs.length > (limits.maxOutputFileCount ?? Infinity)) {
                throw limitError('OUTPUT_FILE_COUNT_EXCEEDED', 'Too many output files', outputs.length, limits.maxOutputFileCount);
            }
        }
        return outputs;
    }
}

function resolveOutputDirectory(path, directories) {
    return directories
        .filter((item) => item.path === '' ? path !== '' : path.startsWith(`${item.path}/`))
        .sort((left, right) => right.path.length - left.path.length)[0];
}

function getContentSize(value) {
    if (typeof value === 'string') return new TextEncoder().encode(value).byteLength;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    return 0;
}

function normalizeOutputDeclaration(item) {
    return {
        path: normalizeFilePath(item.path),
        ...(item.type ? {type: item.type} : {}),
        overwrite: item.overwrite === true,
    };
}

function limitError(code, message, size, maxSize, path) {
    const error = new Error(message);
    error.code = code;
    error.size = size;
    error.maxSize = maxSize;
    if (path !== undefined) error.path = path;
    return error;
}

export {EditorNodeWorker};
