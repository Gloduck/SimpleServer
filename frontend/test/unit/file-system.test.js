import assert from 'node:assert/strict';
import test from 'node:test';
import {
    base64ToBytes,
    getFileName,
    getParentFilePath,
    joinFilePath,
    normalizeFilePath,
} from '../../src/shared/file-utils.js';
import {BrowserHandleProvider} from '../../src/shared/file-system/providers/browser-handle-provider.js';
import {GithubProvider} from '../../src/shared/file-system/providers/github-provider.js';
import {
    createFileSystem,
    FileAlreadyExistsError,
    FileChangeSet,
    FileConflictError,
    FileNotFoundError,
    FileOperationPolicy,
    FileResourceResolver,
    FileSession,
    FileSystem,
    FileSystemProvider,
    FileTooLargeError,
    writeFileTarget,
} from '../../src/shared/file-system/index.js';

test('场景：规范化根目录相对路径并拒绝越过根目录', () => {
    assert.equal(normalizeFilePath(''), '');
    assert.equal(normalizeFilePath('/docs//./guide/../readme.md'), 'docs/readme.md');
    assert.equal(normalizeFilePath('docs\\guide.txt'), 'docs/guide.txt');
    assert.equal(joinFilePath('docs', '../readme.md'), 'readme.md');
    assert.equal(getParentFilePath('docs/readme.md'), 'docs');
    assert.equal(getFileName('docs/readme.md'), 'readme.md');
    assert.throws(() => normalizeFilePath('../../secret'), {code: 'INVALID_FILE_PATH'});
});

test('场景：默认内存读取和写入限制均为 50 MiB', () => {
    const policy = new FileOperationPolicy();
    assert.equal(policy.maxMemoryReadBytes, 50 * 1024 * 1024);
    assert.equal(policy.maxMemoryWriteBytes, 50 * 1024 * 1024);
});

test('场景：UTF-8 内存读写限制生效且流式读取不受内存限制', async () => {
    const provider = new FakeProvider({
        'four.txt': {text: 'éé', version: 'v1'},
        'six.txt': {text: '你好', version: 'v2'},
    });
    const fileSystem = new FileSystem({
        provider,
        policy: new FileOperationPolicy({maxMemoryReadBytes: 4, maxMemoryWriteBytes: 4}),
    });

    assert.equal(await fileSystem.readText('four.txt'), 'éé');
    await assert.rejects(fileSystem.readText('six.txt'), FileTooLargeError);
    assert.equal((await fileSystem.openRead('six.txt')).size, 6);
    await fileSystem.writeText('write-four.txt', 'éé', {expectedVersion: null});
    await assert.rejects(fileSystem.writeText('write-six.txt', '你好', {expectedVersion: null}), FileTooLargeError);
    assert.equal(await provider.readText('write-four.txt'), 'éé');
    assert.equal(provider.files.has('write-six.txt'), false);
});

test('场景：FileSystemProvider 通过 openWrite 提供通用写入实现', async () => {
    const chunks = [];
    class StreamingProvider extends FileSystemProvider {
        getCapabilities() {
            return {...super.getCapabilities(), write: true, streamingWrite: true};
        }

        async openWrite(path, options = {}) {
            return {
                stream: new WritableStream({write: (chunk) => chunks.push(chunk)}),
                commit: async () => ({path, name: getFileName(path), kind: 'file', size: 6, mimeType: options.mimeType, version: 'v1'}),
                abort: async () => {},
            };
        }
    }

    const result = await new FileSystem({provider: new StreamingProvider()}).writeText('shared.txt', 'shared');
    assert.equal(result.version, 'v1');
    assert.equal(await new Blob(chunks).text(), 'shared');
});

test('场景：FileChangeSet 暂存文本、二进制和删除时保留稳定基线元数据', () => {
    const changes = new FileChangeSet();
    const created = changes.stageText('/new.txt', '你好', {baseVersion: null, baseSize: null});
    assert.deepEqual({status: created.status, dataType: created.dataType, size: created.size}, {
        status: 'created',
        dataType: 'text',
        size: 6,
    });

    const modified = changes.stageBlob('dir/image.png', new Blob(['123'], {type: 'image/png'}), {
        baseVersion: 'sha-1',
        baseSize: 2,
    });
    assert.equal(modified.status, 'modified');
    assert.equal(modified.mimeType, 'image/png');
    assert.equal(changes.has('dir/image.png'), true);
    assert.deepEqual(changes.listUnder('dir').map((change) => change.path), ['dir/image.png']);

    changes.stageDelete('dir/image.png');
    assert.equal(changes.get('dir/image.png').status, 'deleted');
    changes.stageDelete('new.txt');
    assert.equal(changes.has('new.txt'), false);
    assert.equal(changes.remove('dir/image.png'), true);
    changes.clear();
    assert.deepEqual(changes.list(), []);
});

test('场景：FileSession 正确合并 effective、base 和 changes 视图', async () => {
    const {session} = createSession();
    await session.stageText('alpha.txt', 'changed');
    await session.stageText('docs/new.txt', 'new');
    await session.stageDelete('delete.txt');

    assert.equal(await session.readText('alpha.txt'), 'changed');
    assert.equal(await session.readText('alpha.txt', {view: 'base'}), 'alpha');
    assert.equal(await session.readText('alpha.txt', {view: 'changes'}), 'changed');
    await assert.rejects(session.readText('delete.txt'), FileNotFoundError);
    assert.equal(await session.readText('delete.txt', {view: 'base'}), 'delete me');

    assert.deepEqual((await session.list('')).map(entrySummary), [
        'file:alpha.txt:modified',
        'directory:docs',
    ]);
    assert.deepEqual((await session.list('', {view: 'base'})).map(entrySummary), [
        'file:alpha.txt',
        'file:delete.txt',
        'directory:docs',
    ]);
    assert.deepEqual((await session.list('', {view: 'changes'})).map(entrySummary), [
        'file:alpha.txt:modified',
        'file:delete.txt:deleted',
        'directory:docs:changed',
    ]);
    assert.deepEqual((await session.list('docs')).map(entrySummary), [
        'file:base.txt',
        'file:new.txt:created',
    ]);
    assert.deepEqual((await session.walk('', {view: 'changes'})).map((entry) => entry.path), [
        'alpha.txt',
        'delete.txt',
        'docs',
        'docs/new.txt',
    ]);
});

test('场景：待删除文件保留磁盘基线并可撤销恢复', async () => {
    const {session} = createSession();

    await session.stageDelete('delete.txt');
    assert.equal(session.getChange('delete.txt').status, 'deleted');
    await assert.rejects(session.readText('delete.txt'), FileNotFoundError);
    assert.equal(await session.readText('delete.txt', {view: 'base'}), 'delete me');

    assert.equal(session.revert('delete.txt'), true);
    assert.equal(session.hasChange('delete.txt'), false);
    assert.equal(await session.readText('delete.txt'), 'delete me');
});

test('场景：未保存修改转为待删除后以磁盘内容为对比基线', async () => {
    const {session} = createSession();

    await session.stageText('alpha.txt', 'local edit');
    await session.stageDelete('alpha.txt');
    const change = session.getChange('alpha.txt');
    assert.equal(change.status, 'deleted');
    assert.equal(change.baseVersion, 'alpha-v1');
    assert.equal(await session.readText('alpha.txt', {view: 'base'}), 'alpha');
    await assert.rejects(session.readText('alpha.txt'), FileNotFoundError);

    session.revert('alpha.txt');
    assert.equal(await session.readText('alpha.txt'), 'alpha');
});

test('场景：未落盘新建文件删除后直接丢弃暂存状态', async () => {
    const {provider, session} = createSession();

    await session.stageText('new.txt', 'temporary', {createOnly: true});
    assert.equal(session.getChange('new.txt').status, 'created');
    await session.stageDelete('new.txt');

    assert.equal(session.hasChange('new.txt'), false);
    assert.equal(provider.files.has('new.txt'), false);
    await assert.rejects(session.readText('new.txt'), FileNotFoundError);
});

test('场景：提交待删除后文件和对比基线均不再存在', async () => {
    const {provider, session} = createSession();

    await session.stageDelete('delete.txt');
    await session.commit('delete.txt');

    assert.equal(provider.files.has('delete.txt'), false);
    assert.equal(session.hasChange('delete.txt'), false);
    await assert.rejects(session.readText('delete.txt'), FileNotFoundError);
    await assert.rejects(session.readText('delete.txt', {view: 'base'}), FileNotFoundError);
});

test('场景：FileSession 使用基线版本提交创建、修改和删除', async () => {
    const {provider, session} = createSession();
    await session.stageText('alpha.txt', 'changed');
    await session.stageBlob('new.bin', new Blob([new Uint8Array([1, 2, 3])], {type: 'application/octet-stream'}));
    await session.stageDelete('delete.txt');
    await session.commitAll();

    assert.deepEqual(provider.operations, [
        {operation: 'write', path: 'alpha.txt', expectedVersion: 'alpha-v1'},
        {operation: 'remove', path: 'delete.txt', expectedVersion: 'delete-v1'},
        {operation: 'write', path: 'new.bin', expectedVersion: null},
    ]);
    assert.equal(await provider.readText('alpha.txt'), 'changed');
    assert.equal(provider.files.has('delete.txt'), false);
    assert.deepEqual(new Uint8Array(await provider.files.get('new.bin').blob.arrayBuffer()), new Uint8Array([1, 2, 3]));
    assert.deepEqual(session.listChanges(), []);
});

test('场景：乐观锁提交失败后 FileSession 保留变更以便重试或回滚', async () => {
    const {provider, session} = createSession();
    await session.stageText('alpha.txt', 'changed');
    provider.files.get('alpha.txt').version = 'external-v2';

    await assert.rejects(session.commit('alpha.txt'), FileConflictError);
    assert.equal(session.hasChange('alpha.txt'), true);
    assert.equal(session.revert('alpha.txt'), true);
    assert.equal(session.hasChange('alpha.txt'), false);
});

test('场景：仅创建模式不会覆盖已存在文件', async () => {
    const {provider, session} = createSession();

    await assert.rejects(
        session.stageText('alpha.txt', '', {createOnly: true}),
        FileAlreadyExistsError,
    );
    assert.equal(await provider.readText('alpha.txt'), 'alpha');
    assert.equal(session.hasChange('alpha.txt'), false);
});

test('场景：覆盖参数为假时已保存文件会保持原内容并返回文件已存在错误', async () => {
    const {provider, session} = createSession();

    await assert.rejects(
        session.stageText('alpha.txt', '不应写入', {createOnly: true}),
        FileAlreadyExistsError,
    );

    assert.equal(await provider.readText('alpha.txt'), 'alpha');
    assert.equal(session.hasChange('alpha.txt'), false);
});

test('场景：覆盖参数为真时会替换未保存文本但磁盘基线保持不变', async () => {
    const {session} = createSession();

    await session.stageText('alpha.txt', '用户未保存内容');
    await session.stageText('alpha.txt', 'AI 输出内容');

    assert.equal(await session.readText('alpha.txt', {view: 'effective'}), 'AI 输出内容');
    assert.equal(await session.readText('alpha.txt', {view: 'base'}), 'alpha');
    assert.equal(session.getChange('alpha.txt').status, 'modified');
});

test('场景：覆盖参数为真时会取消待删除状态并写入新的文本或二进制内容', async () => {
    const {session} = createSession();

    await session.stageDelete('alpha.txt');
    await session.stageText('alpha.txt', '恢复后的内容');
    assert.equal(await session.readText('alpha.txt'), '恢复后的内容');
    assert.equal(session.getChange('alpha.txt').status, 'modified');

    await session.stageDelete('delete.txt');
    await session.stageBlob('delete.txt', new Blob([new Uint8Array([1, 2, 3])], {type: 'application/octet-stream'}));
    assert.deepEqual(
        new Uint8Array(await (await session.readBlob('delete.txt')).arrayBuffer()),
        new Uint8Array([1, 2, 3]),
    );
    assert.equal(session.getChange('delete.txt').status, 'modified');
});

test('场景：刷新冲突基线时保留已暂存内容', async () => {
    const {provider, session} = createSession();
    await session.stageText('alpha.txt', 'local edit');
    provider.files.get('alpha.txt').version = 'external-v2';

    await assert.rejects(session.commit('alpha.txt'), FileConflictError);
    await session.refreshChangeBase('alpha.txt');
    assert.equal(session.listChanges()[0].baseVersion, 'external-v2');
    assert.equal(await session.readText('alpha.txt'), 'local edit');

    await session.commit('alpha.txt');
    assert.equal(await provider.readText('alpha.txt'), 'local edit');
});

test('场景：提交进行期间的新编辑会被保留并重新基于最新版本', async () => {
    const {provider, session} = createSession();
    await session.stageText('alpha.txt', 'first edit');
    const originalWrite = provider.write.bind(provider);
    let releaseWrite;
    let notifyStarted;
    const writeStarted = new Promise((resolve) => { notifyStarted = resolve; });
    const continueWrite = new Promise((resolve) => { releaseWrite = resolve; });
    provider.write = async (...args) => {
        notifyStarted();
        await continueWrite;
        return originalWrite(...args);
    };

    const commit = session.commit('alpha.txt');
    await writeStarted;
    const duplicateCommit = session.commit('alpha.txt');
    await session.stageText('alpha.txt', 'second edit');
    const secondCommit = session.commit('alpha.txt');
    releaseWrite();
    const committed = await commit;
    await duplicateCommit;
    await secondCommit;

    assert.equal(await provider.readText('alpha.txt'), 'second edit');
    assert.equal(session.hasChange('alpha.txt'), false);
    assert.ok(committed.version);
    assert.equal(provider.operations.filter((operation) => operation.operation === 'write').length, 2);
});

test('场景：FileConflictError 暴露稳定错误码', () => {
    assert.equal(FileConflictError.code, 'FILE_CONFLICT');
    assert.equal(new FileConflictError('alpha.txt').code, FileConflictError.code);
});

test('场景：FileSession 按读取文件时观察到的版本提交', async () => {
    const {provider, session} = createSession();
    assert.equal(await session.readText('alpha.txt'), 'alpha');
    provider.files.get('alpha.txt').version = 'external-v2';
    await session.stageText('alpha.txt', 'changed from original');

    await assert.rejects(session.commit('alpha.txt'), FileConflictError);
    assert.equal(session.listChanges()[0].baseVersion, 'alpha-v1');
});

test('场景：FileSession 按列出文件时观察到的版本删除', async () => {
    const {provider, session} = createSession();
    await session.list('');
    provider.files.get('delete.txt').version = 'external-delete-v2';
    await session.stageDelete('delete.txt');

    await assert.rejects(session.commit('delete.txt'), FileConflictError);
    assert.equal(session.listChanges()[0].baseVersion, 'delete-v1');
});

test('场景：外部写入后 FileSession 可以遗忘已观察的基线', async () => {
    const {provider, session} = createSession();
    assert.equal(await session.readText('alpha.txt'), 'alpha');
    provider.files.get('alpha.txt').version = 'external-v2';
    session.forgetBase('alpha.txt');
    await session.stageText('alpha.txt', 'changed after refresh');

    assert.equal(session.listChanges()[0].baseVersion, 'external-v2');
});

test('场景：刷新文件树不会替换通过文件内容观察到的版本', async () => {
    const {provider, session} = createSession();
    assert.equal(await session.readText('alpha.txt'), 'alpha');
    provider.files.get('alpha.txt').version = 'external-v2';

    await session.list('');
    await session.stageText('alpha.txt', 'local edit');
    assert.equal(session.getChange('alpha.txt').baseVersion, 'alpha-v1');
});

test('场景：后台读取不会替换编辑器已采用的基线', async () => {
    const {provider, session} = createSession();
    assert.equal(await session.readText('alpha.txt', {adoptBase: true}), 'alpha');
    provider.files.set('alpha.txt', {
        blob: new Blob(['external'], {type: 'text/plain'}),
        version: 'external-v2',
    });

    assert.equal(await session.readText('alpha.txt'), 'external');
    await session.stageText('alpha.txt', 'local edit');
    assert.equal(session.getChange('alpha.txt').baseVersion, 'alpha-v1');
});

test('场景：changes 资源视图不会回退读取 base 资源', async () => {
    const {provider, session} = createSession();
    provider.getResourceUrl = async () => ({url: 'https://example.test/base'});

    assert.equal(await session.getResourceUrl('alpha.txt', {view: 'changes'}), null);
    assert.equal((await session.getResourceUrl('alpha.txt', {view: 'base'})).url, 'https://example.test/base');
});

test('场景：writeFileTarget 通过可写文件目标执行流式写入', async () => {
    const chunks = [];
    const handle = {
        kind: 'file',
        name: 'copy.txt',
        async createWritable() {
            return new WritableStream({
                write(chunk) {
                    chunks.push(chunk);
                },
            });
        },
    };

    await writeFileTarget(handle, new Blob(['streamed']));
    assert.equal(await new Blob(chunks).text(), 'streamed');
});

test('场景：FileSystem 通过 Provider 边界判断目录关系', async () => {
    const destinationRoot = {kind: 'directory', name: 'destination'};
    const sourceRoot = {
        kind: 'directory',
        name: 'source',
        async resolve(handle) {
            return handle === destinationRoot ? [] : null;
        },
    };
    const sourceFileSystem = new FileSystem({provider: new BrowserHandleProvider({root: sourceRoot})});
    const destinationFileSystem = new FileSystem({provider: new BrowserHandleProvider({root: destinationRoot})});

    assert.equal(await sourceFileSystem.isCopyDestinationInside('', destinationFileSystem, ''), true);
});

test('场景：BrowserHandleProvider 拒绝将虚拟目录复制到其名义源路径', async () => {
    const root = {
        kind: 'directory',
        name: 'root',
        async resolve(handle) {
            return handle === root ? [] : null;
        },
    };
    const sourceFileSystem = new FileSystem({provider: new BrowserHandleProvider({root})});
    const destinationFileSystem = new FileSystem({provider: new BrowserHandleProvider({root})});

    assert.equal(await sourceFileSystem.isCopyDestinationInside('virtual', destinationFileSystem, 'virtual'), true);
});

test('场景：FileSystem 通过 Provider 边界判断文件目标是否相同', async () => {
    const sourceFile = {kind: 'file', name: 'copy.txt'};
    const root = {
        kind: 'directory',
        name: 'source',
        async getFileHandle(name) {
            assert.equal(name, sourceFile.name);
            return sourceFile;
        },
    };
    const target = {
        kind: 'file',
        name: sourceFile.name,
        async isSameEntry(handle) {
            return handle === sourceFile;
        },
    };
    const fileSystem = new FileSystem({provider: new BrowserHandleProvider({root})});

    assert.equal(await fileSystem.isSameFileTarget(sourceFile.name, target), true);
});

test('场景：createFileSystem 通过注册的来源类型隐藏 Provider 构造过程', () => {
    const handle = {kind: 'directory', name: 'root'};
    const fileSystem = createFileSystem({type: 'local', config: {directoryHandle: handle}});

    assert.equal(fileSystem.getCapabilities().streamingWrite, true);
    assert.equal(fileSystem.getCapabilities().createDirectory, true);
});

test('场景：GithubProvider 使用调用方 SHA 写入 UTF-8 字节且不会预读取', async () => {
    const requests = [];
    const provider = new GithubProvider({
        token: 'token',
        repo: 'owner/repo',
        branch: 'feature/test',
        rootPath: 'workspace',
        fetch: async (url, options) => {
            requests.push({url, options});
            return Response.json({content: {name: 'hello.txt', path: 'workspace/hello.txt', sha: 'new-sha', size: 6}});
        },
    });
    const fileSystem = new FileSystem({provider});

    await fileSystem.writeText('hello.txt', '你好', {expectedVersion: 'old-sha'});
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, 'PUT');
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.sha, 'old-sha');
    assert.equal(new TextDecoder().decode(base64ToBytes(body.content)), '你好');

    requests.length = 0;
    await fileSystem.writeText('created.txt', 'new', {expectedVersion: null});
    assert.equal(requests.length, 1);
    assert.equal('sha' in JSON.parse(requests[0].options.body), false);
});

test('场景：GithubProvider 将预期更新目标缺失视为冲突', async () => {
    const provider = new GithubProvider({
        token: 'token',
        repo: 'owner/repo',
        fetch: async () => Response.json({message: 'Not Found'}, {status: 404}),
    });

    await assert.rejects(
        new FileSystem({provider}).writeText('missing.txt', 'local', {expectedVersion: 'old-sha'}),
        FileConflictError,
    );
});

test('场景：GithubProvider 以有效全局接收者调用浏览器 fetch', async () => {
    let calls = 0;
    const provider = new GithubProvider({
        token: 'token',
        repo: 'owner/repo',
        fetch: function () {
            assert.equal(this, globalThis);
            calls += 1;
            return calls === 1
                ? Response.json({full_name: 'owner/repo'})
                : calls === 2
                    ? Response.json({name: 'main'})
                    : Response.json([]);
        },
    });

    await provider.checkAccess();
    assert.equal(calls, 3);
});

test('场景：GithubProvider 通过鉴权文件读取保护资源访问', async () => {
    const provider = new GithubProvider({
        token: 'token',
        repo: 'owner/repo',
        branch: 'feature/test',
        rootPath: 'workspace',
        proxy: 'https://proxy.example/',
        fetch: async () => Response.json([]),
    });
    assert.equal(await new FileSystem({provider}).getResourceUrl('docs/my image.png'), null);
});

test('场景：需要鉴权时 GithubProvider 绕过第三方下载代理', async () => {
    const requests = [];
    const provider = new GithubProvider({
        token: 'secret-token',
        repo: 'owner/repo',
        proxy: 'https://proxy.example',
        fetch: async (url, options) => {
            requests.push({url, options});
            if (requests.length === 1) {
                return Response.json({
                    type: 'file',
                    name: 'large.bin',
                    path: 'large.bin',
                    sha: 'large-v1',
                    size: 6,
                    download_url: 'https://raw.example/large.bin',
                });
            }
            return {
                ok: true,
                status: 200,
                headers: new Headers({'content-length': '6'}),
                body: new Blob(['stream']).stream(),
            };
        },
    });

    await new FileSystem({provider}).openRead('large.bin');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer secret-token');
    assert.equal(requests[1].url, 'https://raw.example/large.bin');
    assert.equal(new Headers(requests[1].options.headers).get('authorization'), 'Bearer secret-token');
});

test('场景：GithubProvider 对 download_url 保持流式读取', async () => {
    let requests = 0;
    const provider = new GithubProvider({
        token: 'token',
        repo: 'owner/repo',
        fetch: async () => {
            requests += 1;
            if (requests === 1) {
                return Response.json({
                    type: 'file',
                    name: 'large.bin',
                    path: 'large.bin',
                    sha: 'large-v1',
                    size: 6,
                    download_url: 'https://raw.example/large.bin',
                });
            }
            return {
                ok: true,
                status: 200,
                headers: new Headers({'content-length': '6'}),
                body: new Blob(['stream']).stream(),
            };
        },
    });

    const opened = await new FileSystem({provider}).openRead('large.bin');
    assert.equal(opened.kind, 'file');
    assert.equal(opened.size, 6);
    assert.equal(await new Response(opened.stream).text(), 'stream');
});

test('场景：GithubProvider 保留 FileSession.openRead 观察到的 SHA', async () => {
    let sha = 'github-v1';
    const provider = new GithubProvider({
        token: 'token',
        repo: 'owner/repo',
        fetch: async () => Response.json({
            type: 'file',
            name: 'readme.md',
            path: 'readme.md',
            sha,
            size: 4,
            encoding: 'base64',
            content: btoa('base'),
        }),
    });
    const session = new FileSession({fileSystem: new FileSystem({provider})});

    assert.equal(await session.readText('readme.md'), 'base');
    sha = 'github-v2';
    await session.stageText('readme.md', 'local');
    assert.equal(session.getChange('readme.md').baseVersion, 'github-v1');
});

test('场景：FileResourceResolver 对对象 URL 引用计数并报告不支持环境', async () => {
    const createDescriptor = Object.getOwnPropertyDescriptor(globalThis.URL, 'createObjectURL');
    const revokeDescriptor = Object.getOwnPropertyDescriptor(globalThis.URL, 'revokeObjectURL');
    const revoked = [];
    let reads = 0;
    let created = 0;
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
        configurable: true,
        value: () => `blob:test-resource-${++created}`,
    });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
        configurable: true,
        value: (url) => revoked.push(url),
    });

    try {
        const resolver = new FileResourceResolver();
        const source = {
            getResourceUrl: async () => null,
            readBlob: async () => {
                reads += 1;
                await Promise.resolve();
                return new Blob(['data'], {type: 'text/plain'});
            },
        };
        const [first, second] = await Promise.all([
            resolver.acquire('asset.txt', {source}),
            resolver.acquire('asset.txt', {source}),
        ]);
        assert.equal(first.url, 'blob:test-resource-1');
        assert.equal(first.url, second.url);
        assert.equal(reads, 1);
        assert.equal(resolver.invalidate('asset.txt', {source}), true);
        const refreshed = await resolver.acquire('asset.txt', {source});
        assert.equal(refreshed.url, 'blob:test-resource-2');
        assert.equal(reads, 2);
        first.release();
        assert.deepEqual(revoked, []);
        second.release();
        assert.deepEqual(revoked, ['blob:test-resource-1']);
        refreshed.release();
        assert.deepEqual(revoked, ['blob:test-resource-1', 'blob:test-resource-2']);

        Object.defineProperty(globalThis.URL, 'createObjectURL', {configurable: true, value: undefined});
        await assert.rejects(resolver.acquire('asset.txt', {source}), {code: 'FILE_UNSUPPORTED'});
    } finally {
        if (createDescriptor) Object.defineProperty(globalThis.URL, 'createObjectURL', createDescriptor);
        else delete globalThis.URL.createObjectURL;
        if (revokeDescriptor) Object.defineProperty(globalThis.URL, 'revokeObjectURL', revokeDescriptor);
        else delete globalThis.URL.revokeObjectURL;
    }
});

function createSession() {
    const provider = new FakeProvider({
        'alpha.txt': {text: 'alpha', version: 'alpha-v1'},
        'delete.txt': {text: 'delete me', version: 'delete-v1'},
        'docs/base.txt': {text: 'base', version: 'base-v1'},
    });
    return {
        provider,
        session: new FileSession({fileSystem: new FileSystem({provider})}),
    };
}

function entrySummary(entry) {
    return [entry.kind, entry.name, entry.status].filter(Boolean).join(':');
}

class FakeProvider extends FileSystemProvider {
    constructor(initialFiles = {}) {
        super();
        this.files = new Map();
        this.directories = new Set(['']);
        this.operations = [];
        this.nextVersion = 1;
        for (const [path, value] of Object.entries(initialFiles)) {
            const normalizedPath = normalizeFilePath(path);
            const blob = value.blob || new Blob([value.text || ''], {type: value.mimeType || 'text/plain'});
            this.files.set(normalizedPath, {blob, version: value.version || `v${this.nextVersion++}`});
            this.#addParentDirectories(normalizedPath);
        }
    }

    getCapabilities() {
        return {read: true, write: true, directories: true, optimisticLocking: true};
    }

    async checkAccess() {
        return true;
    }

    async stat(path) {
        const normalizedPath = normalizeFilePath(path);
        if (this.directories.has(normalizedPath)) {
            return {path: normalizedPath, name: getFileName(normalizedPath), kind: 'directory', size: 0, version: null};
        }
        const file = this.files.get(normalizedPath);
        if (!file) throw new FileNotFoundError(normalizedPath);
        return {
            path: normalizedPath,
            name: getFileName(normalizedPath),
            kind: 'file',
            size: file.blob.size,
            mimeType: file.blob.type,
            version: file.version,
        };
    }

    async list(path, {limit = Infinity} = {}) {
        const normalizedPath = normalizeFilePath(path);
        if (!this.directories.has(normalizedPath)) throw new FileNotFoundError(normalizedPath);
        const entries = new Map();
        for (const directory of this.directories) {
            this.#addImmediateEntry(entries, normalizedPath, directory, 'directory');
        }
        for (const filePath of this.files.keys()) {
            this.#addImmediateEntry(entries, normalizedPath, filePath, 'file');
        }
        const results = [];
        for (const entry of [...entries.values()].sort((left, right) => left.name.localeCompare(right.name))) {
            results.push(entry.kind === 'file' ? await this.stat(entry.path) : entry);
            if (results.length >= limit) break;
        }
        return results;
    }

    async openRead(path) {
        const normalizedPath = normalizeFilePath(path);
        const entry = await this.stat(normalizedPath);
        const blob = this.files.get(normalizedPath).blob;
        return {...entry, blob, stream: blob.stream()};
    }

    async write(path, blob, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        this.#assertExpectedVersion(normalizedPath, options.expectedVersion);
        this.operations.push({operation: 'write', path: normalizedPath, expectedVersion: options.expectedVersion});
        this.#addParentDirectories(normalizedPath);
        this.files.set(normalizedPath, {blob, version: `written-v${this.nextVersion++}`});
        return this.stat(normalizedPath);
    }

    async remove(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        this.#assertExpectedVersion(normalizedPath, options.expectedVersion);
        if (!this.files.has(normalizedPath)) throw new FileNotFoundError(normalizedPath);
        this.operations.push({operation: 'remove', path: normalizedPath, expectedVersion: options.expectedVersion});
        this.files.delete(normalizedPath);
        return true;
    }

    async createDirectory(path) {
        const normalizedPath = normalizeFilePath(path);
        this.directories.add(normalizedPath);
        this.#addParentDirectories(`${normalizedPath}/placeholder`);
        return this.stat(normalizedPath);
    }

    async readText(path) {
        return this.files.get(normalizeFilePath(path)).blob.text();
    }

    #assertExpectedVersion(path, expectedVersion) {
        if (expectedVersion === undefined) return;
        const actualVersion = this.files.get(path)?.version ?? null;
        if (actualVersion !== expectedVersion) {
            throw new FileConflictError(path, {expectedVersion, actualVersion});
        }
    }

    #addParentDirectories(path) {
        let parent = getParentFilePath(path);
        while (true) {
            this.directories.add(parent);
            if (parent === '') break;
            parent = getParentFilePath(parent);
        }
    }

    #addImmediateEntry(entries, directory, candidate, kind) {
        const prefix = directory ? `${directory}/` : '';
        if (!candidate.startsWith(prefix) || candidate === directory) return;
        const relativePath = candidate.slice(prefix.length);
        const name = relativePath.split('/')[0];
        if (!name) return;
        const path = joinFilePath(directory, name);
        entries.set(name, {
            path,
            name,
            kind: relativePath.includes('/') ? 'directory' : kind,
            size: 0,
            mimeType: null,
            version: null,
        });
    }
}
