import assert from 'node:assert/strict';
import test from 'node:test';
import {gzipSync} from 'fflate';
import {DependencyStore} from '../../src/shared/node-worker/dependency-store.js';
import {
    PackageDownloader,
    compareVersions,
    satisfiesVersion,
    selectPackageVersion,
} from '../../src/shared/node-worker/package-downloader.js';

test('场景：语义版本比较覆盖稳定版、预发布和无效版本', () => {
    assert.equal(compareVersions('1.2.3', '1.2.2'), 1);
    assert.equal(compareVersions('1.2.3-beta.2', '1.2.3-beta.10'), -1);
    assert.equal(compareVersions('1.2.3', '1.2.3-beta.1'), 1);
    assert.equal(compareVersions('invalid-b', 'invalid-a') > 0, true);
});

test('场景：语义版本范围支持精确、通配符、比较、波浪、脱字符和并集', () => {
    const matches = [
        ['1.2.3', '1.2.3'],
        ['1.2.3', '1.2.x'],
        ['1.2.3', '^1.2.0'],
        ['0.2.5', '^0.2.0'],
        ['1.2.3', '~1.2.0'],
        ['1.5.0', '>=1.0.0 <2.0.0'],
        ['2.0.0', '1.x || 2.x'],
        ['1.5.0', '1.2.0 - 1.8.0'],
        ['1.2.3-beta.1', '1.2.3-beta.1'],
    ];
    for (const [version, range] of matches) assert.equal(satisfiesVersion(version, range), true, `${version} should match ${range}`);
    for (const [version, range] of [['2.0.0', '^1.2.0'], ['1.3.0', '~1.2.0'], ['1.2.3-beta.1', '^1.2.0']]) {
        assert.equal(satisfiesVersion(version, range), false, `${version} should not match ${range}`);
    }
});

test('场景：版本选择优先精确版本和 dist-tag，再选择范围内最高版本', () => {
    const metadata = {
        name: 'example',
        'dist-tags': {latest: '2.0.0', next: '3.0.0-beta.1'},
        versions: {
            '1.0.0': {},
            '1.5.0': {},
            '2.0.0': {},
            '3.0.0-beta.1': {},
        },
    };
    assert.equal(selectPackageVersion(metadata, 'v1.0.0'), '1.0.0');
    assert.equal(selectPackageVersion(metadata, 'latest'), '2.0.0');
    assert.equal(selectPackageVersion(metadata, 'next'), '3.0.0-beta.1');
    assert.equal(selectPackageVersion(metadata, '^1.0.0'), '1.5.0');
    assert.throws(() => selectPackageVersion(metadata, '^4.0.0'), {code: 'PACKAGE_VERSION_NOT_FOUND'});
});

test('场景：下载器读取 npm 元数据、解压 gzip tar、过滤穿越路径并缓存结果', async () => {
    const store = createDependencyStore();
    const archive = gzipSync(createTar([
        ['package/package.json', '{"name":"example","version":"1.0.0","main":"index.js"}'],
        ['package/index.js', 'module.exports = "ok";'],
        ['package/lib/value.json', '{"value":1}'],
        ['package/../outside.js', 'ignored'],
    ]));
    const metadata = {
        name: 'example',
        'dist-tags': {latest: '1.0.0'},
        versions: {'1.0.0': {name: 'example', version: '1.0.0', dist: {tarball: 'https://registry.test/example.tgz'}}},
    };
    const requests = [];
    const downloader = new PackageDownloader({
        store,
        registryUrl: 'https://registry.test',
        fetch: async (url, options) => {
            requests.push({url: String(url), accept: options.headers?.Accept || ''});
            if (String(url).endsWith('/example')) return new Response(JSON.stringify(metadata));
            if (String(url).endsWith('/example.tgz')) return new Response(archive);
            return new Response('', {status: 404});
        },
    });
    try {
        const first = await downloader.download('example', 'latest');
        const second = await downloader.download('example', '^1.0.0');
        assert.equal(first, second);
        assert.equal(first.version, '1.0.0');
        assert.equal(first.manifest.main, 'index.js');
        assert.deepEqual(first.files.map((file) => file.path), ['index.js', 'lib/value.json', 'package.json']);
        assert.equal(new TextDecoder().decode(first.files.find((file) => file.path === 'index.js').content), 'module.exports = "ok";');
        assert.equal(requests.length, 2);
        assert.match(requests[0].accept, /npm\.install/);
        assert.equal(store.getStats().metadataCount, 1);
        assert.equal(store.getStats().packageCount, 1);
    } finally {
        store.dispose();
    }
});

test('场景：并发下载相同包会合并元数据和 tarball 请求', async () => {
    const store = createDependencyStore();
    const archive = createTar([
        ['package/package.json', '{"name":"example","version":"1.0.0"}'],
        ['package/index.js', 'module.exports = 1;'],
    ]);
    let metadataRequests = 0;
    let packageRequests = 0;
    const downloader = new PackageDownloader({
        store,
        fetch: async (url) => {
            if (String(url).includes('registry.npmjs.org')) {
                metadataRequests += 1;
                await Promise.resolve();
                return new Response(JSON.stringify({
                    name: 'example',
                    'dist-tags': {latest: '1.0.0'},
                    versions: {'1.0.0': {dist: {tarball: 'https://registry.test/example.tar'}}},
                }));
            }
            packageRequests += 1;
            await Promise.resolve();
            return new Response(archive);
        },
    });
    try {
        const [first, second, third] = await Promise.all([
            downloader.download('example'),
            downloader.download('example'),
            downloader.download('example', '1.x'),
        ]);
        assert.equal(first, second);
        assert.equal(second, third);
        assert.equal(metadataRequests, 1);
        assert.equal(packageRequests, 1);
    } finally {
        store.dispose();
    }
});

test('场景：作用域包元数据 URL 会整体编码', async () => {
    const store = createDependencyStore();
    let requestedUrl = '';
    const downloader = new PackageDownloader({
        store,
        registryUrl: 'https://registry.test/',
        fetch: async (url) => {
            requestedUrl = String(url);
            return new Response(JSON.stringify({name: '@scope/example', versions: {}}));
        },
    });
    try {
        await downloader.getMetadata('@scope/example');
        assert.equal(requestedUrl, 'https://registry.test/%40scope%2Fexample');
    } finally {
        store.dispose();
    }
});

test('场景：下载大小、解压大小、文件数量和无效内容分别返回稳定错误', async () => {
    const metadata = (tarball) => ({
        name: 'example',
        'dist-tags': {latest: '1.0.0'},
        versions: {'1.0.0': {dist: {tarball}}},
    });
    const cases = [
        {
            limits: {maxMetadataBytes: 5},
            fetch: async () => new Response(JSON.stringify(metadata('https://registry.test/a.tar'))),
            code: 'PACKAGE_DOWNLOAD_TOO_LARGE',
        },
        {
            limits: {maxPackageBytes: 5},
            fetch: createPackageFetch(metadata('https://registry.test/a.tar'), new Uint8Array(6)),
            code: 'PACKAGE_DOWNLOAD_TOO_LARGE',
        },
        {
            limits: {maxPackageArchiveBytes: 512},
            fetch: createPackageFetch(metadata('https://registry.test/a.tar'), gzipSync(createTar([['package/file.txt', 'x'.repeat(600)]]))),
            code: 'PACKAGE_ARCHIVE_TOO_LARGE',
        },
        {
            limits: {maxPackageFileCount: 1},
            fetch: createPackageFetch(metadata('https://registry.test/a.tar'), createTar([['package/a.txt', 'a'], ['package/b.txt', 'b']])),
            code: 'PACKAGE_FILE_COUNT_EXCEEDED',
        },
        {
            limits: {},
            fetch: async () => new Response('{invalid'),
            code: 'INVALID_PACKAGE_METADATA',
        },
        {
            limits: {},
            fetch: createPackageFetch(metadata('https://registry.test/a.tar'), createTar([['package/package.json', '{invalid']])),
            code: 'INVALID_PACKAGE_MANIFEST',
        },
    ];

    for (const item of cases) {
        const store = createDependencyStore();
        try {
            const downloader = new PackageDownloader({store, fetch: item.fetch, limits: item.limits});
            await assert.rejects(downloader.download('example'), {code: item.code});
        } finally {
            store.dispose();
        }
    }
});

test('场景：无效包名、失败响应、缺失 tarball 和 AbortSignal 被拒绝', async () => {
    const store = createDependencyStore();
    try {
        const downloader = new PackageDownloader({store, fetch: async () => new Response('', {status: 404})});
        for (const name of ['', '.', '..', '@scope', '../escape', '@scope/../escape']) {
            await assert.rejects(downloader.download(name), {code: 'INVALID_PACKAGE_NAME'});
        }
        await assert.rejects(downloader.download('example'), {code: 'PACKAGE_DOWNLOAD_FAILED', status: 404});

        const missingTarball = new PackageDownloader({
            store,
            fetch: async () => new Response(JSON.stringify({name: 'missing', 'dist-tags': {latest: '1.0.0'}, versions: {'1.0.0': {}}})),
        });
        await assert.rejects(missingTarball.download('missing'), {code: 'PACKAGE_TARBALL_NOT_FOUND'});

        const controller = new AbortController();
        controller.abort(new DOMException('cancelled', 'AbortError'));
        await assert.rejects(downloader.download('example', 'latest', {signal: controller.signal}), {name: 'AbortError'});
    } finally {
        store.dispose();
    }
});

function createPackageFetch(metadata, archive) {
    return async (url) => String(url).includes('registry.npmjs.org')
        ? new Response(JSON.stringify(metadata))
        : new Response(archive);
}

function createDependencyStore(limits = {}) {
    return new DependencyStore({limits: {cleanupIntervalMs: 0, ...limits}});
}

function createTar(entries) {
    const chunks = [];
    for (const [path, value] of entries) {
        const content = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
        const header = new Uint8Array(512);
        writeTarString(header, 0, 100, path);
        writeTarString(header, 100, 8, '0000644');
        writeTarString(header, 108, 8, '0000000');
        writeTarString(header, 116, 8, '0000000');
        writeTarString(header, 124, 12, content.byteLength.toString(8).padStart(11, '0'));
        writeTarString(header, 136, 12, '00000000000');
        header[156] = '0'.charCodeAt(0);
        chunks.push(header, content, new Uint8Array((512 - (content.byteLength % 512)) % 512));
    }
    chunks.push(new Uint8Array(1024));
    const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

function writeTarString(target, offset, length, value) {
    const bytes = new TextEncoder().encode(String(value));
    target.set(bytes.subarray(0, length), offset);
}
