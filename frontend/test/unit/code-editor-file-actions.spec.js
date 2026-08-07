import {expect, test} from '@playwright/test';

test.beforeEach(async ({page}) => {
    await page.goto('/codeEditor');
    await seedOpfs(page, {
        'alpha.txt': 'alpha',
        'archive/placeholder.txt': '',
        'docs/nested.txt': 'nested',
        'move-source.txt': 'move source',
        'moved/placeholder.txt': '',
    });
    await page.getByRole('button', {name: '打开浏览器文件夹'}).click();
    await expect(treeRow(page, 'alpha.txt')).toBeVisible();
});

test('文件树立即重命名、复制和移动文件，并更新已打开标签页', async ({page}) => {
    await treeRow(page, 'alpha.txt').click();
    await expect(page.locator('.tab[title="alpha.txt"]')).toBeVisible();

    await runTreeAction(page, 'alpha.txt', '重命名', 'beta.txt');
    await expect(treeRow(page, 'beta.txt')).toBeVisible();
    await expect(page.locator('.tab[title="alpha.txt"]')).toHaveCount(0);
    await expect(page.locator('.tab[title="beta.txt"]')).toBeVisible();

    await runTreeAction(page, 'beta.txt', '复制', '');
    await expect(treeRow(page, 'beta-copy.txt')).toBeVisible();

    await runTreeAction(page, 'beta.txt', '移动', 'moved');
    await expandDirectory(page, 'moved');
    await expect(treeRow(page, 'moved/beta.txt')).toBeVisible();
    await expect(page.locator('.tab[title="beta.txt"]')).toHaveCount(0);
    await expect(page.locator('.tab[title="moved/beta.txt"]')).toBeVisible();

    expect(await readOpfsText(page, 'alpha.txt')).toBeNull();
    expect(await readOpfsText(page, 'beta.txt')).toBeNull();
    expect(await readOpfsText(page, 'beta-copy.txt')).toBe('alpha');
    expect(await readOpfsText(page, 'moved/beta.txt')).toBe('alpha');
});

test('文件树立即递归复制、移动和重命名文件夹', async ({page}) => {
    await runTreeAction(page, 'docs', '复制', '');
    await expect(treeRow(page, 'docs-copy/nested.txt')).toBeVisible();

    await runTreeAction(page, 'docs-copy', '移动', 'archive');
    await expandDirectory(page, 'archive');
    await expect(treeRow(page, 'archive/docs-copy/nested.txt')).toBeVisible();

    await runTreeAction(page, 'archive/docs-copy', '重命名', 'renamed');
    await expect(treeRow(page, 'archive/renamed/nested.txt')).toBeVisible();

    expect(await readOpfsText(page, 'docs/nested.txt')).toBe('nested');
    expect(await readOpfsText(page, 'docs-copy/nested.txt')).toBeNull();
    expect(await readOpfsText(page, 'archive/docs-copy/nested.txt')).toBeNull();
    expect(await readOpfsText(page, 'archive/renamed/nested.txt')).toBe('nested');
});

test('移动和复制可以选择由未保存文件形成的临时文件夹', async ({page}) => {
    await createUnsavedFile(page, 'temporary-copy/pending.txt');
    await runTreeAction(page, 'alpha.txt', '复制', 'temporary-copy');
    await expect(treeRow(page, 'temporary-copy/alpha.txt')).toBeVisible();

    await createUnsavedFile(page, 'temporary-move/pending.txt');
    await runTreeAction(page, 'move-source.txt', '移动', 'temporary-move');
    await expect(treeRow(page, 'temporary-move/move-source.txt')).toBeVisible();

    expect(await readOpfsText(page, 'temporary-copy/pending.txt')).toBeNull();
    expect(await readOpfsText(page, 'temporary-copy/alpha.txt')).toBe('alpha');
    expect(await readOpfsText(page, 'move-source.txt')).toBeNull();
    expect(await readOpfsText(page, 'temporary-move/pending.txt')).toBeNull();
    expect(await readOpfsText(page, 'temporary-move/move-source.txt')).toBe('move source');
});

function treeRow(page, path) {
    return page.locator('.file-tree').getByTitle(path, {exact: true});
}

async function runTreeAction(page, sourcePath, action, value) {
    await treeRow(page, sourcePath).click({button: 'right'});
    await page.getByRole('menu', {name: '文件树菜单'}).getByRole('menuitem', {name: action, exact: true}).click();
    const dialog = page.getByRole('dialog', {name: action});
    if (action === '重命名') await dialog.getByRole('textbox').fill(value);
    else await dialog.getByRole('combobox').selectOption(value);
    await dialog.getByRole('button', {name: action, exact: true}).click();
    await expect(dialog).toBeHidden();
}

async function expandDirectory(page, path) {
    const row = treeRow(page, path);
    if (await row.getAttribute('aria-expanded') === 'false') await row.click();
}

async function createUnsavedFile(page, path) {
    await page.locator('.file-tree').dispatchEvent('contextmenu', {clientX: 240, clientY: 240});
    await page.getByRole('menu', {name: '文件树菜单'}).getByRole('menuitem', {name: '新建文件', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: '新建文件'});
    await dialog.getByRole('textbox').fill(path);
    await dialog.getByRole('checkbox').uncheck();
    await dialog.getByRole('button', {name: '新建文件', exact: true}).click();
    await expect(dialog).toBeHidden();
    await expect(treeRow(page, path)).toBeVisible();
}

async function seedOpfs(page, files) {
    await page.evaluate(async (entries) => {
        const root = await navigator.storage.getDirectory();
        for await (const [name] of root.entries()) await root.removeEntry(name, {recursive: true});
        for (const [path, content] of Object.entries(entries)) {
            const parts = path.split('/');
            const name = parts.pop();
            let directory = root;
            for (const part of parts) directory = await directory.getDirectoryHandle(part, {create: true});
            const file = await directory.getFileHandle(name, {create: true});
            const writable = await file.createWritable();
            await writable.write(content);
            await writable.close();
        }
    }, files);
}

async function readOpfsText(page, path) {
    return page.evaluate(async (value) => {
        try {
            const parts = value.split('/');
            const name = parts.pop();
            let directory = await navigator.storage.getDirectory();
            for (const part of parts) directory = await directory.getDirectoryHandle(part);
            return await (await (await directory.getFileHandle(name)).getFile()).text();
        } catch (error) {
            if (error?.name === 'NotFoundError') return null;
            throw error;
        }
    }, path);
}
