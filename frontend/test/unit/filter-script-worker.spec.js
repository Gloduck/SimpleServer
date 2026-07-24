import {expect, test} from '@playwright/test';
import {openRuntimeHarness} from '../test-helpers.js';

test.beforeEach(async ({page}) => openRuntimeHarness(page));

test('filter Worker 执行异步函数体、格式化对象并裁剪结果', async ({page}) => {
    const result = await page.evaluate(() => globalThis.runtimeHarness.runFilterScript(
        'const value = JSON.parse(input); await Promise.resolve(); return value.items.filter((item) => item.keep);',
        JSON.stringify({items: [{id: 1, keep: true}, {id: 2, keep: false}]}),
        {maxChars: 24, timeoutMs: 1000},
    ));

    expect(result.text_chars).toBeGreaterThan(24);
    expect(result.returned_chars).toBe(24);
    expect(result.truncated).toBe(true);
    expect(result.text).toHaveLength(24);
    expect(result.text).toContain('"id": 1');
});

test('filter Worker 返回结构化脚本错误', async ({page}) => {
    const error = await page.evaluate(async () => {
        try {
            await globalThis.runtimeHarness.runFilterScript('throw new TypeError("invalid filter");', 'value');
            return null;
        } catch (caught) {
            return {name: caught.name, code: caught.code, message: caught.message};
        }
    });

    expect(error).toEqual({name: 'TypeError', code: 'FILTER_SCRIPT_ERROR', message: 'invalid filter'});
});

test('filter Worker 超时后会被终止', async ({page}) => {
    const code = await page.evaluate(async () => {
        try {
            await globalThis.runtimeHarness.runFilterScript('await new Promise(() => {});', 'value', {timeoutMs: 25});
            return null;
        } catch (caught) {
            return caught.code;
        }
    });

    expect(code).toBe('FILTER_SCRIPT_TIMEOUT');
});
