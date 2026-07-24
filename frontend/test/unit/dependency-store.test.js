import assert from 'node:assert/strict';
import test from 'node:test';
import {DependencyStore} from '../../src/shared/node-worker/dependency-store.js';

test('场景：元数据、包和远程模块共享缓存并返回分类统计', () => {
    const store = createDependencyStore();
    try {
        const metadata = {name: 'example', versions: {'1.0.0': {}}};
        const packageRecord = {name: 'example', version: '1.0.0', files: [{path: 'index.js', content: '123'}], totalBytes: 3};
        const remote = {source: 'export default 1;', size: 17};
        store.setMetadata('example', metadata);
        store.setPackage(packageRecord);
        store.setRemoteModule('https://example.test/module.js', remote);

        assert.equal(store.getMetadata('example'), metadata);
        assert.equal(store.getPackage('example', '1.0.0').files[0].content, '123');
        assert.equal(store.getRemoteModule('https://example.test/module.js').source, remote.source);
        assert.deepEqual(store.getStats(), {
            entryCount: 3,
            totalBytes: new TextEncoder().encode(JSON.stringify(metadata)).byteLength + 3 + 17,
            metadataCount: 1,
            packageCount: 1,
            remoteModuleCount: 1,
        });
    } finally {
        store.dispose();
    }
});

test('场景：相同包名和版本使用同一缓存键并由后写记录替换', () => {
    const store = createDependencyStore();
    try {
        store.setPackage({name: 'example', version: '1.0.0', source: 'local', files: [{path: 'index.js', content: 'one'}]});
        store.setPackage({name: 'example', version: '1.0.0', source: 'registry', files: [{path: 'index.js', content: 'two'}]});

        const cached = store.getPackage('example', '1.0.0');
        assert.equal(cached.files[0].content, 'two');
        assert.equal('source' in cached, false);
        assert.equal(store.getStats().packageCount, 1);
    } finally {
        store.dispose();
    }
});

test('场景：硬限制在插入时跨类型淘汰最久未使用条目', () => {
    const store = createDependencyStore({maxEntryCount: 2, lruEntryCount: 2});
    try {
        store.setMetadata('first', {value: 1});
        store.setRemoteModule('https://example.test/second.js', {source: '2', size: 1});
        store.getMetadata('first');
        store.setPackage({name: 'third', version: '1.0.0', files: [], totalBytes: 0});

        assert.ok(store.getMetadata('first'));
        assert.equal(store.getRemoteModule('https://example.test/second.js'), undefined);
        assert.ok(store.getPackage('third', '1.0.0'));
    } finally {
        store.dispose();
    }
});

test('场景：定时清理目标按最近访问顺序收缩统一 LRU', () => {
    const store = createDependencyStore({maxEntryCount: 4, lruEntryCount: 2});
    try {
        store.setMetadata('first', {value: 1});
        store.setMetadata('second', {value: 2});
        store.setMetadata('third', {value: 3});
        store.getMetadata('first');
        store.cleanup();

        assert.ok(store.getMetadata('first'));
        assert.equal(store.getMetadata('second'), undefined);
        assert.ok(store.getMetadata('third'));
        assert.equal(store.getStats().entryCount, 2);
    } finally {
        store.dispose();
    }
});

test('场景：缓存按字节限制淘汰旧条目并拒绝单条超限', () => {
    const store = createDependencyStore({maxTotalBytes: 5, lruTotalBytes: 5});
    try {
        store.setRemoteModule('https://example.test/first.js', {source: '123', size: 3});
        store.setRemoteModule('https://example.test/second.js', {source: '456', size: 3});
        assert.equal(store.getRemoteModule('https://example.test/first.js'), undefined);
        assert.equal(store.getRemoteModule('https://example.test/second.js').source, '456');
        assert.throws(
            () => store.setRemoteModule('https://example.test/large.js', {source: '123456', size: 6}),
            {code: 'DEPENDENCY_ENTRY_TOO_LARGE', size: 6, maxSize: 5},
        );
    } finally {
        store.dispose();
    }
});

test('场景：查询包版本会刷新每个匹配版本的 LRU 顺序', () => {
    const store = createDependencyStore({maxEntryCount: 3, lruEntryCount: 2});
    try {
        store.setPackage({name: 'example', version: '1.0.0', files: [], totalBytes: 0});
        store.setMetadata('other', {value: 1});
        store.setPackage({name: 'example', version: '2.0.0', files: [], totalBytes: 0});
        assert.deepEqual(store.getPackageVersions('example').map((item) => item.version), ['1.0.0', '2.0.0']);
        store.cleanup();
        assert.equal(store.getMetadata('other'), undefined);
        assert.equal(store.getStats().packageCount, 2);
    } finally {
        store.dispose();
    }
});

test('场景：缓存限制参数拒绝非法值和超过硬限制的 LRU 目标', () => {
    assert.throws(() => createDependencyStore({maxEntryCount: 0}), RangeError);
    assert.throws(() => createDependencyStore({maxTotalBytes: 0}), RangeError);
    assert.throws(() => createDependencyStore({maxEntryCount: 2, lruEntryCount: 3}), RangeError);
    assert.throws(() => createDependencyStore({maxTotalBytes: 2, lruTotalBytes: 3}), RangeError);
});

function createDependencyStore(limits = {}) {
    return new DependencyStore({limits: {cleanupIntervalMs: 0, ...limits}});
}
