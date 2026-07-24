import assert from 'node:assert/strict';
import test from 'node:test';
import {NetworkLimit} from '../../src/shared/network-limit.js';

test('场景：fetch 响应被完整缓冲并保留状态、响应头和最终地址', async () => {
    const calls = [];
    const network = new NetworkLimit({
        fetch: async (...args) => {
            calls.push(args);
            return new Response('ok', {status: 201, statusText: 'Created', headers: {'x-test': 'value'}});
        },
    }, {
        baseUrl: 'https://page.test/workspace/',
        maxRequestCount: 1,
        maxResponseBytes: 10,
        maxResponseTotalBytes: 10,
        defaultTimeoutMs: 100,
        maxTimeoutMs: 100,
    });

    const response = await network.fetch('../result', {timeoutMs: 80, credentials: 'include'});

    assert.equal(await response.text(), 'ok');
    assert.equal(response.status, 201);
    assert.equal(response.statusText, 'Created');
    assert.equal(response.headers.get('x-test'), 'value');
    assert.equal(response.url, 'https://page.test/result');
    assert.equal(calls[0][0], 'https://page.test/result');
    assert.equal(calls[0][1].credentials, 'omit');
    assert.equal('timeoutMs' in calls[0][1], false);
    assert.deepEqual(network.getUsage(), {requestCount: 1, responseBytes: 2});
    assert.equal(network.hasPendingOperations(), false);
});

test('场景：fetch、XMLHttpRequest 和 Node 网络入口共用同一请求次数预算', async () => {
    const network = new NetworkLimit({
        fetch: async () => new Response('ok'),
        XMLHttpRequest: FakeXMLHttpRequest,
    }, {
        baseUrl: 'https://page.test/',
        maxRequestCount: 1,
        maxResponseBytes: 10,
        maxResponseTotalBytes: 10,
    });

    await network.fetch('https://example.test/first');
    const request = new network.XMLHttpRequest();
    request.open('GET', 'https://example.test/second');

    assert.throws(() => request.send(), {code: 'REQUEST_LIMIT_EXCEEDED'});
    assert.deepEqual(network.getUsage(), {requestCount: 2, responseBytes: 2});
    assert.throws(() => network.assertHealthy(), {code: 'REQUEST_LIMIT_EXCEEDED'});
});

test('场景：单响应和累计响应超过限制时丢弃部分下载并记录稳定错误', async () => {
    const single = new NetworkLimit({fetch: async () => new Response('12345')}, {
        maxResponseBytes: 4,
        maxResponseTotalBytes: 10,
    });
    await assert.rejects(single.fetch('https://example.test/single'), {
        code: 'FILE_TOO_LARGE',
        phase: 'download',
        size: 5,
        maxSize: 4,
        partialFileDiscarded: true,
    });

    const cumulative = new NetworkLimit({fetch: async () => new Response('123')}, {
        maxResponseBytes: 4,
        maxResponseTotalBytes: 5,
    });
    await cumulative.fetch('https://example.test/one');
    await assert.rejects(cumulative.fetch('https://example.test/two'), {
        code: 'FILE_TOO_LARGE',
        phase: 'download-total',
        size: 6,
        maxSize: 5,
    });
});

test('场景：fetch 超时会中止底层请求并返回结构化超时错误', async () => {
    let aborted = false;
    const network = new NetworkLimit({
        fetch: async (input, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => {
                aborted = true;
                reject(options.signal.reason);
            }, {once: true});
        }),
    }, {
        defaultTimeoutMs: 5,
        maxTimeoutMs: 5,
    });

    await assert.rejects(network.fetch('https://example.test/slow'), {
        code: 'REQUEST_TIMEOUT',
        phase: 'download',
    });
    assert.equal(aborted, true);
    assert.equal(network.hasPendingOperations(), false);
});

test('场景：XMLHttpRequest 拒绝同步或非 HTTP 请求并在响应过大时中止', async () => {
    const network = new NetworkLimit({
        fetch: async () => new Response('ok'),
        XMLHttpRequest: FakeXMLHttpRequest,
    }, {
        baseUrl: 'https://page.test/',
        maxResponseBytes: 4,
        maxResponseTotalBytes: 4,
    });

    const synchronous = new network.XMLHttpRequest();
    assert.throws(() => synchronous.open('GET', 'https://example.test/value', false), {name: 'NotSupportedError'});
    const invalid = new network.XMLHttpRequest();
    assert.throws(() => invalid.open('GET', 'data:text/plain,value'), {code: 'INVALID_REQUEST_URL'});

    const request = new network.XMLHttpRequest();
    request.open('GET', 'https://example.test/large');
    await new Promise((resolve) => {
        request.addEventListener('loadend', resolve, {once: true});
        request.send();
    });

    assert.equal(request.aborted, true);
    assert.equal(request.limitError?.code, 'FILE_TOO_LARGE');
    assert.equal(request.limitError?.phase, 'download');
    assert.throws(() => network.assertHealthy(), {code: 'FILE_TOO_LARGE'});
    assert.equal(network.hasPendingOperations(), false);
});

class FakeXMLHttpRequest extends EventTarget {
    static HEADERS_RECEIVED = 2;
    static DONE = 4;

    HEADERS_RECEIVED = 2;
    DONE = 4;
    readyState = 0;
    response = '';
    responseText = '';
    responseType = '';
    timeout = 0;
    aborted = false;

    open(method, url) {
        this.method = method;
        this.url = url;
        this.readyState = 1;
    }

    getResponseHeader(name) {
        return String(name).toLowerCase() === 'content-length' ? '5' : null;
    }

    send() {
        queueMicrotask(() => {
            if (this.aborted) return;
            this.readyState = this.HEADERS_RECEIVED;
            this.dispatchEvent(new Event('readystatechange'));
            if (this.aborted) return;
            this.response = '12345';
            this.responseText = '12345';
            const progress = new Event('progress');
            Object.defineProperty(progress, 'loaded', {value: 5});
            this.dispatchEvent(progress);
            if (this.aborted) return;
            this.readyState = this.DONE;
            this.dispatchEvent(new Event('load'));
            this.dispatchEvent(new Event('loadend'));
        });
    }

    abort() {
        if (this.aborted) return;
        this.aborted = true;
        this.dispatchEvent(new Event('abort'));
        this.dispatchEvent(new Event('loadend'));
    }
}
