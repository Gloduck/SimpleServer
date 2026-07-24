import {expect, test} from '@playwright/test';
import {openRuntimeHarness} from '../test-helpers.js';

test.beforeEach(async ({page}) => openRuntimeHarness(page));

test('正式 AI Worker 执行 CommonJS、流式日志并只提取声明输出', async ({page}) => {
    const outcome = await runAiWorker(page, createPayload({
        prepared: {
            format: 'commonjs',
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
