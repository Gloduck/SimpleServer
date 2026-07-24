import {expect, test} from '@playwright/test';
import {getBrowserTestArgument, openRuntimeHarness} from '../test-helpers.js';

const enabled = ['1', 'true', 'yes', 'on'].includes(String(getBrowserTestArgument('external-network')).toLowerCase());

test.describe('外部依赖网络集成', () => {
    test.skip(!enabled, '通过 --external-network=1 启用真实外部网络测试');
    test.describe.configure({timeout: 120_000});
    test.beforeEach(async ({page}) => openRuntimeHarness(page));

    test('从 npm Registry 下载并执行 dayjs CommonJS 包', async ({page}) => {
        const result = await page.evaluate(async () => {
            const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
            const prepared = await prepareRunScript({
                format: 'commonjs',
                code: 'const dayjs = require("npm:dayjs@1.11.13"); module.exports = dayjs("2024-02-28").add(1, "day").format("YYYY-MM-DD");',
            });
            return (await new NodeWorker(prepared).run()).exports;
        });

        expect(result).toBe('2024-02-29');
    });

    test('从 CDN 加载 nanoid ESM 及其远程相对依赖', async ({page}) => {
        const result = await page.evaluate(async () => {
            const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
            const prepared = await prepareRunScript({
                format: 'module',
                code: [
                    'import {nanoid} from "https://cdn.jsdelivr.net/npm/nanoid@5.1.5/index.browser.js";',
                    'export default nanoid(12);',
                ].join('\n'),
            });
            return (await new NodeWorker(prepared).run()).exports.default;
        });

        expect(result).toMatch(/^[A-Za-z0-9_-]{12}$/);
    });

    test('从 npm Registry 下载并执行 hash-wasm 的 SHA-256 WebAssembly 实现', async ({page}) => {
        const result = await page.evaluate(async () => {
            const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
            const prepared = await prepareRunScript({
                format: 'commonjs',
                code: 'const {sha256} = require("npm:hash-wasm@4.12.0"); module.exports = sha256("hello");',
            });
            return (await new NodeWorker(prepared).run()).exports;
        });

        expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });
});
