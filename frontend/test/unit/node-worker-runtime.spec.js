import {expect, test} from '@playwright/test';
import {openRuntimeHarness, runNodeWorker} from '../test-helpers.js';

test.beforeEach(async ({page}) => openRuntimeHarness(page));

test('process、input、env、args、cwd 和模块路径符合 Node 脚本预期', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        entryPath: 'workspace/src/main.cjs',
        cwd: 'workspace',
        input: {value: 3},
        env: {MODE: 'test'},
        args: ['one', 2],
        code: 'module.exports = {input, env: process.env.MODE, argv: process.argv, cwd: process.cwd(), filename: __filename, dirname: __dirname};',
    });

    expect(result.exports).toEqual({
        input: {value: 3},
        env: 'test',
        argv: ['/usr/bin/node', '/workspace/src/main.cjs', 'one', '2'],
        cwd: '/workspace',
        filename: '/workspace/src/main.cjs',
        dirname: '/workspace/src',
    });
});

test('浏览器 Buffer Polyfill 支持常用编码且不会泄漏 Node 专属方法', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            'const {Buffer: ImportedBuffer} = require("node:buffer");',
            'const utf8 = Buffer.from("hello");',
            'const combined = Buffer.concat([Buffer.from("a"), Buffer.from("b")]);',
            'module.exports = {',
            '  same: Buffer === ImportedBuffer,',
            '  utf8: utf8.toString(),',
            '  hex: utf8.toString("hex"),',
            '  base64: utf8.toString("base64"),',
            '  decoded: Buffer.from("aGVsbG8=", "base64").toString(),',
            '  allocated: Array.from(Buffer.alloc(3, 7)),',
            '  combined: combined.toString(),',
            '  isBuffer: Buffer.isBuffer(utf8),',
            '  allocUnsafe: typeof Buffer.allocUnsafe,',
            '  byteLength: typeof Buffer.byteLength,',
            '};',
        ].join('\n'),
    });

    expect(result.exports).toEqual({
        same: true,
        utf8: 'hello',
        hex: '68656c6c6f',
        base64: 'aGVsbG8=',
        decoded: 'hello',
        allocated: [7, 7, 7],
        combined: 'ab',
        isBuffer: true,
        allocUnsafe: 'undefined',
        byteLength: 'undefined',
    });
});

test('path、url、querystring、util 和 assert 常用接口可执行', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        cwd: 'workspace/src',
        code: [
            'const assert = require("node:assert");',
            'const path = require("node:path");',
            'const querystring = require("node:querystring");',
            'const {URL, pathToFileURL, fileURLToPath} = require("node:url");',
            'const util = require("node:util");',
            'assert.strictEqual(path.basename("/a/file.txt", ".txt"), "file");',
            'const callback = (value, done) => done(null, value * 2);',
            'module.exports = util.promisify(callback)(4).then((value) => ({',
            '  value,',
            '  join: path.join("a", "..", "b", "file.js"),',
            '  resolve: path.resolve("..", "data"),',
            '  dirname: path.dirname("/a/b/file.js"),',
            '  extname: path.extname("file.test.js"),',
            '  query: querystring.stringify({a: "x y", b: 2}),',
            '  parsed: querystring.parse("a=x+y&b=2"),',
            '  host: new URL("https://example.test/path").host,',
            '  fileUrl: pathToFileURL("workspace/a.txt").href,',
            '  filePath: fileURLToPath("file:///workspace/a.txt"),',
            '}));',
        ].join('\n'),
    });

    expect(result.exports).toEqual({
        value: 8,
        join: 'b/file.js',
        resolve: '/workspace/data',
        dirname: '/a/b',
        extname: '.js',
        query: 'a=x%20y&b=2',
        parsed: {a: 'x y', b: '2'},
        host: 'example.test',
        fileUrl: 'file:///workspace/a.txt',
        filePath: '/workspace/a.txt',
    });
});

test('node:fs 同步接口读写文本、二进制、目录和 Stats', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        cwd: 'workspace',
        files: [
            {path: 'workspace/input.txt', content: 'hello'},
            {path: 'workspace/sub/data.bin', content: new Uint8Array([1, 2, 3])},
        ],
        code: [
            'const fs = require("node:fs");',
            'const text = fs.readFileSync("input.txt", "utf8");',
            'const bytes = fs.readFileSync("sub/data.bin");',
            'fs.writeFileSync("output/result.txt", `${text}:${bytes.toString("hex")}`);',
            'module.exports = {',
            '  exists: fs.existsSync("output/result.txt"),',
            '  size: fs.statSync("output/result.txt").size,',
            '  names: fs.readdirSync("sub"),',
            '  entries: fs.readdirSync("sub", {withFileTypes: true}).map((entry) => [entry.name, entry.isFile()]),',
            '};',
        ].join('\n'),
    }, ['workspace/output/result.txt']);

    expect(result.exports).toEqual({exists: true, size: 12, names: ['data.bin'], entries: [['data.bin', true]]});
    expect(result.outputs['workspace/output/result.txt'].text).toBe('hello:010203');
});

test('node:fs/promises 支持异步读写、mkdir、stat、readdir、unlink 和 rm', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        cwd: 'workspace',
        files: [{path: 'workspace/input.txt', content: 'async'}],
        code: [
            'const fs = require("node:fs/promises");',
            'module.exports = (async () => {',
            '  await fs.mkdir("output/nested", {recursive: true});',
            '  const text = await fs.readFile("input.txt", "utf8");',
            '  await fs.writeFile("output/nested/result.txt", `${text}-ok`);',
            '  const stat = await fs.stat("output/nested/result.txt");',
            '  const names = await fs.readdir("output/nested");',
            '  await fs.writeFile("output/delete.txt", "x");',
            '  await fs.unlink("output/delete.txt");',
            '  await fs.mkdir("output/remove", {recursive: true});',
            '  await fs.writeFile("output/remove/a.txt", "x");',
            '  await fs.rm("output/remove", {recursive: true});',
            '  return {text, size: stat.size, names};',
            '})();',
        ].join('\n'),
    }, ['workspace/output/nested/result.txt']);

    expect(result.exports).toEqual({text: 'async', size: 8, names: ['result.txt']});
    expect(result.outputs['workspace/output/nested/result.txt'].text).toBe('async-ok');
});

test('require.resolve 和 require.cache 使用虚拟绝对路径', async ({page}) => {
    const result = await runNodeWorker(page, {
        entryPath: 'workspace/main.cjs',
        files: [
            {path: 'workspace/main.cjs', content: 'const first = require("./value"); const second = require("./value"); module.exports = {first, second, resolved: require.resolve("./value"), cached: Object.keys(require.cache)};'},
            {path: 'workspace/value.js', content: 'module.exports = {value: 1};'},
        ],
    });

    expect(result.exports.first).toEqual({value: 1});
    expect(result.exports.second).toEqual({value: 1});
    expect(result.exports.resolved).toBe('/workspace/value.js');
    expect(result.exports.cached).toContain('/workspace/value.js');
});

test('process.exit(0) 正常结束，非零退出码返回结构化错误', async ({page}) => {
    const zero = await runNodeWorker(page, {format: 'commonjs', code: 'process.exit(0);'});
    expect(zero.exitCode).toBe(0);
    expect(zero.exports).toEqual({type: 'undefined'});

    const error = await page.evaluate(async () => {
        try {
            await new globalThis.runtimeHarness.NodeWorker({format: 'commonjs', code: 'process.exit(3);'}).run();
            return null;
        } catch (caught) {
            return {code: caught.code, exitCode: caught.exitCode, message: caught.message};
        }
    });
    expect(error).toEqual({code: 'PROCESS_EXIT', exitCode: 3, message: 'Process exited with code 3'});
});

test('不支持的 Node 内置模块不会回退到浏览器或测试宿主', async ({page}) => {
    for (const specifier of ['node:crypto', 'node:child_process', 'node:os', 'crypto']) {
        const error = await page.evaluate(async (value) => {
            try {
                await new globalThis.runtimeHarness.NodeWorker({format: 'commonjs', code: `module.exports = require(${JSON.stringify(value)});`}).run();
                return null;
            } catch (caught) {
                return {code: caught.code, specifier: caught.specifier};
            }
        }, specifier);
        expect(error).not.toBeNull();
        expect(['UNSUPPORTED_NODE_BUILTIN', 'MODULE_NOT_FOUND']).toContain(error.code);
    }
});

test('非字符串动态 import 和 ESM 循环依赖返回稳定错误', async ({page}) => {
    const dynamicError = await page.evaluate(async () => {
        try {
            await new globalThis.runtimeHarness.NodeWorker({format: 'module', code: 'const name = "./value.mjs"; export default await import(name);'}).run();
            return null;
        } catch (caught) {
            return caught.code;
        }
    });
    expect(dynamicError).toBe('DYNAMIC_MODULE_NOT_PRELOADED');

    const cycleError = await page.evaluate(async () => {
        try {
            await new globalThis.runtimeHarness.NodeWorker({
                entryPath: 'workspace/a.mjs',
                files: [
                    {path: 'workspace/a.mjs', content: 'import "./b.mjs"; export const a = 1;'},
                    {path: 'workspace/b.mjs', content: 'import "./a.mjs"; export const b = 2;'},
                ],
            }).run();
            return null;
        } catch (caught) {
            return caught.code;
        }
    });
    expect(cycleError).toBe('UNSUPPORTED_ESM_CYCLE');
});

test('无效模块格式、编码、协议和越界文件路径返回明确错误', async ({page}) => {
    const errors = await page.evaluate(async () => {
        const cases = [
            () => new globalThis.runtimeHarness.NodeWorker({format: 'typescript', code: '1'}).run(),
            () => new globalThis.runtimeHarness.NodeWorker({format: 'commonjs', code: 'require("node:fs").readFileSync("missing", "latin1");'}).run(),
            () => new globalThis.runtimeHarness.NodeWorker({format: 'commonjs', code: 'require("node:https").get("http://example.test");'}).run(),
            () => new globalThis.runtimeHarness.NodeWorker({format: 'commonjs', cwd: '', code: 'require("node:fs").writeFileSync("../outside.txt", "x");'}).run(),
        ];
        const result = [];
        for (const run of cases) {
            try {
                await run();
                result.push(null);
            } catch (caught) {
                result.push(caught.code || caught.name);
            }
        }
        return result;
    });

    expect(errors).toEqual(['INVALID_MODULE_FORMAT', 'UNSUPPORTED_ENCODING', 'ERR_INVALID_PROTOCOL', 'INVALID_FILE_PATH']);
});

test('fetch 与 node:https 使用浏览器网络实现', async ({page}) => {
    await page.route('https://example.test/**', async (route) => {
        const url = new URL(route.request().url());
        await route.fulfill({status: 200, body: url.pathname === '/fetch' ? 'fetch-ok' : 'https-ok'});
    });

    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            'const https = require("node:https");',
            'const viaHttps = new Promise((resolve, reject) => {',
            '  const request = https.get("https://example.test/https", (response) => {',
            '    const chunks = [];',
            '    response.on("data", (chunk) => chunks.push(chunk));',
            '    response.on("end", () => resolve(Buffer.concat(chunks).toString()));',
            '  });',
            '  request.on("error", reject);',
            '});',
            'module.exports = Promise.all([fetch("https://example.test/fetch").then((response) => response.text()), viaHttps]);',
        ].join('\n'),
    });

    expect(result.exports).toEqual(['fetch-ok', 'https-ok']);
});
