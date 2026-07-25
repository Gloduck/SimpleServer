import {expect, test} from '@playwright/test';
import {openRuntimeHarness} from '../test-helpers.js';

test.beforeEach(async ({page}) => openRuntimeHarness(page));

test('内联 CommonJS 解析相对输入模块并保留运行参数', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const prepared = await prepareRunScript({
            code: 'const helper = require("./helper"); module.exports = {value: helper(input.value), cwd: process.cwd(), env: process.env.MODE, args: process.argv.slice(2)};',
            format: 'commonjs',
            resolveFrom: 'workspace/src',
            cwd: 'workspace',
            input: {value: 4},
            env: {MODE: 'test'},
            args: ['one', 2],
            inputFiles: [{path: 'workspace/src/helper.js', content: 'module.exports = (value) => value * 3;'}],
        });
        const executed = await new NodeWorker(prepared).run();
        return {
            exports: executed.exports,
            entryPath: prepared.entryPath,
            code: prepared.code,
            files: prepared.files.map((file) => file.path),
        };
    });

    expect(result.exports).toEqual({value: 12, cwd: '/workspace', env: 'test', args: ['one', '2']});
    expect(result.entryPath).toBe('workspace/src/.runscript/entry.js');
    expect(result.code).toContain('/workspace/src/helper.js');
    expect(result.files).toEqual(['workspace/src/helper.js']);
});

test('内联 ESM 解析相对 ESM、JSON 和二进制输入文件', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const prepared = await prepareRunScript({
            format: 'module',
            resolveFrom: 'project',
            code: [
                'import value from "./value.mjs";',
                'import config from "./config.json";',
                'import fs from "node:fs";',
                'export default `${value}:${config.name}:${fs.readFileSync("/project/data.bin").toString("hex")}`;',
            ].join('\n'),
            inputFiles: [
                {path: 'project/value.mjs', content: 'export default "esm";'},
                {path: 'project/config.json', content: '{"name":"json"}'},
                {path: 'project/data.bin', content: new Uint8Array([1, 2, 255]), mimeType: 'application/octet-stream'},
            ],
        });
        const executed = await new NodeWorker(prepared).run();
        return {exports: {...executed.exports}, entryPath: prepared.entryPath, files: prepared.files.map((file) => file.path)};
    });

    expect(result.exports.default).toBe('esm:json:0102ff');
    expect(result.entryPath).toBe('project/.runscript/entry.mjs');
    expect(result.files).toEqual(['project/config.json', 'project/data.bin', 'project/value.mjs']);
});

test('工作区入口读取 package type 并执行未保存视图中的 ESM', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {FileSystem, MemoryProvider, NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const workspace = new FileSystem({
            provider: new MemoryProvider({files: [
                {path: 'project/package.json', content: '{"type":"module"}'},
                {path: 'project/src/main.js', content: 'import value from "./helper.js"; export default value * 2;'},
                {path: 'project/src/helper.js', content: 'export default 6;'},
            ]}),
            policy: null,
        });
        const prepared = await prepareRunScript({entryFile: 'project/src/main.js'}, {workspace});
        const executed = await new NodeWorker(prepared).run();
        return {exports: {...executed.exports}, code: prepared.code, files: prepared.files.map((file) => file.path)};
    });

    expect(result.exports.default).toBe(12);
    expect(result.code).toBeUndefined();
    expect(result.files).toEqual(['project/package.json', 'project/src/helper.js', 'project/src/main.js']);
});

test('本地 node_modules 包及其提升依赖会完整装载', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {DependencyStore, FileSystem, MemoryProvider, NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const workspace = new FileSystem({
            provider: new MemoryProvider({files: [
                {path: 'project/src/main.cjs', content: 'module.exports = require("lodash-like");'},
                {path: 'project/node_modules/lodash-like/package.json', content: '{"name":"lodash-like","version":"1.0.0","main":"index.js","dependencies":{"helper-package":"^1.0.0"}}'},
                {path: 'project/node_modules/lodash-like/index.js', content: 'module.exports = require("helper-package")("local");'},
                {path: 'project/node_modules/helper-package/package.json', content: '{"name":"helper-package","version":"1.1.0","main":"index.js"}'},
                {path: 'project/node_modules/helper-package/index.js', content: 'module.exports = (value) => `${value}-dependency`;'},
            ]}),
            policy: null,
        });
        const store = new DependencyStore({limits: {cleanupIntervalMs: 0}});
        try {
            const prepared = await prepareRunScript({entryFile: 'project/src/main.cjs'}, {workspace, store});
            const executed = await new NodeWorker(prepared).run();
            return {exports: executed.exports, files: prepared.files.map((file) => file.path), stats: store.getStats()};
        } finally {
            store.dispose();
        }
    });

    expect(result.exports).toBe('local-dependency');
    expect(result.files).toContain('project/node_modules/lodash-like/index.js');
    expect(result.files).toContain('project/node_modules/helper-package/index.js');
    expect(result.stats.packageCount).toBe(2);
});

test('本地包下载的同名冲突依赖保持各自的 Node 向上解析结果', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {DependencyStore, FileSystem, MemoryProvider, NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const workspace = new FileSystem({
            provider: new MemoryProvider({files: [
                {path: 'project/src/main.cjs', content: 'module.exports = [require("left"), require("right")];'},
                {path: 'project/node_modules/left/package.json', content: '{"name":"left","version":"1.0.0","main":"index.js","dependencies":{"shared":"1.0.0"}}'},
                {path: 'project/node_modules/left/index.js', content: 'module.exports = require("shared");'},
                {path: 'project/node_modules/right/package.json', content: '{"name":"right","version":"1.0.0","main":"index.js","dependencies":{"shared":"2.0.0"}}'},
                {path: 'project/node_modules/right/index.js', content: 'module.exports = require("shared");'},
            ]}),
            policy: null,
        });
        const packageDownloader = {
            async download(name, version) {
                return {
                    name,
                    version,
                    manifest: {name, version, main: 'index.js'},
                    files: [
                        {path: 'package.json', content: JSON.stringify({name, version, main: 'index.js'})},
                        {path: 'index.js', content: `module.exports = "${version}";`},
                    ],
                };
            },
        };
        const store = new DependencyStore({limits: {cleanupIntervalMs: 0}});
        try {
            const prepared = await prepareRunScript({entryFile: 'project/src/main.cjs'}, {
                workspace,
                store,
                packageDownloader,
            });
            const executed = await new NodeWorker(prepared).run();
            return {
                exports: executed.exports,
                sharedManifests: prepared.files
                    .map((file) => file.path)
                    .filter((path) => path.endsWith('/shared/package.json')),
            };
        } finally {
            store.dispose();
        }
    });

    expect(result.exports).toEqual(['1.0.0', '2.0.0']);
    expect(result.sharedManifests).toEqual([
        'project/node_modules/right/node_modules/shared/package.json',
        'project/node_modules/shared/package.json',
    ]);
});

test('npm: 包解析版本、挂载传递依赖并支持常见 CommonJS 包形态', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const calls = [];
        const packages = {
            'lodash@^4.17.0': {
                name: 'lodash',
                version: '4.17.21',
                manifest: {name: 'lodash', version: '4.17.21', main: 'index.js', dependencies: {'array-helper': '^1.0.0'}},
                files: [
                    {path: 'package.json', content: '{"name":"lodash","version":"4.17.21","main":"index.js","dependencies":{"array-helper":"^1.0.0"}}'},
                    {path: 'index.js', content: 'const helper = require("array-helper"); exports.chunk = (values, size) => helper(values, size);'},
                ],
            },
            'array-helper@^1.0.0': {
                name: 'array-helper',
                version: '1.2.0',
                manifest: {name: 'array-helper', version: '1.2.0', main: 'index.js'},
                files: [
                    {path: 'package.json', content: '{"name":"array-helper","version":"1.2.0","main":"index.js"}'},
                    {path: 'index.js', content: 'module.exports = (values, size) => values.reduce((all, value, index) => { if (index % size === 0) all.push([]); all.at(-1).push(value); return all; }, []);'},
                ],
            },
        };
        const packageDownloader = {
            async download(name, version) {
                calls.push(`${name}@${version}`);
                const record = packages[`${name}@${version}`];
                if (!record) throw new Error(`Unexpected package: ${name}@${version}`);
                return record;
            },
        };
        const prepared = await prepareRunScript({
            format: 'commonjs',
            code: 'module.exports = require("npm:lodash@^4.17.0").chunk([1, 2, 3, 4, 5], 2);',
        }, {packageDownloader});
        const executed = await new NodeWorker(prepared).run();
        return {exports: executed.exports, calls, files: prepared.files.map((file) => file.path)};
    });

    expect(result.exports).toEqual([[1, 2], [3, 4], [5]]);
    expect(result.calls).toEqual(['lodash@^4.17.0', 'array-helper@^1.0.0']);
    expect(result.files.some((path) => path.includes('lodash@4.17.21'))).toBe(true);
    expect(result.files.some((path) => path.endsWith('node_modules/array-helper/index.js'))).toBe(true);
});

test('dependencies 为未安装的裸包导入提供 npm 下载回退', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const calls = [];
        const packageDownloader = {
            async download(name, version) {
                calls.push(`${name}@${version}`);
                return {
                    name,
                    version: '0.4.4',
                    manifest: {name, version: '0.4.4', main: 'index.js'},
                    files: [
                        {path: 'package.json', content: JSON.stringify({name, version: '0.4.4', main: 'index.js'})},
                        {path: 'index.js', content: 'module.exports = {encode: (value) => `encoded:${value}`};'},
                    ],
                };
            },
        };
        const prepared = await prepareRunScript({
            format: 'module',
            code: 'import jpeg from "jpeg-js"; export default jpeg.encode("image");',
            dependencies: ['jpeg-js@0.4.4'],
        }, {packageDownloader});
        const executed = await new NodeWorker(prepared).run();
        return {exports: {...executed.exports}, calls, code: prepared.code};
    });

    expect(result.exports.default).toBe('encoded:image');
    expect(result.calls).toEqual(['jpeg-js@0.4.4']);
    expect(result.code).toContain('/__runscript__/packages/jpeg-js@0.4.4-');
});

test('dependencies 不覆盖工作区已安装的裸包', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {FileSystem, MemoryProvider, NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const workspace = new FileSystem({
            provider: new MemoryProvider({files: [
                {path: 'project/main.cjs', content: 'module.exports = require("example-package");'},
                {path: 'project/node_modules/example-package/package.json', content: '{"name":"example-package","version":"1.0.0","main":"index.js"}'},
                {path: 'project/node_modules/example-package/index.js', content: 'module.exports = "local";'},
            ]}),
            policy: null,
        });
        let downloads = 0;
        const prepared = await prepareRunScript({
            entryFile: 'project/main.cjs',
            dependencies: ['example-package@2.0.0'],
        }, {
            workspace,
            packageDownloader: {async download() { downloads += 1; throw new Error('Unexpected download'); }},
        });
        const executed = await new NodeWorker(prepared).run();
        return {exports: executed.exports, downloads};
    });

    expect(result).toEqual({exports: 'local', downloads: 0});
});

test('npm: 相同名称和版本的共享依赖提升后只挂载一次', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const createPackage = (name, version, source, dependencies = {}) => ({
            name,
            version,
            manifest: {name, version, main: 'index.js', dependencies},
            files: [
                {path: 'package.json', content: JSON.stringify({name, version, main: 'index.js', dependencies})},
                {path: 'index.js', content: source},
            ],
        });
        const shared = createPackage('shared', '1.2.3', 'module.exports = {count: 0};');
        const packages = {
            'app@1.0.0': createPackage('app', '1.0.0', 'module.exports = [require("left"), require("right")];', {
                left: '1.0.0',
                right: '1.0.0',
            }),
            'left@1.0.0': createPackage('left', '1.0.0', 'const shared = require("shared"); module.exports = ++shared.count;', {shared: '^1.0.0'}),
            'right@1.0.0': createPackage('right', '1.0.0', 'const shared = require("shared"); module.exports = ++shared.count;', {shared: '~1.2.0'}),
            'shared@^1.0.0': shared,
            'shared@~1.2.0': shared,
        };
        const packageDownloader = {
            async download(name, version) {
                const record = packages[`${name}@${version}`];
                if (!record) throw new Error(`Unexpected package: ${name}@${version}`);
                return record;
            },
        };
        const prepared = await prepareRunScript({
            format: 'commonjs',
            code: 'module.exports = require("npm:app@1.0.0");',
        }, {packageDownloader});
        const executed = await new NodeWorker(prepared).run();
        return {
            exports: executed.exports,
            sharedManifests: prepared.files
                .map((file) => file.path)
                .filter((path) => path.endsWith('/shared/package.json')),
        };
    });

    expect(result.exports).toEqual([1, 2]);
    expect(result.sharedManifests).toEqual(['__runscript__/packages/node_modules/shared/package.json']);
});

test('npm: 版本冲突时仅在请求包内创建嵌套依赖', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const createPackage = (name, version, source, dependencies = {}) => ({
            name,
            version,
            manifest: {name, version, main: 'index.js', dependencies},
            files: [
                {path: 'package.json', content: JSON.stringify({name, version, main: 'index.js', dependencies})},
                {path: 'index.js', content: source},
            ],
        });
        const packages = {
            'app@1.0.0': createPackage('app', '1.0.0', 'module.exports = [require("left"), require("right")];', {
                left: '1.0.0',
                right: '1.0.0',
            }),
            'left@1.0.0': createPackage('left', '1.0.0', 'module.exports = require("shared");', {shared: '1.0.0'}),
            'right@1.0.0': createPackage('right', '1.0.0', 'module.exports = require("shared");', {shared: '2.0.0'}),
            'shared@1.0.0': createPackage('shared', '1.0.0', 'module.exports = "1.0.0";'),
            'shared@2.0.0': createPackage('shared', '2.0.0', 'module.exports = "2.0.0";'),
        };
        const packageDownloader = {
            async download(name, version) {
                const record = packages[`${name}@${version}`];
                if (!record) throw new Error(`Unexpected package: ${name}@${version}`);
                return record;
            },
        };
        const prepared = await prepareRunScript({
            format: 'commonjs',
            code: 'module.exports = require("npm:app@1.0.0");',
        }, {packageDownloader});
        const executed = await new NodeWorker(prepared).run();
        return {
            exports: executed.exports,
            sharedManifests: prepared.files
                .map((file) => file.path)
                .filter((path) => path.endsWith('/shared/package.json')),
        };
    });

    expect(result.exports).toEqual(['1.0.0', '2.0.0']);
    expect(result.sharedManifests).toEqual([
        '__runscript__/packages/node_modules/right/node_modules/shared/package.json',
        '__runscript__/packages/node_modules/shared/package.json',
    ]);
});

test('准备器识别扩展的裸 Node 内置模块及 node: 子路径', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const prepared = await prepareRunScript({
            format: 'commonjs',
            code: [
                'const Stream = require("stream");',
                'const zlib = require("node:zlib");',
                'const timers = require("timers");',
                'const punycode = require("punycode");',
                'const crypto = require("crypto");',
                'const processModule = require("process");',
                'const EventEmitter = require("events");',
                'module.exports = new Promise((resolve) => timers.setImmediate(() => {',
                '  const zipped = zlib.gzipSync(Buffer.from("ok"));',
                '  resolve({',
                '    stream: typeof Stream.Readable,',
                '    text: zlib.gunzipSync(zipped).toString(),',
                '    domain: punycode.toASCII("mañana.test"),',
                '    hash: crypto.createHash("sha256").update("ok").digest("hex"),',
                '    process: processModule === process,',
                '    events: typeof EventEmitter,',
                '  });',
                '}));',
            ].join('\n'),
        });
        return (await new NodeWorker(prepared).run()).exports;
    });

    expect(result).toEqual({
        stream: 'function',
        text: 'ok',
        domain: 'xn--maana-pta.test',
        hash: '2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df',
        process: true,
        events: 'function',
    });
});

test('远程 Webpack 浏览器全局包返回其全局导出而非空 CommonJS 对象', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const source = [
            '(()=>{var __webpack_modules__={1:(module)=>{module.exports={internal:true}}};',
            'var __webpack_require__=function(){};',
            'let target;',
            '"undefined"!=typeof window&&"object"==typeof window&&(target=window);',
            '"undefined"!=typeof self&&"object"==typeof self&&(target=self);',
            'target.ImageLibrary={read(){return "global-export"}};',
            '})()',
        ].join('');
        const prepared = await prepareRunScript({
            format: 'commonjs',
            code: [
                'const bundle = require("https://cdn.example.test/image-library.js");',
                'const library = bundle.ImageLibrary || bundle;',
                'module.exports = library.read();',
            ].join('\n'),
        }, {fetch: async () => new Response(source)});
        return (await new NodeWorker(prepared).run()).exports;
    });

    expect(result).toBe('global-export');
});

test('npm: 支持作用域包和包内子路径', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const packageDownloader = {
            async download(name, version) {
                return {
                    name,
                    version: '1.2.0',
                    manifest: {name, version: '1.2.0', main: 'index.js'},
                    files: [
                        {path: 'package.json', content: JSON.stringify({name, version: '1.2.0', main: 'index.js'})},
                        {path: 'index.js', content: 'module.exports = "root";'},
                        {path: 'features/value.js', content: 'module.exports = "scoped-subpath";'},
                    ],
                };
            },
        };
        const prepared = await prepareRunScript({
            format: 'commonjs',
            code: 'module.exports = require("npm:@scope/example@1.2.0/features/value");',
        }, {packageDownloader});
        return (await new NodeWorker(prepared).run()).exports;
    });

    expect(result).toBe('scoped-subpath');
});

test('HTTP CommonJS 模块解析相对远程依赖并重写到虚拟文件', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {DependencyStore, NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const requests = [];
        const sources = {
            'https://cdn.example.test/main.js': 'const value = require("./dependency.js"); module.exports = `${value}-remote`;',
            'https://cdn.example.test/dependency.js': 'module.exports = "relative";',
        };
        const fetch = async (url) => {
            requests.push(String(url));
            return new Response(sources[String(url)], {status: sources[String(url)] ? 200 : 404});
        };
        const store = new DependencyStore({limits: {cleanupIntervalMs: 0}});
        try {
            const prepared = await prepareRunScript({format: 'commonjs', code: 'module.exports = require("https://cdn.example.test/main.js");'}, {fetch, store});
            const executed = await new NodeWorker(prepared).run();
            return {exports: executed.exports, requests, files: prepared.files.map((file) => file.path), stats: store.getStats()};
        } finally {
            store.dispose();
        }
    });

    expect(result.exports).toBe('relative-remote');
    expect(result.requests).toEqual(['https://cdn.example.test/main.js', 'https://cdn.example.test/dependency.js']);
    expect(result.files.filter((path) => path.startsWith('__runscript__/remote/'))).toHaveLength(2);
    expect(result.stats.remoteModuleCount).toBe(2);
});

test('HTTP ESM 模块支持静态导入和远程动态 import', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const sources = {
            'https://esm.example.test/main.mjs': 'import value from "./value.mjs"; const dynamic = await import("./dynamic.mjs"); export default `${value}:${dynamic.name}`;',
            'https://esm.example.test/value.mjs': 'export default "static";',
            'https://esm.example.test/dynamic.mjs': 'export const name = "dynamic";',
        };
        const fetch = async (url) => new Response(sources[String(url)], {status: sources[String(url)] ? 200 : 404});
        const prepared = await prepareRunScript({format: 'module', code: 'import value from "https://esm.example.test/main.mjs"; export default value;'}, {fetch});
        const executed = await new NodeWorker(prepared).run();
        return {...executed.exports};
    });

    expect(result.default).toBe('static:dynamic');
});

test('远程依赖缓存跨准备调用复用且不重复下载', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {DependencyStore, prepareRunScript} = globalThis.runtimeHarness;
        let requestCount = 0;
        const fetch = async () => {
            requestCount += 1;
            return new Response('module.exports = "cached";');
        };
        const store = new DependencyStore({limits: {cleanupIntervalMs: 0}});
        try {
            const options = {format: 'commonjs', code: 'module.exports = require("https://cache.example.test/value.js");'};
            await prepareRunScript(options, {fetch, store});
            await prepareRunScript(options, {fetch, store});
            return {requestCount, stats: store.getStats()};
        } finally {
            store.dispose();
        }
    });

    expect(result.requestCount).toBe(1);
    expect(result.stats.remoteModuleCount).toBe(1);
});

test('可选 npm 依赖下载失败会回滚部分挂载并继续执行', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
        const packageDownloader = {
            async download(name) {
                if (name === 'missing-optional') {
                    const error = new Error('missing');
                    error.code = 'PACKAGE_DOWNLOAD_FAILED';
                    throw error;
                }
                return {
                    name: 'optional-root',
                    version: '1.0.0',
                    manifest: {name: 'optional-root', version: '1.0.0', main: 'index.js', optionalDependencies: {'missing-optional': '^1.0.0'}},
                    files: [
                        {path: 'package.json', content: '{"name":"optional-root","version":"1.0.0","main":"index.js","optionalDependencies":{"missing-optional":"^1.0.0"}}'},
                        {path: 'index.js', content: 'module.exports = "optional-ok";'},
                    ],
                };
            },
        };
        const prepared = await prepareRunScript({format: 'commonjs', code: 'module.exports = require("npm:optional-root@1.0.0");'}, {packageDownloader});
        return (await new NodeWorker(prepared).run()).exports;
    });

    expect(result).toBe('optional-ok');
});

test('CommonJS 动态 import、缺失模块和无工作区读取返回稳定错误', async ({page}) => {
    const errors = await page.evaluate(async () => {
        const {prepareRunScript} = globalThis.runtimeHarness;
        const cases = [
            () => prepareRunScript({format: 'commonjs', code: 'module.exports = import("./value.js");', inputFiles: [{path: 'value.js', content: 'module.exports = 1;'}]}),
            () => prepareRunScript({format: 'commonjs', code: 'module.exports = require("./missing.js");'}),
            () => prepareRunScript({entryFile: 'main.js'}),
        ];
        const result = [];
        for (const run of cases) {
            try {
                await run();
                result.push(null);
            } catch (error) {
                result.push(error.code);
            }
        }
        return result;
    });

    expect(errors).toEqual(['DYNAMIC_IMPORT_UNSUPPORTED', 'MODULE_NOT_FOUND', 'WORKSPACE_REQUIRED']);
});

test('入口、路径和保留目录参数会在准备阶段校验', async ({page}) => {
    const errors = await page.evaluate(async () => {
        const {prepareRunScript} = globalThis.runtimeHarness;
        const cases = [
            () => prepareRunScript({}),
            () => prepareRunScript({code: '1', entryFile: 'main.js'}),
            () => prepareRunScript({code: '1', resolveFrom: '/absolute'}),
            () => prepareRunScript({code: '1', inputFiles: [{path: '__runscript__/value.js', content: '1'}]}),
            () => prepareRunScript({code: '1', inputFiles: [{path: '.runscript/entry.js', content: '1'}]}),
            () => prepareRunScript({code: '1', inputFiles: [{path: '../outside.js', content: '1'}]}),
        ];
        const result = [];
        for (const run of cases) {
            try {
                await run();
                result.push(null);
            } catch (error) {
                result.push(error.code);
            }
        }
        return result;
    });

    expect(errors).toEqual([
        'ENTRY_REQUIRED',
        'INVALID_ENTRY',
        'INVALID_FILE_PATH',
        'RESERVED_FILE_PATH',
        'RESERVED_FILE_PATH',
        'INVALID_FILE_PATH',
    ]);
});

test('模块数、文件数、虚拟文件系统总大小、源码大小和远程下载大小限制分别生效', async ({page}) => {
    const errors = await page.evaluate(async () => {
        const {prepareRunScript} = globalThis.runtimeHarness;
        const cases = [
            () => prepareRunScript({format: 'commonjs', code: 'module.exports = require("./value.js");', inputFiles: [{path: 'value.js', content: 'module.exports = 1;'}]}, {limits: {maxModuleCount: 1}}),
            () => prepareRunScript({code: '1', inputFiles: [{path: 'a.txt', content: 'a'}, {path: 'b.txt', content: 'b'}]}, {limits: {maxFileCount: 1}}),
            () => prepareRunScript({code: '1', inputFiles: [{path: 'input.bin', content: new Uint8Array([1, 2, 3])}]}, {limits: {maxTotalBytes: 3}}),
            () => prepareRunScript({code: '"你好";'}, {limits: {maxSourceBytes: 5}}),
            () => prepareRunScript({format: 'commonjs', code: 'module.exports = require("https://limit.example.test/value.js");'}, {
                fetch: async () => new Response('123456'),
                limits: {maxDownloadBytes: 5},
            }),
        ];
        const result = [];
        for (const run of cases) {
            try {
                await run();
                result.push(null);
            } catch (error) {
                result.push(error.code);
            }
        }
        return result;
    });

    expect(errors).toEqual(['MODULE_COUNT_EXCEEDED', 'FILE_COUNT_EXCEEDED', 'FILE_TOTAL_SIZE_EXCEEDED', 'SOURCE_SIZE_EXCEEDED', 'REMOTE_MODULE_TOO_LARGE']);
});

test('准备流程支持 AbortSignal 并保留调用方中止原因', async ({page}) => {
    const result = await page.evaluate(async () => {
        const {prepareRunScript} = globalThis.runtimeHarness;
        const controller = new AbortController();
        const reason = new DOMException('cancelled', 'AbortError');
        controller.abort(reason);
        try {
            await prepareRunScript({code: 'module.exports = 1;', signal: controller.signal});
            return null;
        } catch (error) {
            return {name: error.name, message: error.message};
        }
    });

    expect(result).toEqual({name: 'AbortError', message: 'cancelled'});
});
