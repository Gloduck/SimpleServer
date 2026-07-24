import assert from 'node:assert/strict';
import test from 'node:test';
import {
    detectJavaScriptSourceFormat,
    escapeModuleSpecifier,
    scanCommonJsModuleSpecifiers,
    scanEsmModuleSpecifiers,
    scanJavaScriptModuleSource,
} from '../../src/shared/node-worker/module-source-scanner.js';

test('场景：扫描 ESM 静态导入、重新导出和动态导入', async () => {
    const source = [
        'import value from "first-package";',
        "export {name} from './second.js';",
        'const dynamic = await import("./dynamic.mjs");',
        'const template = import(`./template.mjs`);',
        'const unresolved = import(moduleName);',
        'export default [value, dynamic, template, unresolved];',
    ].join('\n');

    const specifiers = await scanEsmModuleSpecifiers(source);
    assert.deepEqual(specifiers.map(({kind, specifier, literal, quote}) => ({kind, specifier, literal, quote})), [
        {kind: 'import', specifier: 'first-package', literal: true, quote: '"'},
        {kind: 'export', specifier: './second.js', literal: true, quote: "'"},
        {kind: 'dynamic-import', specifier: './dynamic.mjs', literal: true, quote: '"'},
        {kind: 'dynamic-import', specifier: null, literal: false, quote: ''},
        {kind: 'dynamic-import', specifier: null, literal: false, quote: ''},
    ]);
    for (const item of specifiers.filter((specifier) => specifier.literal)) {
        assert.equal(source.slice(item.start, item.end), item.specifier);
    }
});

test('场景：扫描 CommonJS require 和 require.resolve 并解码字符串转义', () => {
    const source = [
        'const first = require("first\\tpackage");',
        "const second = require . resolve ( './second.js' );",
        'const third = require("quote\\\"package");',
    ].join('\n');

    assert.deepEqual(scanCommonJsModuleSpecifiers(source).map(({kind, specifier, quote}) => ({kind, specifier, quote})), [
        {kind: 'require', specifier: 'first\tpackage', quote: '"'},
        {kind: 'require-resolve', specifier: './second.js', quote: "'"},
        {kind: 'require', specifier: 'quote"package', quote: '"'},
    ]);
});

test('场景：CommonJS 扫描忽略注释、字符串、模板文本和正则字面量', () => {
    const source = [
        '// require("comment-one")',
        '/* require("comment-two") */',
        'const text = "require(\\"string\\")";',
        'const template = `require("template")`;',
        'const regex = /require\\("regex"\\)/g;',
        'const actual = require("actual");',
    ].join('\n');

    assert.deepEqual(scanCommonJsModuleSpecifiers(source).map((item) => item.specifier), ['actual']);
});

test('场景：源码格式区分 ESM、CommonJS 风格和普通全局脚本', async () => {
    assert.equal(await detectJavaScriptSourceFormat('export default 1;'), 'module');
    assert.equal(await detectJavaScriptSourceFormat('module.exports = 1;'), 'commonjs');
    assert.equal(await detectJavaScriptSourceFormat('const value = require("value"); exports.value = value;'), 'commonjs');
    assert.equal(await detectJavaScriptSourceFormat('define.amd && define([], () => 1);'), 'umd');
    assert.equal(await detectJavaScriptSourceFormat('typeof module === "object" ? module.exports = 1 : globalThis.value = 1;'), 'umd');
    assert.equal(await detectJavaScriptSourceFormat('globalThis.Library = {value: 1};'), 'global');
    assert.equal(await detectJavaScriptSourceFormat('// module.exports = 1;\n"require(\\"x\\")";'), 'global');
});

test('场景：完整扫描同时返回 ESM 和 CommonJS 依赖集合', async () => {
    const result = await scanJavaScriptModuleSource([
        'import value from "esm-package";',
        'const fallback = require("commonjs-package");',
        'export default value || fallback;',
    ].join('\n'));

    assert.equal(result.format, 'module');
    assert.deepEqual(result.specifiers.map((item) => item.specifier), ['esm-package']);
    assert.deepEqual(result.esmSpecifiers.map((item) => item.specifier), ['esm-package']);
    assert.deepEqual(result.commonJsSpecifiers.map((item) => item.specifier), ['commonjs-package']);
});

test('场景：模块路径替换按原字符串引号正确转义', () => {
    assert.equal(escapeModuleSpecifier('a"b\\c\n', '"'), 'a\\"b\\\\c\\n');
    assert.equal(escapeModuleSpecifier("a'b\\c\r", "'"), "a\\'b\\\\c\\r");
    assert.equal(escapeModuleSpecifier('a`b${value}', '`'), 'a\\`b\\${value}');
});
