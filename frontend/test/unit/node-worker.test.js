import assert from 'node:assert/strict';
import test from 'node:test';
import {NodeWorker} from '../../src/shared/node-worker/node-worker.js';

function createWorker(Worker, options = {}) {
    return new Worker(options);
}

const createNodeWorker = (options) => createWorker(NodeWorker, options);

async function withGlobalFetch(fetch, callback) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetch;
    try {
        return await callback();
    } finally {
        globalThis.fetch = originalFetch;
    }
}

test('场景：NodeWorker 执行 CommonJS 并默认使用原生 fetch', async () => {
    const requests = [];
    await withGlobalFetch(async (url) => {
        requests.push(String(url));
        return new Response('remote');
    }, async () => {
        const worker = createNodeWorker({
            format: 'commonjs',
            input: {value: 4},
            code: [
                'module.exports = (async () => ({',
                '  value: input.value * 2,',
                '  body: await (await fetch("https://example.test/data")).text(),',
                '}))();',
            ].join('\n'),
        });

        const result = await worker.run();
        assert.deepEqual(result.exports, {value: 8, body: 'remote'});
        assert.deepEqual(requests, ['https://example.test/data']);
    });
});

test('场景：基础 NodeWorker 使用空 policy 提供不附加限制的 node:fs', async () => {
    const worker = createNodeWorker({
        format: 'commonjs',
        code: [
            'const fs = require("node:fs");',
            'fs.writeFileSync("output.txt", "ok");',
            'module.exports = fs.readFileSync("output.txt", "utf8");',
        ].join('\n'),
    });

    assert.equal(worker.fileSystem.policy, null);
    assert.equal((await worker.run()).exports, 'ok');
});

test('场景：NodeWorker 使用原生 ESM 执行 export 和顶层 await', async () => {
    const worker = createNodeWorker({
        format: 'module',
        code: [
            'export const value = await Promise.resolve(7);',
            'export default value * 3;',
        ].join('\n'),
    });

    const result = await worker.run();
    assert.equal(result.exports.value, 7);
    assert.equal(result.exports.default, 21);
});

test('场景：NodeWorker 默认自动识别 ESM 源码', async () => {
    const result = await createNodeWorker({code: 'export default await Promise.resolve(11);'}).run();
    assert.equal(result.exports.default, 11);
});

test('场景：NodeWorker 从映射到本地的 node_modules 加载 CommonJS 包', async () => {
    const worker = createNodeWorker({
        entryPath: 'workspace/src/main.cjs',
        files: [
            {path: 'workspace/src/main.cjs', content: 'module.exports = require("example");'},
            {path: 'workspace/node_modules/example/package.json', content: '{"main":"index.cjs"}'},
            {path: 'workspace/node_modules/example/index.cjs', content: 'module.exports = "commonjs-package";'},
        ],
    });

    assert.equal((await worker.run()).exports, 'commonjs-package');
});

test('场景：NodeWorker 从映射到本地的 node_modules 加载 ESM 包', async () => {
    const worker = createNodeWorker({
        entryPath: 'workspace/src/main.mjs',
        files: [
            {path: 'workspace/src/main.mjs', content: 'import value from "example"; export default value;'},
            {
                path: 'workspace/node_modules/example/package.json',
                content: '{"type":"module","exports":"./index.mjs"}',
            },
            {path: 'workspace/node_modules/example/index.mjs', content: 'export default "esm-package";'},
        ],
    });

    assert.equal((await worker.run()).exports.default, 'esm-package');
});

test('场景：NodeWorker 通过 Memory FileSystem 加载 CommonJS、JSON 并提供 node:fs', async () => {
    const worker = createNodeWorker({
        entryPath: 'workspace/main.cjs',
        cwd: 'workspace',
        files: [
            {
                path: 'workspace/main.cjs',
                content: [
                    'const fs = require("node:fs");',
                    'const helper = require("./helper");',
                    'const config = require("./config.json");',
                    'const input = fs.readFileSync("input.txt", "utf8");',
                    'fs.writeFileSync("output.txt", helper(input) + config.suffix);',
                    'module.exports = {cwd: process.cwd(), exists: fs.existsSync("output.txt")};',
                ].join('\n'),
            },
            {path: 'workspace/helper.js', content: 'module.exports = (value) => value.toUpperCase();'},
            {path: 'workspace/config.json', content: '{"suffix":"!"}'},
            {path: 'workspace/input.txt', content: 'hello', mimeType: 'text/plain'},
        ],
    });

    const result = await worker.run();
    assert.deepEqual(result.exports, {cwd: '/workspace', exists: true});
    assert.equal(worker.fileSystem.readTextSync('workspace/output.txt'), 'HELLO!');
});

test('场景：NodeWorker 从内存文件系统加载相对 ESM 模块', async () => {
    const worker = createNodeWorker({
        entryPath: 'workspace/main.mjs',
        files: [
            {
                path: 'workspace/main.mjs',
                content: 'import value, {name} from "./helper.mjs"; export const result = `${name}:${value * 2}`;',
            },
            {
                path: 'workspace/helper.mjs',
                content: 'export const name = "esm"; export default 6;',
            },
        ],
    });

    const result = await worker.run();
    assert.equal(result.exports.result, 'esm:12');
});

test('场景：NodeWorker 的 CommonJS 缓存支持循环依赖', async () => {
    const worker = createNodeWorker({
        entryPath: 'workspace/main.cjs',
        files: [
            {path: 'workspace/main.cjs', content: 'module.exports = require("./a");'},
            {
                path: 'workspace/a.js',
                content: 'exports.name = "a"; const b = require("./b"); exports.fromB = b.name; exports.seenByB = b.fromA;',
            },
            {
                path: 'workspace/b.js',
                content: 'exports.name = "b"; exports.fromA = require("./a").name;',
            },
        ],
    });

    const result = await worker.run();
    assert.deepEqual(result.exports, {name: 'a', fromB: 'b', seenByB: 'a'});
});

test('场景：ESM 通过 node:fs 读写同一个内存 FileSystem', async () => {
    const worker = createNodeWorker({
        entryPath: 'workspace/main.mjs',
        cwd: 'workspace',
        files: [
            {
                path: 'workspace/main.mjs',
                content: [
                    'import fs from "node:fs";',
                    'const value = fs.readFileSync("input.txt", "utf8");',
                    'fs.writeFileSync("output.txt", `${value}-esm`);',
                    'export default value;',
                ].join('\n'),
            },
            {path: 'workspace/input.txt', content: 'shared'},
        ],
    });

    const result = await worker.run();
    assert.equal(result.exports.default, 'shared');
    assert.equal(worker.fileSystem.readTextSync('workspace/output.txt'), 'shared-esm');
});
