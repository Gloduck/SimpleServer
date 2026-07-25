import {expect, test} from '@playwright/test';
import {openRuntimeHarness} from '../test-helpers.js';

test.beforeEach(async ({page}) => openRuntimeHarness(page));

test('正式 AI Worker 自动识别 CommonJS、等待入口 Promise 并只提取声明输出', async ({page}) => {
    const outcome = await runAiWorker(page, createPayload({
        prepared: {
            format: 'auto',
            entryPath: 'workspace/main.cjs',
            cwd: 'workspace',
            input: {value: 3},
            env: {TOKEN: 'secret'},
            args: ['one', 2],
            files: [{path: 'workspace/input.txt', content: 'hello', mimeType: 'text/plain'}],
            code: [
                'const fs = require("node:fs");',
                'async function main() {',
                '  console.info("running", input.value);',
                '  const source = fs.readFileSync("input.txt", "utf8");',
                '  fs.writeFileSync("result.txt", `${source}:${process.env.TOKEN}:${process.argv.slice(2).join(",")}`);',
                '  fs.writeFileSync("temporary.txt", "discard");',
                '  return {value: input.value * 2, cwd: process.cwd(), argv: process.argv.slice(2)};',
                '}',
                'main().catch((error) => { console.error(error); throw error; });',
            ].join('\n'),
        },
        outputFiles: [{path: 'workspace/result.txt', type: 'text', overwrite: true}],
    }));

    expect(outcome.ok).toBe(true);
    expect(outcome.result.value).toBe(6);
    expect(outcome.result.cwd.text).toBe('/workspace');
    expect(outcome.result.argv.map((value) => value.text)).toEqual(['one', '2']);
    expect(outcome.streamedLogs).toHaveLength(1);
    expect(outcome.streamedLogs[0].level).toBe('info');
    expect(outcome.streamedLogs[0].args[0].text).toBe('running');
    expect(outcome.streamedLogs[0].args[1]).toBe(3);
    expect(outcome.outputFiles).toEqual([expect.objectContaining({
        path: 'workspace/result.txt',
        type: 'text',
        content: 'hello:secret:one,2',
    })]);
    expect(outcome.outputFiles.some((file) => file.path === 'workspace/temporary.txt')).toBe(false);
    expect(outcome.logStats).toEqual({emitted: 1, dropped: 0});
});

test('正式 AI Worker 执行 ESM 顶层 await 并返回命名和默认导出', async ({page}) => {
    const outcome = await runAiWorker(page, createPayload({
        prepared: {
            format: 'module',
            entryPath: 'workspace/main.mjs',
            cwd: 'workspace',
            input: {value: 4},
            env: {MODE: 'test'},
            args: ['argument'],
            files: [],
            code: [
                'export const value = await Promise.resolve(input.value * 2);',
                'export default `${process.env.MODE}:${process.argv[2]}`;',
            ].join('\n'),
        },
    }));

    expect(outcome.ok).toBe(true);
    expect(outcome.result.value).toBe(8);
    expect(outcome.result.default.text).toBe('test:argument');
    expect(outcome.outputFiles).toEqual([]);
});

test('正式 AI Worker 可执行 node:crypto Web Crypto 和 Noble Hash', async ({page}) => {
    const outcome = await runAiWorker(page, createPayload({
        prepared: {
            format: 'commonjs',
            entryPath: 'workspace/main.cjs',
            cwd: 'workspace',
            input: {},
            env: {},
            args: [],
            files: [],
            code: [
                'const crypto = require("node:crypto");',
                'module.exports = (async () => {',
                '  const subtle = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("worker"));',
                '  return {',
                '    subtle: Buffer.from(subtle).toString("hex"),',
                '    hash: crypto.createHash("sha3-256").update("worker").digest("hex"),',
                '  };',
                '})();',
            ].join('\n'),
        },
    }));

    expect(outcome.ok).toBe(true);
    expect(outcome.result.subtle.text).toBe('87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e');
    expect(outcome.result.hash.text).toBe('373699f7b2b39c3345a8a58f9aa27118e111f7e0ea1966d7f24f698c0b8fcefb');
});

test('正式 AI Worker 等待 ESM 默认导出的 Promise', async ({page}) => {
    await page.route('**/test/esm-default-promise', (route) => route.fulfill({body: 'awaited'}));
    const outcome = await runAiWorker(page, createPayload({
        prepared: {
            format: 'module',
            entryPath: 'workspace/main.mjs',
            cwd: 'workspace',
            input: {},
            env: {},
            args: [],
            files: [],
            code: [
                'async function main() {',
                '  const response = await fetch(new URL("/test/esm-default-promise", location.origin));',
                '  return response.text();',
                '}',
                'export default main();',
            ].join('\n'),
        },
    }));

    expect(outcome.ok).toBe(true);
    expect(outcome.result.default.text).toBe('awaited');
    expect(outcome.network).toEqual({requestCount: 1, responseBytes: 7});
});

test('auto CommonJS 等待异步 IIFE 并返回声明的二进制下载', async ({page}) => {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4]);
    await page.route('**/test/random-image.jpg', (route) => route.fulfill({
        body: image,
        contentType: 'image/jpeg',
    }));
    const outcome = await runAiWorker(page, createPayload({
        prepared: {
            format: 'auto',
            entryPath: '.runscript/entry.js',
            cwd: '',
            input: {},
            env: {},
            args: [],
            files: [],
            code: [
                'const fs = require("node:fs");',
                'const path = require("node:path");',
                'const outputPath = path.resolve(process.cwd(), "random-image.jpg");',
                '(async () => {',
                '  const response = await fetch(new URL("/test/random-image.jpg", location.origin));',
                '  const bytes = Buffer.from(await response.arrayBuffer());',
                '  fs.writeFileSync(outputPath, bytes);',
                '})();',
            ].join('\n'),
        },
        outputFiles: [{path: 'random-image.jpg', type: 'bytes', overwrite: true}],
    }));

    expect(outcome.ok).toBe(true);
    expect(outcome.network).toEqual({requestCount: 1, responseBytes: image.byteLength});
    expect(Array.from(outcome.outputFiles[0].content)).toEqual(Array.from(image));
});

test('正式 AI Worker 的 fetch 与 XMLHttpRequest 共用网络统计和限制', async ({page}) => {
    await page.route('**/test/runtime-data-*', async (route) => {
        const body = route.request().url().endsWith('-fetch') ? 'one' : 'two';
        await route.fulfill({status: 200, body, headers: {'content-type': 'text/plain'}});
    });
    const outcome = await runAiWorker(page, createPayload({
        prepared: {
            format: 'commonjs',
            entryPath: 'main.cjs',
            cwd: '',
            input: {},
            env: {},
            args: [],
            files: [],
            code: [
                'const xhrResult = new Promise((resolve, reject) => {',
                '  const request = new XMLHttpRequest();',
                '  request.open("GET", new URL("/test/runtime-data-xhr", location.origin));',
                '  request.onload = () => resolve(request.responseText);',
                '  request.onerror = reject;',
                '  request.send();',
                '});',
                'module.exports = Promise.all([',
                '  fetch(new URL("/test/runtime-data-fetch", location.origin)).then((response) => response.text()),',
                '  xhrResult,',
                ']);',
            ].join('\n'),
        },
    }));

    expect(outcome.ok).toBe(true);
    expect(outcome.result.map((value) => value.text)).toEqual(['one', 'two']);
    expect(outcome.network.requestCount).toBe(2);
    expect(outcome.network.responseBytes).toBe(6);
});

test('依赖准备下载与脚本执行下载使用独立累计预算', async ({page}) => {
    const runtimeBody = 'r'.repeat(30);
    await page.route('**/test/runtime-budget', (route) => route.fulfill({body: runtimeBody}));
    const basePayload = createPayload({
        network: {
            serverUrl: '',
            baseUrl: 'http://127.0.0.1:4174/test/runtime-harness.html',
            limits: {
                maxRequestCount: 20,
                maxResponseBytes: 40,
                maxResponseTotalBytes: 40,
                defaultTimeoutMs: 1000,
                maxTimeoutMs: 5000,
            },
        },
    });
    const outcome = await page.evaluate(async ({payload, runtimeBody: expectedBody}) => {
        const dependencySource = 'module.exports = "dependency";';
        const preparationNetwork = new globalThis.runtimeHarness.NetworkLimit({
            fetch: async () => new Response(dependencySource),
        }, {
            maxRequestCount: 10,
            maxResponseBytes: 40,
            maxResponseTotalBytes: 40,
        });
        const prepared = await globalThis.runtimeHarness.prepareRunScript({
            format: 'commonjs',
            code: [
                'const dependency = require("https://dependency.test/value.js");',
                'module.exports = fetch(new URL("/test/runtime-budget", location.origin))',
                '  .then((response) => response.text())',
                '  .then((body) => ({dependency, body}));',
            ].join('\n'),
        }, {
            fetch: preparationNetwork.fetch,
            limits: {
                maxDownloadBytes: 40,
                maxDownloadTotalBytes: 40,
                maxSourceBytes: 2048,
                maxTotalBytes: 2048,
            },
        });
        const result = await globalThis.runtimeHarness.runAiNodeWorker({...payload, prepared}, {timeoutMs: 5000});
        return {
            result,
            preparation: preparationNetwork.getUsage(),
            dependencyBytes: new TextEncoder().encode(dependencySource).byteLength,
            runtimeBytes: new TextEncoder().encode(expectedBody).byteLength,
        };
    }, {payload: basePayload, runtimeBody});

    expect(outcome.preparation).toEqual({requestCount: 1, responseBytes: outcome.dependencyBytes});
    expect(outcome.result.ok).toBe(true);
    expect(outcome.result.network).toEqual({requestCount: 1, responseBytes: outcome.runtimeBytes});
    expect(outcome.preparation.responseBytes + outcome.result.network.responseBytes).toBeGreaterThan(40);
    expect(outcome.result.result).toEqual({
        dependency: expect.objectContaining({text: 'dependency'}),
        body: expect.objectContaining({text: runtimeBody}),
    });
});

test('未等待的异步文件写入返回明确的待处理操作错误', async ({page}) => {
    const outcome = await runAiWorker(page, createPayload({
        prepared: {
            format: 'commonjs',
            entryPath: 'main.cjs',
            cwd: '',
            input: {},
            env: {},
            args: [],
            files: [],
            code: [
                'const fs = require("node:fs/promises");',
                'fs.writeFile("output.bin", new Uint8Array(8 * 1024 * 1024));',
                'module.exports = "finished";',
            ].join('\n'),
        },
        outputFiles: [{path: 'output.bin', type: 'bytes', overwrite: true}],
        fileLimits: {maxReadBytes: 16 * 1024 * 1024, maxWriteBytes: 16 * 1024 * 1024, maxEntryCount: 100},
        outputLimits: {maxOutputFileBytes: 16 * 1024 * 1024, maxOutputTotalBytes: 16 * 1024 * 1024, maxOutputFileCount: 100},
    }));

    expect(outcome.ok).toBe(false);
    expect(outcome.error.code).toBe('UNAWAITED_ASYNC_OPERATION');
    expect(outcome.error.operations).toContain('node:fs/promises.writeFile');
    expect(outcome.outputFiles).toEqual([]);
});

test('页面侧超时会终止无响应的正式 AI Worker', async ({page}) => {
    const error = await page.evaluate(async (payload) => {
        try {
            await globalThis.runtimeHarness.runAiNodeWorker(payload, {timeoutMs: 25});
            return null;
        } catch (caught) {
            return {code: caught.code, phase: caught.phase};
        }
    }, createPayload({
        prepared: {
            format: 'commonjs',
            entryPath: 'main.cjs',
            cwd: '',
            input: {},
            env: {},
            args: [],
            files: [],
            code: 'while (true) {}',
        },
    }));

    expect(error).toEqual({code: 'SCRIPT_TIMEOUT', phase: 'execution'});
});

test('页面侧保留 Worker 原始错误且空错误事件不会覆盖结构化结果', async ({page}) => {
    const result = await page.evaluate(async () => {
        const NativeWorker = globalThis.Worker;
        try {
            class DetailedErrorWorker {
                terminate() {}
                postMessage() {
                    queueMicrotask(() => this.onerror({
                        preventDefault() {},
                        message: '',
                        filename: 'worker-entry.js',
                        lineno: 7,
                        colno: 9,
                        error: Object.assign(new TypeError('worker exploded'), {
                            code: 'WORKER_EXPLODED',
                            phase: 'execution',
                        }),
                    }));
                }
            }
            globalThis.Worker = DetailedErrorWorker;
            let detailed;
            try {
                await globalThis.runtimeHarness.runAiNodeWorker({}, {timeoutMs: 1000});
            } catch (error) {
                detailed = {
                    name: error.name,
                    code: error.code,
                    message: error.message,
                    phase: error.phase,
                    filename: error.filename,
                    lineno: error.lineno,
                    colno: error.colno,
                    stack: error.stack,
                };
            }

            class RacingWorker {
                terminate() {}
                postMessage(message, ports) {
                    queueMicrotask(() => this.onerror({preventDefault() {}, message: '', error: null}));
                    queueMicrotask(() => ports[0].postMessage({
                        type: 'done',
                        ok: false,
                        error: {code: 'STRUCTURED_ERROR', message: 'structured failure'},
                    }));
                }
            }
            globalThis.Worker = RacingWorker;
            const raced = await globalThis.runtimeHarness.runAiNodeWorker({}, {timeoutMs: 1000});
            return {detailed, raced};
        } finally {
            globalThis.Worker = NativeWorker;
        }
    });

    expect(result.detailed).toEqual(expect.objectContaining({
        name: 'TypeError',
        code: 'WORKER_EXPLODED',
        message: 'worker exploded',
        phase: 'execution',
        filename: 'worker-entry.js',
        lineno: 7,
        colno: 9,
    }));
    expect(result.detailed.stack).toContain('worker exploded');
    expect(result.raced).toEqual({
        type: 'done',
        ok: false,
        error: {code: 'STRUCTURED_ERROR', message: 'structured failure'},
    });
});

function createPayload(overrides = {}) {
    return {
        prepared: {
            format: 'commonjs',
            entryPath: 'main.cjs',
            cwd: '',
            input: {},
            env: {},
            args: [],
            files: [],
            code: 'module.exports = null;',
        },
        outputFiles: [],
        outputDirectories: [],
        fileLimits: {
            maxReadBytes: 1024 * 1024,
            maxWriteBytes: 1024 * 1024,
            maxEntryCount: 100,
        },
        outputLimits: {
            maxOutputFileBytes: 1024 * 1024,
            maxOutputTotalBytes: 1024 * 1024,
            maxOutputFileCount: 100,
        },
        network: {
            serverUrl: '',
            baseUrl: 'http://127.0.0.1:4174/test/runtime-harness.html',
            limits: {
                maxRequestCount: 20,
                maxResponseBytes: 1024 * 1024,
                maxResponseTotalBytes: 1024 * 1024,
                defaultTimeoutMs: 1000,
                maxTimeoutMs: 5000,
            },
        },
        logging: {
            maxEntries: 100,
            serialization: {maxStringLength: 5000, maxCollectionItems: 100, maxDepth: 5},
        },
        serialization: {maxStringLength: 5000, maxCollectionItems: 100, maxDepth: 5},
        ...overrides,
    };
}

async function runAiWorker(page, payload) {
    return page.evaluate(async (workerPayload) => {
        const streamedLogs = [];
        const result = await globalThis.runtimeHarness.runAiNodeWorker(workerPayload, {
            timeoutMs: 5000,
            onLog: (log) => streamedLogs.push(log),
        });
        return {...result, streamedLogs};
    }, payload);
}
