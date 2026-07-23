import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
    AI_JAVASCRIPT_DEFAULT_TIMEOUT_MS,
    AI_JAVASCRIPT_MAX_TIMEOUT_MS,
    createAiJavaScriptWorkerSource,
    evaluateAiJavaScriptSize,
    getAiJavaScriptOutputConflict,
    isAiJavaScriptTextOutput,
    normalizeAiJavaScriptTimeout,
    requiresAiJavaScriptWorkspace,
    resolveAiJavaScriptOutputPolicy,
    serializeAiJavaScriptError,
} from '../../src/shared/ai-javascript-runtime.js';

const DEFAULT_LIMITS = {
    maxInputFileBytes: 1024,
    maxInputTotalBytes: 1024,
    maxDownloadBytes: 1024,
    maxDownloadTotalBytes: 1024,
    maxOutputFileBytes: 1024,
    maxOutputTotalBytes: 1024,
};

test('场景：脚本执行时间默认三十秒、允许一毫秒并且最高限制一小时', () => {
    assert.equal(normalizeAiJavaScriptTimeout(), AI_JAVASCRIPT_DEFAULT_TIMEOUT_MS);
    assert.equal(normalizeAiJavaScriptTimeout(1), 1);
    assert.equal(normalizeAiJavaScriptTimeout(AI_JAVASCRIPT_MAX_TIMEOUT_MS + 1), AI_JAVASCRIPT_MAX_TIMEOUT_MS);
    assert.throws(() => normalizeAiJavaScriptTimeout(0), {code: 'INVALID_TIMEOUT'});
    assert.throws(() => normalizeAiJavaScriptTimeout(-1), {code: 'INVALID_TIMEOUT'});
    assert.throws(() => normalizeAiJavaScriptTimeout(Number.POSITIVE_INFINITY), {code: 'INVALID_TIMEOUT'});
});

test('场景：纯脚本无工作区依赖，声明任意输入或输出后才要求工作区', () => {
    assert.equal(requiresAiJavaScriptWorkspace(), false);
    assert.equal(requiresAiJavaScriptWorkspace({inputFiles: [{path: 'input.txt'}]}), true);
    assert.equal(requiresAiJavaScriptWorkspace({outputFiles: [{path: 'output.txt'}]}), true);
    assert.equal(requiresAiJavaScriptWorkspace({outputDirectories: [{path: 'output'}]}), true);
});

test('场景：固定输出策略优先于动态目录，嵌套目录使用最具体的覆盖策略', () => {
    const exact = {path: 'output/extracted/exact.txt', overwrite: true};
    const root = {path: 'output', overwrite: false};
    const workspaceRoot = {path: '', overwrite: false};
    const nested = {path: 'output/extracted', overwrite: true};

    assert.equal(resolveAiJavaScriptOutputPolicy(exact.path, [exact], [workspaceRoot, root, nested]), exact);
    assert.equal(resolveAiJavaScriptOutputPolicy('output/extracted/a.txt', [], [workspaceRoot, root, nested]), nested);
    assert.equal(resolveAiJavaScriptOutputPolicy('output/a.txt', [], [workspaceRoot, root, nested]), root);
    assert.equal(resolveAiJavaScriptOutputPolicy('other/a.txt', [], [workspaceRoot, root, nested]), workspaceRoot);
});

test('场景：覆盖参数为真时覆盖已保存、未保存或待删除文件，为假时统一报冲突', () => {
    for (const state of ['saved', 'dirty', 'deleted']) {
        assert.equal(getAiJavaScriptOutputConflict({existingKind: 'file', overwrite: false, state}), 'FILE_ALREADY_EXISTS');
        assert.equal(getAiJavaScriptOutputConflict({existingKind: 'file', overwrite: true, state}), '');
    }
    assert.equal(getAiJavaScriptOutputConflict({existingKind: 'directory', overwrite: true}), 'OUTPUT_PATH_TYPE_CONFLICT');
});

test('场景：归档以字节写出的源码按文本处理，图片和普通二进制保持二进制', () => {
    for (const path of ['src/App.java', 'src/App.vue', 'src/main.js']) {
        assert.equal(isAiJavaScriptTextOutput({path, type: 'bytes', mimeType: 'application/octet-stream'}), true);
    }
    assert.equal(isAiJavaScriptTextOutput({path: 'assets/icon.png', type: 'bytes', mimeType: 'application/octet-stream'}), false);
    assert.equal(isAiJavaScriptTextOutput({path: 'archive/data.bin', type: 'bytes', mimeType: 'application/octet-stream'}), false);
});

test('场景：输入和输出同时检查单文件大小与本次执行累计大小', () => {
    assert.deepEqual(evaluateAiJavaScriptSize({
        itemSize: 6,
        currentTotal: 0,
        itemLimit: 5,
        totalLimit: 10,
        phase: 'input',
    }), {
        total: 6,
        violation: {phase: 'input', size: 6, maxSize: 5},
    });

    assert.deepEqual(evaluateAiJavaScriptSize({
        itemSize: 4,
        currentTotal: 4,
        itemLimit: 5,
        totalLimit: 7,
        phase: 'output',
    }), {
        total: 8,
        violation: {phase: 'output-total', size: 8, maxSize: 7},
    });

    assert.deepEqual(evaluateAiJavaScriptSize({
        itemSize: 3,
        currentTotal: 4,
        itemLimit: 5,
        totalLimit: 7,
        phase: 'input',
    }), {
        total: 7,
        violation: null,
    });
});

test('场景：纯脚本无需工作区并且只向脚本暴露代理布尔值', async () => {
    const {done} = await runWorker({
        code: 'return { value: input.value * 2, networkKeyCount: Object.keys(runtime.network).length, hasBackendBaseUrl: "backendBaseUrl" in runtime.network, proxy: runtime.network.proxy };',
        input: {value: 4},
    });

    assert.equal(done.ok, true);
    assert.deepEqual(done.result, {value: 8, networkKeyCount: 1, hasBackendBaseUrl: false, proxy: false});
});

test('场景：工作区根目录声明允许动态写入文件但仍拒绝路径穿越', async () => {
    const success = await runWorker({
        code: 'runtime.files.writeText("root-output.txt", "ok");',
        outputDirectories: [{path: '', overwrite: true}],
    });
    assert.equal(success.done.ok, true);
    assert.equal(success.done.outputFiles[0].path, 'root-output.txt');

    const traversal = await runWorker({
        code: 'runtime.files.writeText("../secret.txt", "no");',
        outputDirectories: [{path: '', overwrite: true}],
    });
    assert.equal(traversal.done.ok, false);
    assert.equal(traversal.done.error.code, 'INVALID_FILE_PATH');
    assert.deepEqual(traversal.done.outputFiles, []);
});

test('场景：外层函数返回时仍有运行时请求未完成会返回未等待异步操作错误', async () => {
    const {done} = await runWorker({
        code: '(async () => { await runtime.request({ url: "https://example.test/slow" }); })();',
    }, {
        fetchImpl: async () => new Promise((resolve) => {
            setTimeout(() => resolve(new Response('ok')), 50);
        }),
    });

    assert.equal(done.ok, false);
    assert.equal(done.error.code, 'UNAWAITED_ASYNC_OPERATION');
    assert.equal(done.error.phase, 'execution');
    assert.deepEqual(done.outputFiles, []);
});

test('场景：普通对象数组不会被误判为循环引用', async () => {
    const {done} = await runWorker({
        code: 'return [{ id: 1, width: 720 }, { id: 2, width: 1080 }];',
    });

    assert.equal(done.ok, true);
    assert.deepEqual(done.result, [
        {id: 1, width: 720},
        {id: 2, width: 1080},
    ]);
});

test('场景：真正的自引用对象和数组仍然标记为循环引用', async () => {
    const arrayResult = await runWorker({
        code: 'const value = []; value.push(value); return value;',
    });
    assert.equal(arrayResult.done.ok, true);
    assert.deepEqual(arrayResult.done.result, ['[Circular]']);

    const objectResult = await runWorker({
        code: 'const value = { id: 1 }; value.self = value; return value;',
    });
    assert.equal(objectResult.done.ok, true);
    assert.deepEqual(objectResult.done.result, {id: 1, self: '[Circular]'});
});

test('场景：脚本只能读取声明输入并可生成固定文件和动态目录文件', async () => {
    const binary = new Uint8Array([1, 2, 3]).buffer;
    const {done} = await runWorker({
        code: [
            'const text = await runtime.files.readText("input/source.txt");',
            'const bytes = await runtime.files.readBytes("input/data.bin");',
            'runtime.files.writeText("output/result.txt", text.toUpperCase());',
            'runtime.files.writeBytes("output/extracted/data.bin", bytes, "application/octet-stream");',
            'return { textSize: runtime.files.stat("input/source.txt").size, bytes: bytes.length };',
        ].join('\n'),
        inputFiles: [
            {path: 'input/source.txt', type: 'text', content: 'hello', size: 5, mimeType: 'text/plain'},
            {path: 'input/data.bin', type: 'bytes', content: binary, size: 3, mimeType: 'application/octet-stream'},
        ],
        outputFiles: [{path: 'output/result.txt', type: 'text', overwrite: true}],
        outputDirectories: [{path: 'output/extracted', overwrite: false}],
    });

    assert.equal(done.ok, true);
    assert.equal(done.outputFiles.length, 2);
    assert.equal(done.outputFiles.find((file) => file.path === 'output/result.txt').content, 'HELLO');
    assert.equal(done.outputFiles.find((file) => file.path === 'output/result.txt').overwrite, true);
    assert.equal(done.outputFiles.find((file) => file.path === 'output/extracted/data.bin').overwrite, false);
    assert.deepEqual(
        Array.from(done.outputFiles.find((file) => file.path === 'output/extracted/data.bin').content),
        [1, 2, 3],
    );
});

test('场景：输入文件未声明或读取类型不匹配时脚本直接失败', async () => {
    const undeclared = await runWorker({
        code: 'await runtime.files.readText("input/missing.txt");',
    });
    assert.equal(undeclared.done.ok, false);
    assert.equal(undeclared.done.error.code, 'INPUT_FILE_NOT_DECLARED');

    const mismatch = await runWorker({
        code: 'await runtime.files.readText("input/data.bin");',
        inputFiles: [{path: 'input/data.bin', type: 'bytes', content: new Uint8Array([1]).buffer, size: 1}],
    });
    assert.equal(mismatch.done.ok, false);
    assert.equal(mismatch.done.error.code, 'FILE_TYPE_MISMATCH');
});

test('场景：固定输出声明的文本或二进制类型与实际写入方法必须一致', async () => {
    const {done} = await runWorker({
        code: 'runtime.files.writeBytes("output/result.txt", new Uint8Array([1]));',
        outputFiles: [{path: 'output/result.txt', type: 'text', overwrite: true}],
    });

    assert.equal(done.ok, false);
    assert.equal(done.error.code, 'OUTPUT_TYPE_CONFLICT');
    assert.deepEqual(done.outputFiles, []);
});

test('场景：未声明输出路径和目录穿越都会终止脚本且不产生文件', async () => {
    const undeclared = await runWorker({
        code: 'runtime.files.writeText("other/result.txt", "x");',
        outputDirectories: [{path: 'output', overwrite: false}],
    });
    assert.equal(undeclared.done.ok, false);
    assert.equal(undeclared.done.error.code, 'OUTPUT_PATH_NOT_DECLARED');
    assert.deepEqual(undeclared.done.outputFiles, []);

    const traversal = await runWorker({
        code: 'runtime.files.writeText("output/../../secret.txt", "x");',
        outputDirectories: [{path: 'output', overwrite: false}],
    });
    assert.equal(traversal.done.ok, false);
    assert.equal(traversal.done.error.code, 'INVALID_FILE_PATH');
    assert.deepEqual(traversal.done.outputFiles, []);

    const absolute = await runWorker({
        code: 'runtime.files.writeText("/output/result.txt", "x");',
        outputDirectories: [{path: 'output', overwrite: false}],
    });
    assert.equal(absolute.done.ok, false);
    assert.equal(absolute.done.error.code, 'INVALID_FILE_PATH');
});

test('场景：单个输出或累计输出超过写入限制时不会返回部分文件', async () => {
    const single = await runWorker({
        code: 'runtime.files.writeText("output/result.txt", "你好");',
        outputFiles: [{path: 'output/result.txt', type: 'text', overwrite: true}],
        limits: {...DEFAULT_LIMITS, maxOutputFileBytes: 4},
    });
    assert.equal(single.done.ok, false);
    assert.equal(single.done.error.code, 'FILE_TOO_LARGE');
    assert.equal(single.done.error.phase, 'output');
    assert.deepEqual(single.done.outputFiles, []);

    const total = await runWorker({
        code: [
            'runtime.files.writeText("output/one.txt", "123");',
            'runtime.files.writeText("output/two.txt", "456");',
        ].join('\n'),
        outputDirectories: [{path: 'output', overwrite: false}],
        limits: {...DEFAULT_LIMITS, maxOutputFileBytes: 4, maxOutputTotalBytes: 5},
    });
    assert.equal(total.done.ok, false);
    assert.equal(total.done.error.code, 'FILE_TOO_LARGE');
    assert.equal(total.done.error.phase, 'output-total');
    assert.deepEqual(total.done.outputFiles, []);
});

test('场景：脚本在登记输出后抛错时所有待输出内容都会丢弃', async () => {
    const {done} = await runWorker({
        code: [
            'runtime.files.writeText("output/result.txt", "temporary");',
            'throw new Error("failed after write");',
        ].join('\n'),
        outputFiles: [{path: 'output/result.txt', type: 'text', overwrite: true}],
    });

    assert.equal(done.ok, false);
    assert.equal(done.error.code, 'SCRIPT_ERROR');
    assert.deepEqual(done.outputFiles, []);
});

test('场景：动态输出文件数量超过上限时整次执行失败', async () => {
    const {done} = await runWorker({
        code: [
            'runtime.files.writeText("output/one.txt", "1");',
            'runtime.files.writeText("output/two.txt", "2");',
        ].join('\n'),
        outputDirectories: [{path: 'output', overwrite: false}],
    }, {sourceOptions: {maxFileCount: 1}});

    assert.equal(done.ok, false);
    assert.equal(done.error.code, 'OUTPUT_FILE_COUNT_EXCEEDED');
    assert.deepEqual(done.outputFiles, []);
});

test('场景：解压清单中同一路径同时作为文件和父目录时整次执行失败', async () => {
    const {done} = await runWorker({
        code: [
            'runtime.files.writeBytes("output/extracted/docs", new Uint8Array([1]));',
            'runtime.files.writeText("output/extracted/docs/readme.txt", "readme");',
        ].join('\n'),
        outputDirectories: [{path: 'output/extracted', overwrite: false}],
    });

    assert.equal(done.ok, false);
    assert.equal(done.error.code, 'OUTPUT_PATH_TYPE_CONFLICT');
    assert.deepEqual(done.outputFiles, []);
});

test('场景：同一路径重复写入时最后一次内容生效且总大小重新计算', async () => {
    const {done} = await runWorker({
        code: [
            'runtime.files.writeText("output/result.txt", "12345");',
            'runtime.files.writeText("output/result.txt", "12");',
            'runtime.files.writeText("output/other.txt", "345");',
        ].join('\n'),
        outputDirectories: [{path: 'output', overwrite: true}],
        limits: {...DEFAULT_LIMITS, maxOutputFileBytes: 5, maxOutputTotalBytes: 5},
    });

    assert.equal(done.ok, true);
    assert.equal(done.outputFiles.length, 2);
    assert.equal(done.outputFiles.find((file) => file.path === 'output/result.txt').content, '12');
    assert.equal(done.outputFiles.find((file) => file.path === 'output/result.txt').size, 2);
});

test('场景：网络响应超过下载限制时请求被中止且错误包含大小信息', async () => {
    const {done} = await runWorker({
        code: 'await runtime.request({ url: "https://example.test/file", responseType: "bytes" });',
        limits: {...DEFAULT_LIMITS, maxDownloadBytes: 4, maxDownloadTotalBytes: 4},
    }, {
        fetchImpl: async () => new Response('12345', {headers: {'content-length': '5'}}),
    });

    assert.equal(done.ok, false);
    assert.equal(done.error.code, 'FILE_TOO_LARGE');
    assert.equal(done.error.phase, 'download');
    assert.equal(done.error.size, 5);
    assert.equal(done.error.maxSize, 4);
    assert.equal(done.error.partialFileDiscarded, true);
});

test('场景：未知响应长度在流式读取超过限制后会取消并丢弃部分内容', async () => {
    let cancelled = false;
    const chunks = ['123', '456'].map((value) => new TextEncoder().encode(value));
    const response = {
        body: {
            getReader() {
                return {
                    async read() {
                        const value = chunks.shift();
                        return value ? {done: false, value} : {done: true, value: undefined};
                    },
                    async cancel() {
                        cancelled = true;
                    },
                    releaseLock() {},
                };
            },
        },
        headers: new Headers(),
        ok: true,
        status: 200,
        statusText: 'OK',
    };
    const {done} = await runWorker({
        code: 'await runtime.request({ url: "https://example.test/chunked", responseType: "bytes" });',
        limits: {...DEFAULT_LIMITS, maxDownloadBytes: 5, maxDownloadTotalBytes: 5},
    }, {
        fetchImpl: async () => response,
    });

    assert.equal(done.ok, false);
    assert.equal(done.error.code, 'FILE_TOO_LARGE');
    assert.equal(done.error.size, 6);
    assert.equal(done.error.partialFileDiscarded, true);
    assert.equal(cancelled, true);
});

test('场景：多次请求累计响应超过总下载限制时后续请求失败', async () => {
    const {done} = await runWorker({
        code: [
            'await runtime.request({ url: "https://example.test/one", responseType: "text" });',
            'await runtime.request({ url: "https://example.test/two", responseType: "text" });',
        ].join('\n'),
        limits: {...DEFAULT_LIMITS, maxDownloadBytes: 4, maxDownloadTotalBytes: 5},
    }, {
        fetchImpl: async () => new Response('123', {headers: {'content-length': '3'}}),
    });

    assert.equal(done.ok, false);
    assert.equal(done.error.code, 'FILE_TOO_LARGE');
    assert.equal(done.error.phase, 'download-total');
    assert.equal(done.error.size, 6);
});

test('场景：网络请求数量超过内部上限时脚本失败', async () => {
    const {done} = await runWorker({
        code: [
            'await runtime.request({ url: "https://example.test/one" });',
            'await runtime.request({ url: "https://example.test/two" });',
        ].join('\n'),
    }, {
        fetchImpl: async () => new Response('ok'),
        sourceOptions: {maxRequestCount: 1},
    });

    assert.equal(done.ok, false);
    assert.equal(done.error.code, 'REQUEST_LIMIT_EXCEEDED');
});

test('场景：单次请求超过指定超时时间时返回结构化超时错误', async () => {
    const {done} = await runWorker({
        code: 'await runtime.request({ url: "https://example.test/slow", timeoutMs: 1 });',
    }, {
        fetchImpl: async (url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {once: true});
        }),
    });

    assert.equal(done.ok, false);
    assert.equal(done.error.code, 'REQUEST_TIMEOUT');
    assert.equal(done.error.phase, 'download');
});

test('场景：后端未启用时请求直接访问目标地址并返回非代理标记', async () => {
    let requestedUrl = '';
    const {done} = await runWorker({
        code: 'const response = await runtime.request({ url: "https://example.test/direct" }); return { proxied: response.proxied, ok: response.ok };',
    }, {
        fetchImpl: async (url) => {
            requestedUrl = String(url);
            return new Response('ok');
        },
    });

    assert.equal(done.ok, true);
    assert.equal(requestedUrl, 'https://example.test/direct');
    assert.deepEqual(done.result, {proxied: false, ok: true});
});

test('场景：后端启用时请求走内部代理但脚本无法读取代理地址', async () => {
    let requestedUrl = '';
    const {done} = await runWorker({
        code: [
            'const response = await runtime.request({ url: "https://example.test/api?a=1", responseType: "json" });',
            'return { proxy: runtime.network.proxy, proxied: response.proxied, value: response.body.value, networkKeyCount: Object.keys(runtime.network).length, hasBackendBaseUrl: "backendBaseUrl" in runtime.network };',
        ].join('\n'),
        network: {
            proxy: true,
            backendBaseUrl: 'https://backend.test',
            requestTimeoutMs: 1000,
            maxRequestTimeoutMs: 5000,
        },
    }, {
        fetchImpl: async (url) => {
            requestedUrl = String(url);
            return new Response('{"value":7}', {status: 200, headers: {'content-type': 'application/json'}});
        },
    });

    assert.equal(done.ok, true);
    assert.deepEqual(done.result, {proxy: true, proxied: true, value: 7, networkKeyCount: 1, hasBackendBaseUrl: false});
    const proxyUrl = new URL(requestedUrl);
    assert.equal(proxyUrl.origin, 'https://backend.test');
    assert.equal(proxyUrl.pathname, '/api/requestProxy/api');
    assert.equal(proxyUrl.searchParams.get('X-Proxy-Host'), 'https://example.test');
    assert.equal(proxyUrl.searchParams.get('a'), '1');
});

test('场景：代理请求失败时不会自动降级为直接请求', async () => {
    const requestedUrls = [];
    const {done} = await runWorker({
        code: 'await runtime.request({ url: "https://example.test/api" });',
        network: {
            proxy: true,
            backendBaseUrl: 'https://backend.test',
            requestTimeoutMs: 1000,
            maxRequestTimeoutMs: 5000,
        },
    }, {
        fetchImpl: async (url) => {
            requestedUrls.push(String(url));
            throw new Error('proxy unavailable');
        },
    });

    assert.equal(done.ok, false);
    assert.equal(requestedUrls.length, 1);
    assert.equal(new URL(requestedUrls[0]).origin, 'https://backend.test');
});

test('场景：脚本可以直接调用原生网络接口', async () => {
    const {done} = await runWorker({
        code: 'const response = await fetch("https://example.test"); return await response.text();',
    }, {
        fetchImpl: async () => new Response('native'),
    });

    assert.equal(done.ok, true);
    assert.deepEqual(done.result, {text: 'native', text_chars: 6, returned_chars: 6, truncated: false});
});

test('场景：脚本可以访问 OPFS 但运行时不提供临时文件接口', async () => {
    const opfs = await runWorker({
        code: 'return Boolean(await navigator.storage.getDirectory());',
    });
    assert.equal(opfs.done.ok, true);
    assert.equal(opfs.done.result, true);

    const temp = await runWorker({
        code: 'return { hasTempApi: "temp" in runtime.files };',
    });
    assert.equal(temp.done.ok, true);
    assert.deepEqual(temp.done.result, {hasTempApi: false});
});

test('场景：结构化错误会保留阶段、路径、大小和下载状态', () => {
    const error = new Error('too large');
    Object.assign(error, {
        code: 'FILE_TOO_LARGE',
        phase: 'input',
        path: 'input/data.bin',
        size: 10,
        maxSize: 5,
        requestAborted: true,
        partialFileDiscarded: true,
    });

    assert.deepEqual(serializeAiJavaScriptError(error), {
        name: 'Error',
        code: 'FILE_TOO_LARGE',
        message: 'too large',
        phase: 'input',
        path: 'input/data.bin',
        size: 10,
        max_size: 5,
        request_aborted: true,
        partial_file_discarded: true,
    });
});

async function runWorker(payload = {}, {fetchImpl, sourceOptions} = {}) {
    const messages = [];
    const context = {
        AbortController,
        ArrayBuffer,
        Blob,
        DOMException,
        Headers,
        Map,
        Promise,
        RangeError,
        ReadableStream,
        Response,
        Set,
        TextDecoder,
        TextEncoder,
        Uint8Array,
        URL,
        clearTimeout,
        console: {
            debug() {},
            error() {},
            info() {},
            log() {},
            warn() {},
        },
        fetch: fetchImpl || (async () => new Response('ok')),
        navigator: {storage: {getDirectory: async () => ({})}},
        performance,
        postMessage(message) {
            messages.push(structuredClone(message));
        },
        setTimeout,
    };
    context.self = context;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(createAiJavaScriptWorkerSource(sourceOptions), context);

    await context.onmessage({
        data: {
            type: 'run',
            code: 'return null;',
            input: {},
            inputFiles: [],
            outputFiles: [],
            outputDirectories: [],
            limits: DEFAULT_LIMITS,
            network: {
                proxy: false,
                backendBaseUrl: '',
                requestTimeoutMs: 1000,
                maxRequestTimeoutMs: 5000,
            },
            ...payload,
        },
    });

    return {
        messages,
        done: messages.findLast((message) => message.type === 'done'),
    };
}
