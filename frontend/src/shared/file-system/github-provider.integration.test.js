import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {GithubProvider} from './providers/github-provider.js';
import {
    FileConflictError,
    FileSession,
    FileSystem,
} from './index.js';

const enabled = process.env.SIMPLE_SERVER_GITHUB_INTEGRATION === '1';

test('GithubProvider integrates with the GitHub Contents API', {
    skip: enabled ? false : 'live GitHub integration is disabled',
    timeout: 120_000,
}, async () => {
    const required = [
        'SIMPLE_SERVER_GITHUB_TOKEN',
        'SIMPLE_SERVER_GITHUB_REPO',
        'SIMPLE_SERVER_GITHUB_BRANCH',
    ];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}`);

    const runId = `${Date.now()}-${process.pid}-${randomUUID()}`;
    const directory = `run-${runId}`;
    const filePath = `${directory}/fixture.txt`;
    const fileSystem = new FileSystem({
        provider: new GithubProvider({
            token: process.env.SIMPLE_SERVER_GITHUB_TOKEN,
            repo: process.env.SIMPLE_SERVER_GITHUB_REPO,
            branch: process.env.SIMPLE_SERVER_GITHUB_BRANCH,
            rootPath: process.env.SIMPLE_SERVER_GITHUB_ROOT || '.simple-server-integration',
        }),
    });

    try {
        const initialText = `created:${runId}\n`;
        const created = await fileSystem.writeText(filePath, initialText, {
            expectedVersion: null,
            message: `SimpleServer integration create ${runId}`,
        });
        assert.ok(created.version);
        assert.equal(await fileSystem.readText(filePath), initialText);

        const entries = await fileSystem.list(directory);
        const listed = entries.find((entry) => entry.path === filePath);
        assert.equal(listed?.kind, 'file');
        assert.equal(listed?.version, created.version);

        const updatedText = `updated:${runId}\n`;
        const updated = await fileSystem.writeText(filePath, updatedText, {
            expectedVersion: created.version,
            message: `SimpleServer integration update ${runId}`,
        });
        assert.notEqual(updated.version, created.version);
        assert.equal(await fileSystem.readText(filePath), updatedText);

        const session = new FileSession({fileSystem});
        await session.readText(filePath);
        await session.stageText(filePath, `local:${runId}\n`);
        const external = await fileSystem.writeText(filePath, `external:${runId}\n`, {
            expectedVersion: updated.version,
            message: `SimpleServer integration external update ${runId}`,
        });

        await assert.rejects(
            session.commit(filePath, {message: `SimpleServer integration stale update ${runId}`}),
            FileConflictError,
        );
        assert.equal(session.hasChange(filePath), true);
        await session.refreshChangeBase(filePath);
        assert.equal(session.getChange(filePath).baseVersion, external.version);

        const retried = await session.commit(filePath, {
            message: `SimpleServer integration retry ${runId}`,
        });
        assert.equal(await fileSystem.readText(filePath), `local:${runId}\n`);

        await fileSystem.remove(filePath, {
            expectedVersion: retried.version,
            message: `SimpleServer integration delete ${runId}`,
        });
        await assert.rejects(fileSystem.stat(filePath), {code: 'FILE_NOT_FOUND'});
    } finally {
        await removeIfPresent(fileSystem, filePath);
    }
});

async function removeIfPresent(fileSystem, path) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        let entry;
        try {
            entry = await fileSystem.stat(path);
        } catch (error) {
            if (error?.code === 'FILE_NOT_FOUND') return;
            throw error;
        }

        try {
            await fileSystem.remove(path, {
                expectedVersion: entry.version,
                message: `SimpleServer integration cleanup ${path}`,
            });
            return;
        } catch (error) {
            if (error?.code !== FileConflictError.code || attempt === 2) throw error;
        }
    }
}
