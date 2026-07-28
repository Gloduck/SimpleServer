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

    test('从 npm Registry 加载依赖 node:cluster 的 GitBeaker ESM 包', async ({page}) => {
        await page.route('https://gitlab.example.test/api/v4/user', (route) => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({id: 1, username: 'gitlab-user'}),
        }));
        const result = await page.evaluate(async () => {
            const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
            const prepared = await prepareRunScript({
                format: 'module',
                code: [
                    'import {Gitlab, Search} from "@gitbeaker/rest";',
                    'const client = new Gitlab({host: "https://gitlab.example.test", token: "test-token"});',
                    'const user = await client.Users.showCurrentUser();',
                    'export default {type: typeof Search, methods: Object.getOwnPropertyNames(Search.prototype), username: user.username};',
                ].join('\n'),
                dependencies: ['@gitbeaker/rest@43.7.0'],
            });
            return (await new NodeWorker(prepared).run()).exports.default;
        });

        expect(result.type).toBe('function');
        expect(result.methods).toContain('constructor');
        expect(result.username).toBe('gitlab-user');
    });

    test('从 npm Registry 加载 jira.js 并创建 Version3Client', async ({page}) => {
        await page.route('https://jira.example.test/**', (route) => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({id: '10001', key: 'TEST-1'}),
        }));
        const result = await page.evaluate(async () => {
            const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
            const prepared = await prepareRunScript({
                format: 'commonjs',
                code: [
                    'const {Version3Client} = require("jira.js");',
                    'const client = new Version3Client({',
                    '  host: "https://jira.example.test",',
                    '  authentication: {basic: {email: "test@example.test", apiToken: "test-token"}},',
                    '});',
                    'module.exports = client.issues.getIssue({issueIdOrKey: "TEST-1"}).then((issue) => ({',
                    '  client: typeof client, issues: typeof client.issues, getIssue: typeof client.issues.getIssue, issueKey: issue.key,',
                    '}));',
                ].join('\n'),
                dependencies: ['jira.js@5.4.0'],
            });
            return (await new NodeWorker(prepared).run()).exports;
        });

        expect(result).toEqual({client: 'object', issues: 'object', getIssue: 'function', issueKey: 'TEST-1'});
    });

    test('从 npm Registry 加载 Octokit 并创建客户端', async ({page}) => {
        await page.route('https://api.github.com/user', (route) => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({login: 'octocat'}),
        }));
        const result = await page.evaluate(async () => {
            const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
            const prepared = await prepareRunScript({
                format: 'module',
                code: [
                    'import {Octokit} from "octokit";',
                    'const client = new Octokit({auth: "test-token"});',
                    'const response = await client.request("GET /user");',
                    'export default {client: typeof client, request: typeof client.request, rest: typeof client.rest, graphql: typeof client.graphql, login: response.data.login};',
                ].join('\n'),
                dependencies: ['octokit@5.0.5'],
            });
            return (await new NodeWorker(prepared).run()).exports.default;
        });

        expect(result).toEqual({client: 'object', request: 'function', rest: 'object', graphql: 'function', login: 'octocat'});
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

    test('npm Jimp 完成真实 JPEG 读取、裁剪和 writeAsync 输出', async ({page}) => {
        const result = await page.evaluate(async () => {
            const {prepareRunScript, runAiNodeWorker} = globalThis.runtimeHarness;
            const canvas = document.createElement('canvas');
            canvas.width = 8;
            canvas.height = 4;
            const context = canvas.getContext('2d');
            context.fillStyle = '#e63946';
            context.fillRect(0, 0, 4, 4);
            context.fillStyle = '#457b9d';
            context.fillRect(4, 0, 4, 4);
            const inputBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            const inputBytes = new Uint8Array(await inputBlob.arrayBuffer());
            const prepared = await prepareRunScript({
                format: 'commonjs',
                cwd: '.',
                inputFiles: [{path: 'downloaded-image.jpg', content: inputBytes, mimeType: 'image/jpeg'}],
                code: [
                    'const Jimp = require("npm:jimp@0.22.12");',
                    'const path = require("node:path");',
                    'async function main() {',
                    '  const inputPath = path.join(process.cwd(), "downloaded-image.jpg");',
                    '  const outputPath = path.join(process.cwd(), "cropped-image.jpg");',
                    '  const image = await Jimp.read(inputPath);',
                    '  const {width, height} = image.bitmap;',
                    '  const size = Math.min(width, height);',
                    '  const x = Math.floor((width - size) / 2);',
                    '  const y = Math.floor((height - size) / 2);',
                    '  await image.crop(x, y, size, size).quality(90).writeAsync(outputPath);',
                    '  return {width, height, size, x, y};',
                    '}',
                    'module.exports = main();',
                ].join('\n'),
            });
            const outcome = await runAiNodeWorker({
                prepared,
                outputFiles: [{path: 'cropped-image.jpg', type: 'bytes', overwrite: true}],
                outputDirectories: [],
                fileLimits: {maxReadBytes: 64 * 1024 * 1024, maxWriteBytes: 64 * 1024 * 1024, maxEntryCount: 20_000},
                outputLimits: {maxOutputFileBytes: 10 * 1024 * 1024, maxOutputTotalBytes: 10 * 1024 * 1024, maxOutputFileCount: 10},
                network: {
                    serverUrl: '',
                    baseUrl: location.href,
                    limits: {maxRequestCount: 20, maxResponseBytes: 10 * 1024 * 1024, maxResponseTotalBytes: 10 * 1024 * 1024, defaultTimeoutMs: 10_000, maxTimeoutMs: 30_000},
                },
                logging: {maxEntries: 100},
                serialization: {maxStringLength: 5000, maxCollectionItems: 100, maxDepth: 5},
            }, {timeoutMs: 120_000});
            const outputBytes = outcome.outputFiles.find((file) => file.path === 'cropped-image.jpg')?.content;
            if (!outcome.ok || !outputBytes) {
                return {outcome, fileCount: prepared.files.length, hasJimp: false, output: null};
            }
            const outputImage = await createImageBitmap(new Blob([outputBytes], {type: 'image/jpeg'}));
            return {
                outcome,
                fileCount: prepared.files.length,
                hasJimp: prepared.files.some((file) => /\/jimp@0\.22\.12-[^/]+\/package\.json$/.test(file.path)),
                output: {width: outputImage.width, height: outputImage.height, size: outputBytes.byteLength},
            };
        });

        expect(result.outcome.error).toBeUndefined();
        expect(result.outcome.ok).toBe(true);
        expect(result.outcome.result).toEqual({width: 8, height: 4, size: 4, x: 2, y: 0});
        expect(result.hasJimp).toBe(true);
        expect(result.fileCount).toBeGreaterThan(0);
        expect(result.fileCount).toBeLessThanOrEqual(20_000);
        expect(result.output.width).toBe(4);
        expect(result.output.height).toBe(4);
        expect(result.output.size).toBeGreaterThan(0);
    });

    test('npm Jimp 1.6 使用 ESM API 读取并重新编码 JPEG', async ({page}) => {
        const result = await page.evaluate(async () => {
            const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
            const canvas = document.createElement('canvas');
            canvas.width = 8;
            canvas.height = 4;
            const context = canvas.getContext('2d');
            context.fillStyle = '#e63946';
            context.fillRect(0, 0, 8, 4);
            const inputBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            const inputBytes = new Uint8Array(await inputBlob.arrayBuffer());
            const prepared = await prepareRunScript({
                format: 'module',
                args: ['input.jpg', 'output.jpg', '--quality', '75'],
                inputFiles: [{path: 'input.jpg', content: inputBytes, mimeType: 'image/jpeg'}],
                code: [
                    'import {access, mkdir, stat, writeFile} from "node:fs/promises";',
                    'import path from "node:path";',
                    'import process from "node:process";',
                    'import {Jimp, JimpMime} from "npm:jimp@1.6.0";',
                    'const inputPath = path.resolve(process.argv[2]);',
                    'const outputPath = path.resolve(process.argv[3]);',
                    'await access(inputPath);',
                    'await mkdir(path.dirname(outputPath), {recursive: true});',
                    'const image = await Jimp.read(inputPath);',
                    'const output = await image.getBuffer(JimpMime.jpeg, {quality: 75});',
                    'await writeFile(outputPath, output);',
                    'const outputStat = await stat(outputPath);',
                    'export default {width: image.bitmap.width, height: image.bitmap.height, size: outputStat.size};',
                ].join('\n'),
            });
            try {
                const executed = await new NodeWorker(prepared).run();
                return {ok: true, result: executed.exports.default};
            } catch (error) {
                return {ok: false, name: error.name, code: error.code, message: error.message, stack: error.stack};
            }
        });

        expect(result).toEqual({ok: true, result: {width: 8, height: 4, size: expect.any(Number)}});
        expect(result.result.size).toBeGreaterThan(0);
    });

    test('Jimp 浏览器 CDN 构建作为全局包返回可调用的 Jimp 导出', async ({page}) => {
        const result = await page.evaluate(async () => {
            const {NodeWorker, prepareRunScript} = globalThis.runtimeHarness;
            const canvas = document.createElement('canvas');
            canvas.width = 6;
            canvas.height = 4;
            const context = canvas.getContext('2d');
            context.fillStyle = '#2a9d8f';
            context.fillRect(0, 0, 6, 4);
            const inputBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            const inputBytes = new Uint8Array(await inputBlob.arrayBuffer());
            const prepared = await prepareRunScript({
                format: 'commonjs',
                cwd: '.',
                inputFiles: [{path: 'downloaded-image.jpg', content: inputBytes, mimeType: 'image/jpeg'}],
                code: [
                    'const fs = require("node:fs");',
                    'const browserJimp = require("https://cdn.jsdelivr.net/npm/jimp@0.22.12/browser/lib/jimp.js");',
                    'const Jimp = browserJimp.Jimp || browserJimp;',
                    'async function main() {',
                    '  const image = await Jimp.read(fs.readFileSync("downloaded-image.jpg"));',
                    '  image.crop(1, 0, 4, 4).quality(90);',
                    '  const output = await image.getBufferAsync(Jimp.MIME_JPEG || "image/jpeg");',
                    '  fs.writeFileSync("cropped-image.jpg", output);',
                    '  return {hasRead: typeof Jimp.read === "function", width: image.bitmap.width, height: image.bitmap.height};',
                    '}',
                    'module.exports = main();',
                ].join('\n'),
            });
            const worker = new NodeWorker(prepared);
            const executed = await worker.run();
            const outputBytes = worker.fileSystem.readBytesSync('cropped-image.jpg');
            const outputImage = await createImageBitmap(new Blob([outputBytes], {type: 'image/jpeg'}));
            return {
                exports: executed.exports,
                output: {width: outputImage.width, height: outputImage.height, size: outputBytes.byteLength},
            };
        });

        expect(result.exports).toEqual({hasRead: true, width: 4, height: 4});
        expect(result.output.width).toBe(4);
        expect(result.output.height).toBe(4);
        expect(result.output.size).toBeGreaterThan(0);
    });
});
