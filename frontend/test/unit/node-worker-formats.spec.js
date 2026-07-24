import {expect, test} from '@playwright/test';
import {openRuntimeHarness, runNodeWorker} from '../test-helpers.js';

test.beforeEach(async ({page}) => openRuntimeHarness(page));

test('CommonJS 支持 input、异步导出和浏览器 fetch', async ({page}) => {
    await page.route('https://example.test/data', (route) => route.fulfill({body: 'remote'}));
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        input: {value: 4},
        code: [
            'module.exports = (async () => ({',
            '  value: input.value * 2,',
            '  body: await (await fetch("https://example.test/data")).text(),',
            '}))();',
        ].join('\n'),
    });

    expect(result.exports).toEqual({value: 8, body: 'remote'});
});

test('ESM 支持自动识别、命名导出、默认导出和顶层 await', async ({page}) => {
    const result = await runNodeWorker(page, {
        code: [
            'export const value = await Promise.resolve(7);',
            'export default value * 3;',
        ].join('\n'),
    });

    expect(result.exports).toEqual({default: 21, value: 7});
});

test('CommonJS 从 node_modules 按 package.json main 加载包', async ({page}) => {
    const result = await runNodeWorker(page, {
        entryPath: 'workspace/src/main.cjs',
        files: [
            {path: 'workspace/src/main.cjs', content: 'module.exports = require("example");'},
            {path: 'workspace/node_modules/example/package.json', content: '{"main":"lib/index.cjs"}'},
            {path: 'workspace/node_modules/example/lib/index.cjs', content: 'module.exports = "commonjs-package";'},
        ],
    });

    expect(result.exports).toBe('commonjs-package');
});

test('ESM 从 node_modules 按 exports 和 type 加载包', async ({page}) => {
    const result = await runNodeWorker(page, {
        entryPath: 'workspace/src/main.mjs',
        files: [
            {path: 'workspace/src/main.mjs', content: 'import value from "example"; export default value;'},
            {path: 'workspace/node_modules/example/package.json', content: '{"type":"module","exports":"./index.js"}'},
            {path: 'workspace/node_modules/example/index.js', content: 'export default "esm-package";'},
        ],
    });

    expect(result.exports.default).toBe('esm-package');
});

test('CommonJS 加载相对模块、扩展名省略和 JSON', async ({page}) => {
    const result = await runNodeWorker(page, {
        entryPath: 'workspace/main.cjs',
        files: [
            {path: 'workspace/main.cjs', content: 'module.exports = require("./helper")("value") + require("./config.json").suffix;'},
            {path: 'workspace/helper.js', content: 'module.exports = (value) => value.toUpperCase();'},
            {path: 'workspace/config.json', content: '{"suffix":"!"}'},
        ],
    });

    expect(result.exports).toBe('VALUE!');
});

test('ESM 加载相对 ESM、CommonJS、JSON 和字符串动态 import', async ({page}) => {
    const result = await runNodeWorker(page, {
        entryPath: 'workspace/main.mjs',
        files: [
            {
                path: 'workspace/main.mjs',
                content: [
                    'import esmValue from "./esm-helper.mjs";',
                    'import cjsValue from "./cjs-helper.cjs";',
                    'import config from "./config.json";',
                    'const dynamic = await import("./dynamic.mjs");',
                    'export default `${esmValue}:${cjsValue}:${config.name}:${dynamic.value}`;',
                ].join('\n'),
            },
            {path: 'workspace/esm-helper.mjs', content: 'export default "esm";'},
            {path: 'workspace/cjs-helper.cjs', content: 'module.exports = "cjs";'},
            {path: 'workspace/config.json', content: '{"name":"json"}'},
            {path: 'workspace/dynamic.mjs', content: 'export const value = "dynamic";'},
        ],
    });

    expect(result.exports.default).toBe('esm:cjs:json:dynamic');
});

test('CommonJS 可以 require 已预加载的 ESM', async ({page}) => {
    const result = await runNodeWorker(page, {
        entryPath: 'workspace/main.cjs',
        files: [
            {path: 'workspace/main.cjs', content: 'const esm = require("./value.mjs"); module.exports = [esm.default, esm.named];'},
            {path: 'workspace/value.mjs', content: 'export const named = 2; export default 1;'},
        ],
    });

    expect(result.exports).toEqual([1, 2]);
});

test('CommonJS 模块缓存支持循环依赖并保持单次执行', async ({page}) => {
    const result = await runNodeWorker(page, {
        entryPath: 'workspace/main.cjs',
        files: [
            {path: 'workspace/main.cjs', content: 'module.exports = {a: require("./a"), again: require("./a")};'},
            {path: 'workspace/a.js', content: 'exports.count = 1; exports.name = "a"; exports.fromB = require("./b").name;'},
            {path: 'workspace/b.js', content: 'exports.name = "b"; exports.fromA = require("./a").name;'},
        ],
    });

    expect(result.exports.a).toEqual({count: 1, name: 'a', fromB: 'b'});
    expect(result.exports.again).toEqual(result.exports.a);
});

test('UMD 优先返回 module.exports', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'umd',
        code: [
            '(function (root, factory) {',
            '  if (typeof module === "object" && module.exports) module.exports = factory();',
            '  else root.ExampleLibrary = factory();',
            '})(this, function () { return {name: "umd", value: 9}; });',
        ].join('\n'),
    });

    expect(result.exports).toEqual({name: 'umd', value: 9});
});

test('Global 脚本收集新增全局导出并在执行后恢复页面全局', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'global',
        code: 'globalThis.RuntimeGlobalLibrary = {name: "global", value: 5};',
    });

    expect(result.exports).toEqual({name: 'global', value: 5});
    await expect.poll(() => page.evaluate(() => 'RuntimeGlobalLibrary' in globalThis)).toBe(false);
});

test('文件扩展名和 package type 优先于源码自动检测', async ({page}) => {
    const result = await runNodeWorker(page, {
        entryPath: 'workspace/main.mjs',
        files: [
            {path: 'workspace/package.json', content: '{"type":"module"}'},
            {path: 'workspace/main.mjs', content: 'import value from "./value.js"; export default value;'},
            {path: 'workspace/value.js', content: 'export default "package-module";'},
        ],
    });

    expect(result.exports.default).toBe('package-module');
});

test('入口和依赖脚本支持 shebang', async ({page}) => {
    const result = await runNodeWorker(page, {
        entryPath: 'workspace/main.cjs',
        files: [
            {path: 'workspace/main.cjs', content: '#!/usr/bin/env node\nmodule.exports = require("./helper");'},
            {path: 'workspace/helper.js', content: '#!/usr/bin/env node\nmodule.exports = "ok";'},
        ],
    });

    expect(result.exports).toBe('ok');
});
