import assert from 'node:assert/strict';
import test from 'node:test';
import {
    base64ToBlob,
    base64ToBytes,
    base64UrlToBytes,
    blobToText,
    bytesToBase64,
    bytesToBase64Url,
    getBase64DecodedSize,
    getFileName,
    getMimeType,
    joinFilePath,
    normalizeFilePath,
    streamToBlob,
    textToBlob,
    withBlobType,
} from '../../src/shared/file-utils.js';

test('场景：规范化文件路径并解析文件元数据', () => {
    assert.equal(normalizeFilePath('/docs//guide/../readme.md'), 'docs/readme.md');
    assert.equal(joinFilePath('docs', '../readme.md'), 'readme.md');
    assert.equal(getFileName('docs/guide/../readme.md'), 'readme.md');
    assert.equal(getFileName('docs/'), '');
    assert.equal(getMimeType('assets/icon.webp'), 'image/webp');
    assert.equal(getMimeType('archive.unknown'), 'application/octet-stream');
    assert.throws(() => normalizeFilePath('../../secret'), {code: 'INVALID_FILE_PATH'});
});

test('场景：文本、Blob 和流转换保持原始字节不变', async () => {
    const text = '\u4f60\u597d';
    const textBlob = textToBlob(text, 'text/markdown');
    assert.equal(textBlob.size, 6);
    assert.equal(textBlob.type, 'text/markdown');
    assert.equal(await blobToText(textBlob), text);

    const typedBlob = withBlobType(textBlob, 'text/plain');
    assert.equal(typedBlob.type, 'text/plain');
    assert.equal(await blobToText(typedBlob), text);

    const streamedBlob = await streamToBlob(textBlob.stream(), 'text/plain');
    assert.equal(streamedBlob.type, 'text/plain');
    assert.equal(await blobToText(streamedBlob), text);
});

test('场景：标准 Base64 与 URL 安全 Base64 可以互相转换', async () => {
    const text = '\u4f60\u597d';
    const bytes = new TextEncoder().encode(text);
    const base64 = bytesToBase64(bytes);
    const base64Url = bytesToBase64Url(bytes);

    assert.deepEqual(base64ToBytes(base64), bytes);
    assert.deepEqual(base64UrlToBytes(base64Url), bytes);
    assert.equal(getBase64DecodedSize(base64), bytes.byteLength);

    const blob = base64ToBlob(`data:text/plain;base64,${base64}`);
    assert.equal(blob.type, 'text/plain');
    assert.equal(await blobToText(blob), text);

    const parameterizedBlob = base64ToBlob(`data:text/plain;charset=utf-8;base64,${base64}`);
    assert.equal(parameterizedBlob.type, 'text/plain');
    assert.equal(await blobToText(parameterizedBlob), text);
});
