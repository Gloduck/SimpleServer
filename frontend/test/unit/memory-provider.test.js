import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createFileSystem,
    FileAlreadyExistsError,
    FileConflictError,
    FileDirectoryNotEmptyError,
    FileIsDirectoryError,
    FilePermissionError,
    FileSystem,
    FileSystemProvider,
    FileUnsupportedError,
    MemoryProvider,
} from '../../src/shared/file-system/index.js';
import {GithubProvider} from '../../src/shared/file-system/providers/github-provider.js';

test('场景：memory Provider 通过工厂接入并共享完整目录树', async () => {
    const fileSystem = createFileSystem({
        type: 'memory',
        config: {
            writable: false,
            directories: [
                {path: 'output', writable: true},
            ],
            files: [
                {path: 'scripts/main.js', content: 'module.exports = 42;', writable: false},
                {path: 'input/data.txt', content: 'input', writable: false},
            ],
        },
    });

    assert.equal(fileSystem.supports('copy'), true);
    assert.equal(fileSystem.supports('move'), true);
    assert.equal(await fileSystem.readText('scripts/main.js'), 'module.exports = 42;');
    assert.deepEqual((await fileSystem.list('')).map((entry) => `${entry.kind}:${entry.name}`), [
        'directory:input',
        'directory:output',
        'directory:scripts',
    ]);
    await assert.rejects(fileSystem.writeText('input/data.txt', 'changed'), FilePermissionError);

    await fileSystem.writeText('output/result.txt', 'result', {
        createParents: true,
        expectedVersion: null,
    });
    assert.equal(await fileSystem.readText('output/result.txt'), 'result');
});

test('场景：memory Provider 写入提交前不改变文件且中止后无残留', async () => {
    const fileSystem = createFileSystem({type: 'memory'});
    const opened = await fileSystem.openWrite('temporary/data.bin', {
        createParents: true,
        expectedVersion: null,
    });
    const writer = opened.stream.getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));
    writer.releaseLock();

    assert.equal(await fileSystem.exists('temporary/data.bin'), false);
    await opened.abort();
    assert.equal(await fileSystem.exists('temporary/data.bin'), false);
    assert.equal(await fileSystem.exists('temporary'), false);
});

test('场景：memory Provider 支持目录复制、文件覆盖、移动和类型约束', async () => {
    const fileSystem = createFileSystem({
        type: 'memory',
        config: {
            files: [
                {path: 'source/a.txt', content: 'A'},
                {path: 'source/nested/b.txt', content: 'B'},
                {path: 'replace.txt', content: 'old'},
            ],
        },
    });

    await fileSystem.copy('source', 'copy', {recursive: true});
    assert.equal(await fileSystem.readText('copy/a.txt'), 'A');
    assert.equal(await fileSystem.readText('copy/nested/b.txt'), 'B');

    await assert.rejects(fileSystem.copyFile('source/a.txt', 'replace.txt'), FileAlreadyExistsError);
    await fileSystem.copyFile('source/a.txt', 'replace.txt', {overwrite: true});
    assert.equal(await fileSystem.readText('replace.txt'), 'A');

    await fileSystem.rename('copy/nested/b.txt', 'copy/moved.txt');
    assert.equal(await fileSystem.exists('copy/nested/b.txt'), false);
    assert.equal(await fileSystem.readText('copy/moved.txt'), 'B');
    await assert.rejects(fileSystem.unlink('copy'), FileIsDirectoryError);
    await assert.rejects(fileSystem.removeDirectory('copy'), FileDirectoryNotEmptyError);
    await fileSystem.removeDirectory('copy', {recursive: true});
    assert.equal(await fileSystem.exists('copy'), false);
});

test('场景：GithubProvider 通过通用 Provider 回退完成 cp 和 mv', async () => {
    const remote = createGithubContentsFixture({'source.txt': 'hello'});
    const fileSystem = new FileSystem({
        provider: new GithubProvider({
            token: 'token',
            repo: 'owner/repo',
            fetch: remote.fetch,
        }),
    });

    assert.equal(fileSystem.getCapabilities().copy, true);
    assert.equal(fileSystem.getCapabilities().move, true);
    assert.equal(fileSystem.getCapabilities().atomicMove, false);

    await fileSystem.copyFile('source.txt', 'copy.txt');
    assert.equal(remote.readText('copy.txt'), 'hello');
    assert.equal(remote.readText('source.txt'), 'hello');

    await fileSystem.rename('copy.txt', 'moved.txt');
    assert.equal(remote.has('copy.txt'), false);
    assert.equal(remote.readText('moved.txt'), 'hello');
});

test('场景：memory Provider 保留写入授权并生成不冲突的新版本', async () => {
    const fileSystem = createFileSystem({
        type: 'memory',
        config: {
            writable: false,
            writableFiles: ['output.txt'],
            files: [{path: 'output.txt', content: 'one', version: 'memory-1', writable: true}],
        },
    });
    const first = await fileSystem.stat('output.txt');
    await fileSystem.writeText('output.txt', 'two', {expectedVersion: first.version});
    const second = await fileSystem.stat('output.txt');
    assert.equal(second.version, 'memory-2');

    await fileSystem.unlink('output.txt', {expectedVersion: second.version});
    await fileSystem.writeText('output.txt', 'three', {expectedVersion: null});
    assert.equal(await fileSystem.readText('output.txt'), 'three');
});

test('场景：memory Provider 为 null 初始版本生成有效版本并保持创建前置条件', async () => {
    const fileSystem = createFileSystem({
        type: 'memory',
        config: {files: [{path: 'existing.txt', content: 'existing', version: null}]},
    });
    const entry = await fileSystem.stat('existing.txt');
    assert.match(entry.version, /^memory-\d+$/);
    await assert.rejects(
        fileSystem.writeText('existing.txt', 'replacement', {expectedVersion: null}),
        FileConflictError,
    );
});

test('场景：memory Provider 提交时重新校验未允许自动创建的父目录', async () => {
    const fileSystem = createFileSystem({type: 'memory', config: {directories: ['parent']}});
    const opened = await fileSystem.openWrite('parent/file.txt', {expectedVersion: null});
    await fileSystem.removeDirectory('parent');

    await assert.rejects(opened.commit());
    assert.equal(await fileSystem.exists('parent'), false);
});

test('场景：memory Provider 不会在提交时用文件覆盖并发创建的目录', async () => {
    const fileSystem = createFileSystem({type: 'memory'});
    const opened = await fileSystem.openWrite('target', {expectedVersion: null});
    await fileSystem.createDirectory('target');

    await assert.rejects(opened.commit(), FileIsDirectoryError);
    assert.equal((await fileSystem.stat('target')).kind, 'directory');
});

test('场景：copy 和同路径 move 不会绕过显式源版本前置条件', async () => {
    const fileSystem = createFileSystem({
        type: 'memory',
        config: {files: [{path: 'source.txt', content: 'source'}]},
    });

    await assert.rejects(
        fileSystem.copyFile('source.txt', 'copy.txt', {sourceExpectedVersion: null}),
        FileConflictError,
    );
    await assert.rejects(
        fileSystem.rename('source.txt', 'source.txt', {sourceExpectedVersion: null}),
        FileConflictError,
    );
});

test('场景：通用目录 move 检测复制期间新增的源文件且不会删除源树', async () => {
    class ConcurrentSourceProvider extends MemoryProvider {
        injected = false;

        async copy(sourcePath, destinationPath, options = {}) {
            const result = await FileSystemProvider.prototype.copy.call(this, sourcePath, destinationPath, options);
            if (!this.injected) {
                this.injected = true;
                await this.write('source/late.txt', new Blob(['late']), {
                    createParents: true,
                    expectedVersion: null,
                });
            }
            return result;
        }

        async move(sourcePath, destinationPath, options = {}) {
            return FileSystemProvider.prototype.move.call(this, sourcePath, destinationPath, options);
        }
    }

    const fileSystem = new FileSystem({
        provider: new ConcurrentSourceProvider({
            files: [{path: 'source/original.txt', content: 'original'}],
        }),
    });

    await assert.rejects(fileSystem.move('source', 'destination', {recursive: true}), FileConflictError);
    assert.equal(await fileSystem.readText('source/original.txt'), 'original');
    assert.equal(await fileSystem.readText('source/late.txt'), 'late');
});

test('场景：GithubProvider 明确拒绝不完整列表风险下的目录 cp 和 mv', async () => {
    const provider = new GithubProvider({
        token: 'token',
        repo: 'owner/repo',
        fetch: async () => {
            throw new Error('Directory capability rejection should not fetch content');
        },
    });
    provider.stat = async (path) => ({
        path,
        name: path.split('/').pop(),
        kind: 'directory',
        size: 0,
        mimeType: null,
        version: null,
    });
    const fileSystem = new FileSystem({provider});

    await assert.rejects(fileSystem.copy('source', 'copy', {recursive: true}), FileUnsupportedError);
    await assert.rejects(fileSystem.move('source', 'moved', {recursive: true}), FileUnsupportedError);
});

function createGithubContentsFixture(initialFiles) {
    const files = new Map();
    let nextVersion = 1;
    for (const [path, content] of Object.entries(initialFiles)) {
        files.set(path, {bytes: new TextEncoder().encode(content), sha: `sha-${nextVersion++}`});
    }

    return {
        has: (path) => files.has(path),
        readText: (path) => new TextDecoder().decode(files.get(path)?.bytes),
        fetch: async (url, options = {}) => {
            const parsed = new URL(url);
            const marker = '/contents/';
            const markerIndex = parsed.pathname.indexOf(marker);
            const path = markerIndex === -1 ? '' : decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
            const method = options.method || 'GET';
            const current = files.get(path);

            if (method === 'GET') {
                if (!current) return Response.json({message: 'Not Found'}, {status: 404});
                return Response.json({
                    type: 'file',
                    name: path.split('/').pop(),
                    path,
                    sha: current.sha,
                    size: current.bytes.byteLength,
                    encoding: 'base64',
                    content: bytesToBase64(current.bytes),
                });
            }
            const body = JSON.parse(options.body);
            if (method === 'PUT') {
                if ((current?.sha ?? null) !== (body.sha ?? null)) {
                    return Response.json({message: 'sha does not match'}, {status: 409});
                }
                const bytes = base64ToBytes(body.content);
                const value = {bytes, sha: `sha-${nextVersion++}`};
                files.set(path, value);
                return Response.json({
                    content: {
                        type: 'file',
                        name: path.split('/').pop(),
                        path,
                        sha: value.sha,
                        size: bytes.byteLength,
                    },
                });
            }
            if (method === 'DELETE') {
                if (!current) return Response.json({message: 'Not Found'}, {status: 404});
                if (current.sha !== body.sha) return Response.json({message: 'sha does not match'}, {status: 409});
                files.delete(path);
                return new Response(null, {status: 204});
            }
            throw new Error(`Unexpected GitHub fixture request: ${method} ${url}`);
        },
    };
}

function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
