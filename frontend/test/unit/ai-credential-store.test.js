import assert from 'node:assert/strict';
import test from 'node:test';
import {AI_CREDENTIAL_MAX_VALUE_BYTES, AiCredentialStore, parseAiCredentialText} from '../../src/shared/ai-credential-store.js';

test('场景：凭据文件支持标准单行 KEY=VALUE', () => {
    const values = parseAiCredentialText([
        '# comment',
        'TOKEN=plain',
        'export API_KEY="quoted value"',
        "PASSWORD='literal value'",
        'EMPTY=',
        'TOKEN=overridden',
    ].join('\n'));

    assert.deepEqual(Object.fromEntries(values), {
        TOKEN: 'overridden',
        API_KEY: 'quoted value',
        PASSWORD: 'literal value',
        EMPTY: '',
    });
    assert.throws(() => parseAiCredentialText('BAD-KEY=value'), {code: 'INVALID_CREDENTIAL_FILE'});
    assert.throws(() => parseAiCredentialText(`TOKEN=${'x'.repeat(AI_CREDENTIAL_MAX_VALUE_BYTES + 1)}`), {code: 'INVALID_CREDENTIAL_FILE'});
});

test('场景：后加载文件覆盖同名 Key 并在重载删除后回退', () => {
    const store = new AiCredentialStore();
    store.load('a.env', 'TOKEN=one\nA=first');
    const loaded = store.load('b.env', 'TOKEN=two\nB=second');

    assert.deepEqual(loaded.overridden_keys, ['TOKEN']);
    assert.deepEqual(store.list(), [
        {key: 'A', source: 'a.env'},
        {key: 'B', source: 'b.env'},
        {key: 'TOKEN', source: 'b.env'},
    ]);
    assert.equal(store.select(['TOKEN']).values.TOKEN, 'two');

    store.load('b.env', 'B=updated');
    assert.equal(store.select(['TOKEN']).values.TOKEN, 'one');
});

test('场景：选择凭据时未加载 Key 使用空字符串且快照保持不变', () => {
    const store = new AiCredentialStore();
    store.load('a.env', 'TOKEN=one');
    const selection = store.select(['TOKEN', 'MISSING', 'TOKEN']);
    store.load('a.env', 'TOKEN=two');

    assert.deepEqual(selection.requested, ['TOKEN', 'MISSING']);
    assert.deepEqual(selection.missing, ['MISSING']);
    assert.equal(selection.values.TOKEN, 'one');
    assert.equal(selection.values.MISSING, '');
});

test('场景：代理变量占位符只解析已声明 Key 并支持转换和字面量转义', () => {
    const store = new AiCredentialStore();
    store.load('a.env', 'TOKEN=a b/c');
    const selection = store.select(['TOKEN', 'MISSING']);

    assert.equal(store.resolveTemplate('raw=${TOKEN}', selection), 'raw=a b/c');
    assert.equal(store.resolveTemplate('url=${TOKEN|urlencode}', selection), 'url=a%20b%2Fc');
    assert.equal(store.resolveTemplate('json=${TOKEN|json}', selection), 'json="a b/c"');
    assert.equal(store.resolveTemplate('missing=${MISSING}', selection), 'missing=');
    assert.equal(store.resolveTemplate('literal=$${TOKEN}', selection), 'literal=${TOKEN}');
    assert.throws(() => store.resolveTemplate('${OTHER}', selection), {code: 'CREDENTIAL_NOT_DECLARED'});
});
