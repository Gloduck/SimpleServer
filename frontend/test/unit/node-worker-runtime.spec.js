import {expect, test} from '@playwright/test';
import nativeHttp from 'node:http';
import nativeTty from 'node:tty';
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

test('node:tty isatty 与原生 Node 的非 TTY 行为一致', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            'const tty = require("node:tty");',
            'module.exports = {alias: require("tty") === tty, values: input.map((value) => tty.isatty(value))};',
        ].join('\n'),
        input: [undefined, null, -1, 0, 1, '1', {}, Number.NaN],
    });

    expect(result.exports).toEqual({
        alias: true,
        values: [undefined, null, -1, 0, 1, '1', {}, Number.NaN].map((value) => nativeTty.isatty(value)),
    });
});

test('浏览器 Buffer Polyfill 支持常用编码、复制和数值读写', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            'const {Buffer: ImportedBuffer} = require("node:buffer");',
            'const utf8 = Buffer.from("hello");',
            'const combined = Buffer.concat([Buffer.from("a"), Buffer.from("b")]);',
            'const numeric = Buffer.allocUnsafe(8);',
            'numeric.writeUInt32BE(0x12345678, 0);',
            'numeric.writeFloatLE(1.5, 4);',
            'const copied = Buffer.alloc(3);',
            'Buffer.from([4, 5, 6]).copy(copied);',
            'module.exports = {',
            '  same: Buffer === ImportedBuffer,',
            '  utf8: utf8.toString(),',
            '  hex: utf8.toString("hex"),',
            '  base64: utf8.toString("base64"),',
            '  decoded: Buffer.from("aGVsbG8=", "base64").toString(),',
            '  allocated: Array.from(Buffer.alloc(3, 7)),',
            '  combined: combined.toString(),',
            '  isBuffer: Buffer.isBuffer(utf8),',
            '  allocUnsafe: Array.from(numeric.slice(0, 4)),',
            '  integer: numeric.readUInt32BE(0),',
            '  float: numeric.readFloatLE(4),',
            '  byteLength: Buffer.byteLength("你好"),',
            '  copied: Array.from(copied),',
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
        allocUnsafe: [18, 52, 86, 120],
        integer: 0x12345678,
        float: 1.5,
        byteLength: 6,
        copied: [4, 5, 6],
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
            '  parsedPath: path.parse("/a/b/file.test.js"),',
            '  query: querystring.stringify({a: "x y", b: 2}),',
            '  parsed: querystring.parse("a=x+y&b=2"),',
            '  encodedAlias: querystring.encode({a: "x y"}),',
            '  decodedAlias: querystring.decode("a=x+y"),',
            '  aliasIdentity: querystring.encode === querystring.stringify && querystring.decode === querystring.parse,',
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
        parsedPath: {root: '/', dir: '/a/b', base: 'file.test.js', ext: '.js', name: 'file.test'},
        query: 'a=x%20y&b=2',
        parsed: {a: 'x y', b: '2'},
        encodedAlias: 'a=x%20y',
        decodedAlias: {a: 'x y'},
        aliasIdentity: true,
        host: 'example.test',
        fileUrl: 'file:///workspace/a.txt',
        filePath: '/workspace/a.txt',
    });
});

test('AI 描述列出的 Node 内置模块别名均可加载', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            'const strict = require("node:assert/strict");',
            'const EventEmitter = require("node:events");',
            'const posix = require("node:path/posix");',
            'const streamPromises = require("node:stream/promises");',
            'const streamWeb = require("node:stream/web");',
            'const {StringDecoder} = require("node:string_decoder");',
            'const timersPromises = require("node:timers/promises");',
            'const utilTypes = require("node:util/types");',
            'module.exports = (async () => {',
            '  strict.strictEqual(require("assert/strict"), strict);',
            '  await timersPromises.setTimeout(0);',
            '  const emitter = new EventEmitter();',
            '  let emitted = false;',
            '  emitter.once("ready", () => { emitted = true; });',
            '  emitter.emit("ready");',
            '  const decoder = new StringDecoder("utf8");',
            '  const symbol = Buffer.from("你");',
            '  const decoded = decoder.write(symbol.subarray(0, 2)) + decoder.end(symbol.subarray(2));',
            '  return {',
            '    emitted,',
            '    path: posix.join("a", "..", "b"),',
            '    processAlias: require("node:process") === process && require("process") === process,',
            '    streamPromises: typeof streamPromises.pipeline,',
            '    streamWeb: typeof streamWeb.ReadableStream,',
            '    decoded,',
            '    typedArray: utilTypes.isUint8Array(Buffer.from("x")),',
            '  };',
            '})();',
        ].join('\n'),
    });

    expect(result.exports).toEqual({
        emitted: true,
        path: 'b',
        processAlias: true,
        streamPromises: 'function',
        streamWeb: 'function',
        decoded: '你',
        typedArray: true,
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

test('node:fs 回调接口和 createWriteStream 支持依赖包常见文件流程', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        cwd: 'workspace',
        files: [{path: 'workspace/input.txt', content: 'callback'}],
        code: [
            'const fs = require("node:fs");',
            'module.exports = new Promise((resolve, reject) => {',
            '  fs.readFile("input.txt", "utf8", (readError, text) => {',
            '    if (readError) return reject(readError);',
            '    fs.writeFile("callback.txt", `${text}-write`, (writeError) => {',
            '      if (writeError) return reject(writeError);',
            '      const output = fs.createWriteStream("stream.txt");',
            '      output.on("error", reject);',
            '      output.on("finish", () => resolve(text));',
            '      output.on("open", () => output.end(`${text}-stream`));',
            '    });',
            '  });',
            '});',
        ].join('\n'),
    }, ['workspace/callback.txt', 'workspace/stream.txt']);

    expect(result.exports).toBe('callback');
    expect(result.outputs['workspace/callback.txt'].text).toBe('callback-write');
    expect(result.outputs['workspace/stream.txt'].text).toBe('callback-stream');
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

test('ESM 可以命名导入 node:fs/promises access', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'module',
        cwd: 'workspace',
        files: [{path: 'workspace/input.txt', content: 'available'}],
        code: [
            'import { access } from "node:fs/promises";',
            'await access("input.txt");',
            'let missingCode = "";',
            'try { await access("missing.txt"); } catch (error) { missingCode = error.code; }',
            'export default missingCode;',
        ].join('\n'),
    });

    expect(result.exports.default).toBe('FILE_NOT_FOUND');
});

test('node:stream、node:zlib 和 util.inherits 支持传统 CommonJS 依赖', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            'const Stream = require("node:stream");',
            'const zlib = require("node:zlib");',
            'const util = require("node:util");',
            'function LegacyStream() { Stream.call(this); }',
            'util.inherits(LegacyStream, Stream);',
            'const source = new Stream.Readable();',
            'const pass = new Stream.PassThrough();',
            'const chunks = [];',
            'source.push(Buffer.from("stream-ok"));',
            'source.push(null);',
            'module.exports = new Promise((resolve, reject) => {',
            '  pass.on("data", (chunk) => chunks.push(chunk));',
            '  pass.on("error", reject);',
            '  pass.on("end", () => {',
            '    const compressed = zlib.gzipSync(Buffer.concat(chunks));',
            '    resolve({',
            '      text: zlib.gunzipSync(compressed).toString(),',
            '      legacy: new LegacyStream() instanceof Stream,',
            '      aliases: require("stream") === Stream && require("zlib") === zlib,',
            '    });',
            '  });',
            '  source.pipe(pass);',
            '});',
        ].join('\n'),
    });

    expect(result.exports).toEqual({text: 'stream-ok', legacy: true, aliases: true});
});

test('global、node:timers 和 node:punycode 提供旧版依赖所需接口', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            'const timers = require("node:timers");',
            'const punycode = require("node:punycode");',
            'module.exports = new Promise((resolve) => {',
            '  timers.setImmediate(() => resolve({',
            '    globalAlias: global === globalThis,',
            '    ascii: punycode.toASCII("mañana.com"),',
            '    unicode: punycode.toUnicode("xn--maana-pta.com"),',
            '    symbols: punycode.ucs2.decode("A😀").length,',
            '    aliases: require("timers") === timers && require("punycode") === punycode,',
            '  }));',
            '});',
        ].join('\n'),
    });

    expect(result.exports).toEqual({
        globalAlias: true,
        ascii: 'xn--maana-pta.com',
        unicode: 'mañana.com',
        symbols: 2,
        aliases: true,
    });
});

test('node:crypto 支持 Web Crypto、随机数、Hash、HMAC 和常用 KDF', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            'const crypto = require("node:crypto");',
            'module.exports = (async () => {',
            '  const syncPbkdf2 = crypto.pbkdf2Sync("password", "salt", 2, 32, "sha256");',
            '  const asyncPbkdf2 = await new Promise((resolve, reject) => crypto.pbkdf2("password", "salt", 2, 32, "sha256", (error, value) => error ? reject(error) : resolve(value)));',
            '  const random = crypto.randomBytes(24);',
            '  const largeRandom = crypto.randomBytes(70000);',
            '  const filled = Buffer.alloc(8);',
            '  await new Promise((resolve, reject) => crypto.randomFill(filled, (error) => error ? reject(error) : resolve()));',
            '  const typed = new Uint16Array(4);',
            '  crypto.randomFillSync(typed, 2, 2);',
            '  const shake = crypto.createHash("shake128", {outputLength: 16}).update("abc");',
            '  const shakeCopy = shake.copy({outputLength: 8});',
            '  let fixedOutputError;',
            '  try { crypto.createHash("sha256", {outputLength: 16}); } catch (error) { fixedOutputError = error.code; }',
            '  let scryptLimitError;',
            '  try { crypto.scryptSync("password", "salt", 16, {N: 16, r: 1, p: 1, maxmem: 65 * 1024 * 1024}); } catch (error) { scryptLimitError = error.name; }',
            '  return {',
            '    alias: require("crypto") === crypto,',
            '    webcrypto: crypto.webcrypto === globalThis.crypto && crypto.subtle === globalThis.crypto.subtle,',
            '    hash: crypto.createHash("sha256").update("abc").digest("hex"),',
            '    hmac: crypto.createHmac("sha256", "key").update("abc").digest("hex"),',
            '    encodedHmac: crypto.createHmac("sha256", "ff00", {encoding: "hex"}).update("abc").digest("hex"),',
            '    bufferEncoding: Buffer.isBuffer(crypto.createHash("sha256").digest("buffer")),',
            '    shake: shake.digest("hex"),',
            '    shakeCopy: shakeCopy.digest("hex"),',
            '    emptyShake: crypto.createHash("shake128", {outputLength: 0}).digest().length,',
            '    fixedOutputError,',
            '    pbkdf2: syncPbkdf2.toString("hex"),',
            '    asyncPbkdf2: asyncPbkdf2.equals(syncPbkdf2),',
            '    hkdf: Buffer.from(crypto.hkdfSync("sha256", "key", "salt", "info", 32)).toString("hex"),',
            '    scrypt: crypto.scryptSync("password", "salt", 16, {N: 16, r: 1, p: 1, maxmem: 1024 * 1024}).toString("hex"),',
            '    randomLength: random.length,',
            '    largeRandomLength: largeRandom.length,',
            '    filledLength: filled.length,',
            '    typedPrefix: [typed[0], typed[1]],',
            '    typedChanged: typed[2] !== 0 || typed[3] !== 0,',
            '    randomInt: crypto.randomInt(5, 10),',
            '    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(crypto.randomUUID()),',
            '    equal: crypto.timingSafeEqual(Buffer.from("same"), Buffer.from("same")),',
            '    hashes: crypto.getHashes().includes("sha3-256"),',
            '    scryptLimitError,',
            '  };',
            '})();',
        ].join('\n'),
    });

    expect(result.exports).toMatchObject({
        alias: true,
        webcrypto: true,
        hash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        hmac: '9c196e32dc0175f86f4b1cb89289d6619de6bee699e4c378e68309ed97a1a6ab',
        encodedHmac: '19a05a8b31a3631f7dc9f0b767707784df7c4f0a17578aea5732838b8651f8b3',
        bufferEncoding: true,
        shake: '5881092dd818bf5cf8a3ddb793fbcba7',
        shakeCopy: '5881092dd818bf5c',
        emptyShake: 0,
        fixedOutputError: 'ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH',
        pbkdf2: 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43',
        asyncPbkdf2: true,
        hkdf: '9ca0d662557439e3b83365f2da4626d35da195c6d9d1779f09838cf9e408966e',
        scrypt: '45133c3dfba48c82235df51a53499241',
        randomLength: 24,
        largeRandomLength: 70000,
        filledLength: 8,
        typedPrefix: [0, 0],
        typedChanged: true,
        uuid: true,
        equal: true,
        hashes: true,
        scryptLimitError: 'RangeError',
    });
    expect(result.exports.randomInt).toBeGreaterThanOrEqual(5);
    expect(result.exports.randomInt).toBeLessThan(10);
});

test('node:crypto 支持缓冲式 AES/ChaCha20-Poly1305 和常见 ECDH 曲线', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        code: [
            'const crypto = require("node:crypto");',
            'function roundTrip(algorithm, key, iv) {',
            '  const cipher = crypto.createCipheriv(algorithm, key, iv);',
            '  cipher.setAAD(Buffer.from("a"));',
            '  cipher.setAAD(Buffer.from("ad"));',
            '  const encrypted = Buffer.concat([cipher.update("secret"), cipher.final()]);',
            '  const decipher = crypto.createDecipheriv(algorithm, key, iv);',
            '  decipher.setAAD(Buffer.from("a"));',
            '  decipher.setAAD(Buffer.from("ad"));',
            '  decipher.setAuthTag(cipher.getAuthTag());',
            '  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();',
            '}',
            'function exchange(curve) {',
            '  const alice = crypto.createECDH(curve);',
            '  const bob = crypto.createECDH(curve);',
            '  const alicePublic = alice.generateKeys("buffer", "compressed");',
            '  const bobPublic = bob.generateKeys("buffer", "compressed");',
            '  const aliceSecret = alice.computeSecret(bobPublic);',
            '  const bobSecret = bob.computeSecret(alicePublic);',
            '  return [aliceSecret.equals(bobSecret), aliceSecret.length];',
            '}',
            'function rejectsTamperedTag() {',
            '  const key = Buffer.alloc(32, 5);',
            '  const iv = Buffer.alloc(12, 6);',
            '  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);',
            '  const encrypted = Buffer.concat([cipher.update("secret"), cipher.final()]);',
            '  const tag = cipher.getAuthTag();',
            '  tag[0] ^= 1;',
            '  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);',
            '  decipher.setAuthTag(tag);',
            '  decipher.update(encrypted);',
            '  try { decipher.final(); return false; } catch { return true; }',
            '}',
            'const ordered = crypto.createCipheriv("aes-256-gcm", Buffer.alloc(32), Buffer.alloc(12));',
            'ordered.update("x");',
            'let aadOrderError;',
            'try { ordered.setAAD(Buffer.from("late")); } catch (error) { aadOrderError = error.code; }',
            'const imported = crypto.createECDH("secp521r1");',
            'imported.setPrivateKey(Buffer.from([1]));',
            'const padded = crypto.createECDH("secp521r1");',
            'const paddedKey = Buffer.alloc(66);',
            'paddedKey[65] = 1;',
            'padded.setPrivateKey(paddedKey);',
            'const converted = crypto.ECDH.convertKey(imported.getPublicKey(), "secp521r1", undefined, "buffer", "compressed");',
            'module.exports = {',
            '  aes: roundTrip("aes-256-gcm", Buffer.alloc(32, 1), Buffer.alloc(12, 2)),',
            '  chacha: roundTrip("chacha20-poly1305", Buffer.alloc(32, 3), Buffer.alloc(12, 4)),',
            '  exchanges: crypto.getCurves().map(exchange),',
            '  minimalPrivate: imported.getPrivateKey("hex"),',
            '  paddedPrivate: padded.getPrivateKey("hex"),',
            '  convertedLength: converted.length,',
            '  tampered: rejectsTamperedTag(),',
            '  aadOrderError,',
            '  curves: crypto.getCurves(),',
            '  cipherInfo: crypto.getCipherInfo("aes-256-gcm"),',
            '  unknownCipher: crypto.getCipherInfo("missing") === undefined,',
            '};',
        ].join('\n'),
    });

    expect(result.exports).toEqual({
        aes: 'secret',
        chacha: 'secret',
        exchanges: [[true, 32], [true, 32], [true, 48], [true, 66]],
        minimalPrivate: '01',
        paddedPrivate: '01',
        convertedLength: 67,
        tampered: true,
        aadOrderError: 'ERR_CRYPTO_INVALID_STATE',
        curves: ['prime256v1', 'secp256k1', 'secp384r1', 'secp521r1'],
        cipherInfo: {name: 'aes-256-gcm', blockSize: 1, ivLength: 12, keyLength: 32, mode: 'gcm'},
        unknownCipher: true,
    });
});

test('node:crypto 支持 ESM 默认导出和命名导入', async ({page}) => {
    const result = await runNodeWorker(page, {
        format: 'module',
        code: [
            'import crypto, {createHash, randomBytes} from "node:crypto";',
            'export const digest = createHash("sha256").update("esm").digest("hex");',
            'export const randomLength = randomBytes(9).length;',
            'export default crypto.createHash === createHash;',
        ].join('\n'),
    });

    expect(result.exports).toEqual({
        default: true,
        digest: '5ab42519dcd95951e963eb84e460fa5a6313644522454f1a39e5f64b92646d40',
        randomLength: 9,
    });
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
    for (const specifier of ['node:child_process', 'node:os', 'child_process', 'os']) {
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

    const nativeErrors = {};
    for (const [name, operation] of [
        ['name', () => nativeHttp.validateHeaderName('bad header')],
        ['value', () => nativeHttp.validateHeaderValue('x', 'bad\nvalue')],
    ]) {
        try {
            operation();
        } catch (error) {
            nativeErrors[name] = {name: error.name, code: error.code, message: error.message};
        }
    }
    const result = await runNodeWorker(page, {
        format: 'commonjs',
        input: {methods: nativeHttp.METHODS, status200: nativeHttp.STATUS_CODES[200], errors: nativeErrors},
        code: [
            'const http = require("node:http");',
            'const https = require("node:https");',
            'http.validateHeaderName("x-test");',
            'http.validateHeaderValue("x-test", "ok");',
            'const errors = {};',
            'for (const [name, operation] of [["name", () => http.validateHeaderName("bad header")], ["value", () => http.validateHeaderValue("x", "bad\\nvalue")]]) {',
            '  try { operation(); } catch (error) { errors[name] = {name: error.name, code: error.code, message: error.message}; }',
            '}',
            'const viaHttps = new Promise((resolve, reject) => {',
            '  const request = https.get("https://example.test/https", (response) => {',
            '    const chunks = [];',
            '    response.on("data", (chunk) => chunks.push(chunk));',
            '    response.on("end", () => resolve(Buffer.concat(chunks).toString()));',
            '  });',
            '  request.on("error", reject);',
            '});',
            'module.exports = Promise.all([fetch("https://example.test/fetch").then((response) => response.text()), viaHttps])',
            '  .then((values) => ({values, methods: http.METHODS, status200: http.STATUS_CODES[200], errors,',
            '    mutable: !Object.isFrozen(http.METHODS) && !Object.isFrozen(http.STATUS_CODES),',
            '    httpsMetadata: [https.METHODS, https.STATUS_CODES, https.validateHeaderName, https.validateHeaderValue].map((value) => typeof value),',
            '  }));',
        ].join('\n'),
    });

    expect(result.exports).toEqual({
        values: ['fetch-ok', 'https-ok'],
        methods: nativeHttp.METHODS,
        status200: nativeHttp.STATUS_CODES[200],
        errors: nativeErrors,
        mutable: true,
        httpsMetadata: ['undefined', 'undefined', 'undefined', 'undefined'],
    });
});
