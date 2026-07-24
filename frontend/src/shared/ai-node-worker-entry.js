import {FileOperationPolicy, FileSystem, MemoryProvider} from './file-system/index.js';
import {isTextFile} from './file-utils.js';
import {NetworkLimit} from './network-limit.js';
import {NodeWorker} from './node-worker/node-worker.js';
import {RequestProxy} from './request-proxy.js';

const nativeFetch = globalThis.fetch?.bind(globalThis);
const NativeXMLHttpRequest = globalThis.XMLHttpRequest;

globalThis.addEventListener('message', (event) => {
    if (event.data?.type !== 'run' || !event.ports?.[0]) return;
    const port = event.ports[0];
    port.start();
    void execute(event.data.payload || {}, port);
}, {once: true});

async function execute(payload, port) {
    const startedAt = performance.now();
    const logging = createLoggingConsole(port, payload.logging);
    let network;
    try {
        const prepared = payload.prepared || {};
        const requestProxy = new RequestProxy(payload.network?.serverUrl || '', {
            baseUrl: payload.network?.baseUrl || '',
            fetch: nativeFetch,
            XMLHttpRequest: NativeXMLHttpRequest,
        });
        network = new NetworkLimit(requestProxy, {
            ...payload.network?.limits,
            baseUrl: payload.network?.baseUrl || '',
        });
        const limits = payload.fileLimits || {};
        const walkLimit = Math.max(3000, Number(limits.maxEntryCount) || 40_000);

        class AiNodeWorker extends NodeWorker {
            createFileSystem(options) {
                return new FileSystem({
                    provider: new MemoryProvider({files: options.files, writable: true}),
                    policy: new FileOperationPolicy({
                        maxMemoryReadBytes: limits.maxReadBytes,
                        maxMemoryWriteBytes: limits.maxWriteBytes,
                        maxListEntries: walkLimit,
                        maxWalkEntries: walkLimit,
                    }),
                });
            }

            createNetwork() {
                return {
                    fetch: network.fetch,
                    XMLHttpRequest: network.XMLHttpRequest,
                };
            }
        }

        const runner = new AiNodeWorker(prepared);
        runner.console = logging.console;
        const baseline = captureOutputBaseline(runner, payload.outputFiles, payload.outputDirectories);
        const executed = await runner.run();
        if (network.hasPendingOperations()) {
            throw runtimeError('UNAWAITED_ASYNC_OPERATION', 'The script completed while network operations were still pending', {
                phase: 'execution',
            });
        }
        network.assertHealthy();
        if (executed.exitCode !== 0) {
            throw runtimeError('PROCESS_EXIT', `Process exited with code ${executed.exitCode}`, {
                phase: 'execution',
                exitCode: executed.exitCode,
            });
        }
        const outputFiles = await collectOutputs(runner.fileSystem, baseline, payload, walkLimit);
        const transfer = outputFiles
            .filter((file) => file.type === 'bytes')
            .map((file) => file.content.buffer);
        port.postMessage({
            type: 'done',
            ok: true,
            result: serializeRuntimeValue(executed.exports, payload.serialization),
            exitCode: executed.exitCode,
            outputFiles,
            network: network.getUsage(),
            logStats: logging.getStats(),
            elapsedMs: Math.round(performance.now() - startedAt),
        }, transfer);
    } catch (error) {
        network?.abortAll(error);
        port.postMessage({
            type: 'done',
            ok: false,
            error: serializeRuntimeError(error, payload.serialization),
            outputFiles: [],
            network: network?.getUsage?.() || {requestCount: 0, responseBytes: 0},
            logStats: logging.getStats(),
            elapsedMs: Math.round(performance.now() - startedAt),
        });
    } finally {
        port.close();
        globalThis.close();
    }
}

function captureOutputBaseline(runner, outputFiles = [], outputDirectories = []) {
    const result = new Map();
    for (const file of runner.options.files) {
        if (!resolveOutputPolicy(file.path, outputFiles, outputDirectories)) continue;
        result.set(file.path, {
            bytes: toBytes(file.content),
            mimeType: file.mimeType || '',
        });
    }
    return result;
}

async function collectOutputs(fileSystem, baseline, payload, walkLimit) {
    const outputFiles = payload.outputFiles || [];
    const outputDirectories = payload.outputDirectories || [];
    const limits = payload.outputLimits || {};
    const entries = await fileSystem.walk('', {limit: walkLimit});
    if (entries.length >= walkLimit) {
        throw runtimeError('FILE_SYSTEM_ENTRY_COUNT_EXCEEDED', `File system contains at least ${walkLimit} entries`, {
            phase: 'output',
            size: entries.length,
            maxSize: walkLimit,
        });
    }

    const currentPaths = new Set(entries.filter((entry) => entry.kind === 'file').map((entry) => entry.path));
    for (const path of baseline.keys()) {
        if (!currentPaths.has(path)) {
            throw runtimeError('OUTPUT_DELETE_UNSUPPORTED', `Deleting output files is not supported: ${path}`, {
                phase: 'output',
                path,
            });
        }
    }

    const results = [];
    let totalSize = 0;
    for (const entry of entries) {
        if (entry.kind !== 'file') continue;
        const policy = resolveOutputPolicy(entry.path, outputFiles, outputDirectories);
        if (!policy) continue;
        const bytes = fileSystem.readBytesSync(entry.path);
        const initial = baseline.get(entry.path);
        if (initial && initial.mimeType === entry.mimeType && equalBytes(initial.bytes, bytes)) continue;
        if (bytes.byteLength > limits.maxOutputFileBytes) {
            throw fileTooLargeError('output', entry.path, bytes.byteLength, limits.maxOutputFileBytes);
        }
        totalSize += bytes.byteLength;
        if (totalSize > limits.maxOutputTotalBytes) {
            throw fileTooLargeError('output-total', entry.path, totalSize, limits.maxOutputTotalBytes);
        }
        results.push(formatOutput(entry, bytes, policy));
        if (results.length > limits.maxOutputFileCount) {
            throw runtimeError('OUTPUT_FILE_COUNT_EXCEEDED', `Output exceeds ${limits.maxOutputFileCount} files`, {
                phase: 'output',
                size: results.length,
                maxSize: limits.maxOutputFileCount,
            });
        }
    }
    return results;
}

function formatOutput(entry, bytes, policy) {
    const text = policy.type === 'text' || (!policy.type && isTextFile({name: entry.path, type: entry.mimeType}));
    return {
        path: entry.path,
        type: text ? 'text' : 'bytes',
        content: text ? new TextDecoder().decode(bytes) : bytes,
        size: bytes.byteLength,
        mimeType: entry.mimeType,
    };
}

function resolveOutputPolicy(path, outputFiles = [], outputDirectories = []) {
    const exact = outputFiles.find((item) => item.path === path);
    if (exact) return exact;
    return outputDirectories
        .filter((item) => item.path === '' ? path !== '' : path !== item.path && path.startsWith(`${item.path}/`))
        .sort((left, right) => right.path.length - left.path.length)[0] || null;
}

function createLoggingConsole(port, options = {}) {
    const maximum = Math.max(1, Number(options?.maxEntries) || 100);
    let emitted = 0;
    let dropped = 0;
    const result = {};
    for (const level of ['debug', 'log', 'info', 'warn', 'error']) {
        result[level] = (...args) => {
            if (emitted >= maximum) {
                dropped += 1;
                return;
            }
            emitted += 1;
            port.postMessage({
                type: 'log',
                log: {
                    level,
                    args: args.map((value) => serializeRuntimeValue(value, options.serialization)),
                },
            });
        };
    }
    return {
        console: Object.freeze(result),
        getStats: () => ({emitted, dropped}),
    };
}

function toBytes(value) {
    if (typeof value === 'string') return new TextEncoder().encode(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    return new TextEncoder().encode(String(value ?? ''));
}

function equalBytes(left, right) {
    if (left.byteLength !== right.byteLength) return false;
    for (let index = 0; index < left.byteLength; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

function fileTooLargeError(phase, path, size, maxSize) {
    return runtimeError('FILE_TOO_LARGE', `Size limit exceeded: ${size} > ${maxSize} bytes`, {
        phase,
        path,
        size,
        maxSize,
    });
}

function runtimeError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function serializeRuntimeValue(value, options = {}) {
    const limits = {
        maxStringLength: 5000,
        maxCollectionItems: 100,
        maxDepth: 5,
        maxNodes: 2000,
        ...options,
    };
    return serializeValue(value, 0, new Set(), limits, {nodes: 0});
}

function serializeRuntimeError(error, options = {}) {
    const source = error && typeof error === 'object' ? error : {};
    const result = {
        name: source.name || 'Error',
        code: source.code || 'SCRIPT_ERROR',
        message: source.message || String(error),
    };
    [
        'phase',
        'path',
        'url',
        'operation',
        'size',
        'maxSize',
        'requestAborted',
        'partialFileDiscarded',
        'specifier',
        'parent',
        'format',
        'exitCode',
    ].forEach((name) => {
        if (source[name] !== undefined) result[name] = source[name];
    });
    if (source.stack) result.stack = String(source.stack).slice(0, options.maxErrorStackLength || 20_000);
    return result;
}

function serializeValue(value, depth, ancestors, limits, state) {
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return serializeString(value, limits.maxStringLength);
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'symbol') return String(value);
    if (typeof value === 'function') return `[Function${value.name ? ` ${value.name}` : ''}]`;
    if (value instanceof Error) return serializeRuntimeError(value, limits);
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
    if (value instanceof RegExp) return String(value);
    if (depth >= limits.maxDepth) return '[MaxDepth]';
    if (state.nodes >= limits.maxNodes) return '[MaxNodes]';
    if (ancestors.has(value)) return '[Circular]';

    state.nodes += 1;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(value);
    if (value instanceof ArrayBuffer) return serializeBytes(new Uint8Array(value), limits, 'ArrayBuffer');
    if (ArrayBuffer.isView(value)) {
        return serializeBytes(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), limits, value.constructor?.name);
    }
    if (Array.isArray(value)) {
        const result = value.slice(0, limits.maxCollectionItems)
            .map((item) => serializeValue(item, depth + 1, nextAncestors, limits, state));
        if (value.length > limits.maxCollectionItems) result.push(`[${value.length - limits.maxCollectionItems} more items]`);
        return result;
    }
    if (value instanceof Map) {
        return {
            type: 'Map',
            size: value.size,
            entries: [...value.entries()].slice(0, limits.maxCollectionItems).map(([key, item]) => [
                serializeValue(key, depth + 1, nextAncestors, limits, state),
                serializeValue(item, depth + 1, nextAncestors, limits, state),
            ]),
        };
    }
    if (value instanceof Set) {
        return {
            type: 'Set',
            size: value.size,
            values: [...value.values()].slice(0, limits.maxCollectionItems)
                .map((item) => serializeValue(item, depth + 1, nextAncestors, limits, state)),
        };
    }
    try {
        const entries = Object.entries(Object.getOwnPropertyDescriptors(value));
        const result = {};
        for (const [key, descriptor] of entries.slice(0, limits.maxCollectionItems)) {
            result[key] = Object.prototype.hasOwnProperty.call(descriptor, 'value')
                ? serializeValue(descriptor.value, depth + 1, nextAncestors, limits, state)
                : '[Accessor]';
        }
        if (entries.length > limits.maxCollectionItems) result.__truncated_keys = entries.length - limits.maxCollectionItems;
        return result;
    } catch {
        return '[Unserializable Object]';
    }
}

function serializeBytes(bytes, limits, type) {
    return {
        type: type || 'Uint8Array',
        size: bytes.byteLength,
        bytes: Array.from(bytes.subarray(0, limits.maxCollectionItems)),
        ...(bytes.byteLength > limits.maxCollectionItems ? {truncated: true} : {}),
    };
}

function serializeString(value, maximum) {
    const text = String(value);
    const limit = Math.max(1, Number(maximum) || 5000);
    return {
        text: text.slice(0, limit),
        text_chars: text.length,
        returned_chars: Math.min(text.length, limit),
        truncated: text.length > limit,
    };
}
