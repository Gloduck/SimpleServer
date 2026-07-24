import {expect, test} from '@playwright/test';
import {openRuntimeHarness, runNodeWorker} from '../test-helpers.js';

const ADD_WASM = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
    0x03, 0x02, 0x01, 0x00,
    0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
    0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
]);
const IMPORT_FUNCTION_WASM = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x06, 0x01, 0x60, 0x01, 0x7f, 0x01, 0x7f,
    0x02, 0x0e, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x06, 0x64, 0x6f, 0x75, 0x62, 0x6c, 0x65, 0x00, 0x00,
    0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x00,
]);
const MEMORY_WASM = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x05, 0x03, 0x01, 0x00, 0x01,
    0x07, 0x0a, 0x01, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00,
]);
const TRAP_WASM = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
    0x03, 0x02, 0x01, 0x00,
    0x07, 0x08, 0x01, 0x04, 0x74, 0x72, 0x61, 0x70, 0x00, 0x00,
    0x0a, 0x05, 0x01, 0x03, 0x00, 0x00, 0x0b,
]);
const I64_ADD_WASM = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x07, 0x01, 0x60, 0x02, 0x7e, 0x7e, 0x01, 0x7e,
    0x03, 0x02, 0x01, 0x00,
    0x07, 0x09, 0x01, 0x05, 0x61, 0x64, 0x64, 0x36, 0x34, 0x00, 0x00,
    0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x7c, 0x0b,
]);
const MULTI_VALUE_WASM = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x06, 0x01, 0x60, 0x00, 0x02, 0x7f, 0x7e,
    0x03, 0x02, 0x01, 0x00,
    0x07, 0x0a, 0x01, 0x06, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x73, 0x00, 0x00,
    0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x07, 0x42, 0x09, 0x0b,
]);

test.beforeEach(async ({page}) => openRuntimeHarness(page));

test('从虚拟 .wasm 文件异步实例化并调用导出函数', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        cwd: 'workspace',
        files: [{path: 'workspace/add.wasm', content: ADD_WASM, mimeType: 'application/wasm'}],
        code: [
            'const fs = require("node:fs/promises");',
            'module.exports = (async () => {',
            '  const bytes = await fs.readFile("add.wasm");',
            '  const {module, instance} = await WebAssembly.instantiate(bytes);',
            '  return {value: instance.exports.add(20, 22), exports: WebAssembly.Module.exports(module)};',
            '})();',
        ].join('\n'),
    });

    expect(result.exports).toEqual({value: 42, exports: [{name: 'add', kind: 'function'}]});
});

test('同步 WebAssembly.Module 和 Instance 支持 file URL 与模块复用', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        files: [{path: 'workspace/add.wasm', content: ADD_WASM, mimeType: 'application/wasm'}],
        code: [
            'const fs = require("node:fs");',
            'const bytes = fs.readFileSync(new URL("file:///workspace/add.wasm"));',
            'const wasmModule = new WebAssembly.Module(bytes);',
            'const first = new WebAssembly.Instance(wasmModule);',
            'const second = new WebAssembly.Instance(wasmModule);',
            'module.exports = {',
            '  valid: WebAssembly.validate(bytes),',
            '  first: first.exports.add(1, 2),',
            '  second: second.exports.add(40, 2),',
            '  imports: WebAssembly.Module.imports(wasmModule),',
            '  customSections: WebAssembly.Module.customSections(wasmModule, "missing").length,',
            '};',
        ].join('\n'),
    });

    expect(result.exports).toEqual({valid: true, first: 3, second: 42, imports: [], customSections: 0});
});

test('WASM 可以调用 JavaScript 导入函数并暴露导入元数据', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        files: [{path: 'import-function.wasm', content: IMPORT_FUNCTION_WASM, mimeType: 'application/wasm'}],
        code: [
            'const fs = require("node:fs");',
            'const wasmModule = new WebAssembly.Module(fs.readFileSync("import-function.wasm"));',
            'const instance = new WebAssembly.Instance(wasmModule, {env: {double: (value) => value * 2}});',
            'module.exports = {value: instance.exports.run(21), imports: WebAssembly.Module.imports(wasmModule)};',
        ].join('\n'),
    });

    expect(result.exports).toEqual({value: 42, imports: [{module: 'env', name: 'double', kind: 'function'}]});
});

test('WASM 导出 Memory 后可以读写、扩容并保留原数据', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        files: [{path: 'memory.wasm', content: MEMORY_WASM, mimeType: 'application/wasm'}],
        code: [
            'const fs = require("node:fs");',
            'const {exports} = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync("memory.wasm")));',
            'const before = exports.memory.buffer.byteLength;',
            'new Uint8Array(exports.memory.buffer).set([1, 2, 3, 4]);',
            'const previousPages = exports.memory.grow(1);',
            'module.exports = {before, previousPages, after: exports.memory.buffer.byteLength, values: Array.from(new Uint8Array(exports.memory.buffer, 0, 4))};',
        ].join('\n'),
    });

    expect(result.exports).toEqual({before: 65_536, previousPages: 1, after: 131_072, values: [1, 2, 3, 4]});
});

test('WebAssembly.compile 和异步实例化支持 Buffer、Uint8Array 与 ArrayBuffer', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            `const source = Buffer.from(${JSON.stringify(Array.from(ADD_WASM))});`,
            'module.exports = (async () => {',
            '  const module = await WebAssembly.compile(source);',
            '  const fromModule = await WebAssembly.instantiate(module);',
            '  const fromView = await WebAssembly.instantiate(new Uint8Array(source));',
            '  const fromBuffer = await WebAssembly.instantiate(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));',
            '  return [fromModule.exports.add(2, 3), fromView.instance.exports.add(3, 4), fromBuffer.instance.exports.add(4, 5)];',
            '})();',
        ].join('\n'),
    });

    expect(result.exports).toEqual([5, 7, 9]);
});

test('WebAssembly.instantiateStreaming 和 compileStreaming 使用真实浏览器 Response', async ({page}) => {
    await page.route('https://wasm.example.test/add.wasm', (route) => route.fulfill({
        status: 200,
        contentType: 'application/wasm',
        body: Buffer.from(ADD_WASM),
    }));

    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            'module.exports = (async () => {',
            '  const instantiated = await WebAssembly.instantiateStreaming(fetch("https://wasm.example.test/add.wasm"));',
            '  const module = await WebAssembly.compileStreaming(fetch("https://wasm.example.test/add.wasm"));',
            '  const instance = await WebAssembly.instantiate(module);',
            '  return [instantiated.instance.exports.add(10, 5), instance.exports.add(20, 7)];',
            '})();',
        ].join('\n'),
    });

    expect(result.exports).toEqual([15, 27]);
});

test('Base64 内嵌 WASM 可以按常见包封装方式解码执行', async ({page}) => {
    const base64 = Buffer.from(ADD_WASM).toString('base64');
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            `const bytes = Buffer.from(${JSON.stringify(base64)}, "base64");`,
            'module.exports = WebAssembly.instantiate(bytes).then(({instance}) => instance.exports.add(8, 9));',
        ].join('\n'),
    });

    expect(result.exports).toBe(17);
});

test('WASM i64 与多返回值通过 JavaScript BigInt 正确互操作', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        files: [
            {path: 'i64-add.wasm', content: I64_ADD_WASM, mimeType: 'application/wasm'},
            {path: 'multi-value.wasm', content: MULTI_VALUE_WASM, mimeType: 'application/wasm'},
        ],
        code: [
            'const fs = require("node:fs");',
            'const i64 = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync("i64-add.wasm")));',
            'const multi = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync("multi-value.wasm")));',
            'module.exports = {sum: i64.exports.add64(20n, 22n), values: multi.exports.values()};',
        ].join('\n'),
    });

    expect(result.exports).toEqual({
        sum: {type: 'bigint', value: '42'},
        values: [7, {type: 'bigint', value: '9'}],
    });
});

test('prepareRunScript 将 WASM 输入文件交给 NodeWorker 并生成文件输出', async ({page}) => {
    const result = await page.evaluate(async (wasm) => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const prepared = await prepareRunScript({
            format: 'commonjs',
            resolveFrom: 'workspace',
            cwd: 'workspace',
            inputFiles: [{path: 'workspace/add.wasm', content: new Uint8Array(wasm), mimeType: 'application/wasm'}],
            code: [
                'const fs = require("node:fs");',
                'module.exports = WebAssembly.instantiate(fs.readFileSync("add.wasm")).then(({instance}) => {',
                '  const value = instance.exports.add(input.left, input.right);',
                '  fs.writeFileSync("output/result.txt", String(value));',
                '  return value;',
                '});',
            ].join('\n'),
            input: {left: 19, right: 23},
        });
        const worker = new NodeWorker(prepared);
        const executed = await worker.run();
        return {value: executed.exports, output: worker.fileSystem.readTextSync('workspace/output/result.txt')};
    }, Array.from(ADD_WASM));

    expect(result).toEqual({value: 42, output: '42'});
});

test('WebAssembly.Global、Memory 和 Table 浏览器原生对象可供脚本使用', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            'const value = new WebAssembly.Global({value: "i32", mutable: true}, 3);',
            'value.value = 7;',
            'const memory = new WebAssembly.Memory({initial: 1, maximum: 2});',
            'const table = new WebAssembly.Table({element: "anyfunc", initial: 2});',
            'module.exports = {value: value.value, bytes: memory.buffer.byteLength, tableLength: table.length, empty: table.get(0) === null};',
        ].join('\n'),
    });

    expect(result.exports).toEqual({value: 7, bytes: 65_536, tableLength: 2, empty: true});
});

test('无效 WASM、错误导入和 unreachable trap 返回浏览器 WebAssembly 错误类型', async ({page}) => {
    const result = await page.evaluate(async ({invalid, imports, trap}) => {
        const {NodeWorker} = globalThis.runtimeHarness;
        const cases = [
            new NodeWorker({format: 'commonjs', files: [{path: 'invalid.wasm', content: new Uint8Array(invalid)}], code: 'const fs = require("node:fs"); module.exports = new WebAssembly.Module(fs.readFileSync("invalid.wasm"));'}),
            new NodeWorker({format: 'commonjs', files: [{path: 'imports.wasm', content: new Uint8Array(imports)}], code: 'const fs = require("node:fs"); const module = new WebAssembly.Module(fs.readFileSync("imports.wasm")); module.exports = new WebAssembly.Instance(module, {env: {}});'}),
            new NodeWorker({format: 'commonjs', files: [{path: 'trap.wasm', content: new Uint8Array(trap)}], code: 'const fs = require("node:fs"); const instance = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync("trap.wasm"))); module.exports = instance.exports.trap();'}),
        ];
        const errors = [];
        for (const worker of cases) {
            try {
                await worker.run();
                errors.push(null);
            } catch (error) {
                errors.push(error.constructor.name);
            }
        }
        return {valid: WebAssembly.validate(new Uint8Array(invalid)), errors};
    }, {
        invalid: [0x00, 0x61, 0x73, 0x6d, 0x00, 0x00, 0x00, 0x00],
        imports: Array.from(IMPORT_FUNCTION_WASM),
        trap: Array.from(TRAP_WASM),
    });

    expect(result).toEqual({valid: false, errors: ['CompileError', 'LinkError', 'RuntimeError']});
});
