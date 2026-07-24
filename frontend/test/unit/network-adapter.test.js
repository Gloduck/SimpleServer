import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import test from 'node:test';
import {ProxyRequest, buildProxyRequestUrl} from '../../src/shared/script-runtime/network-adapter.js';
import {getTestArgument, loadTestArguments} from '../test-helpers.js';

const testArguments = loadTestArguments();

test('场景：代理地址保留目标路径和查询参数并附加控制参数', () => {
    const result = new URL(buildProxyRequestUrl(
        'https://proxy.test/base/',
        'https://target.test/files/a%20b?tag=one&tag=two#section',
    ));

    assert.equal(result.origin, 'https://proxy.test');
    assert.equal(result.pathname, '/base/api/requestProxy/files/a%20b');
    assert.deepEqual(result.searchParams.getAll('tag'), ['one', 'two']);
    assert.equal(result.searchParams.get('X-Proxy-Host'), 'https://target.test');
    assert.equal(result.searchParams.get('X-Proxy-Cors'), 'true');
    assert.equal(result.searchParams.get('X-Proxy-Follow-Redirect'), 'true');
});

test('场景：fetch 在服务器地址为空时原样调用原生实现', async () => {
    const input = {url: 'unchanged'};
    const init = {method: 'POST'};
    const expected = {ok: true};
    let received;
    const adapter = new ProxyRequest('', {
        fetch: async (...args) => {
            received = args;
            return expected;
        },
    });

    const result = await adapter.fetch(input, init);

    assert.equal(result, expected);
    assert.equal(received[0], input);
    assert.equal(received[1], init);
});

test('场景：fetch 动态切换代理地址并过滤代理内部请求头', async () => {
    let serverUrl = 'https://proxy-one.test/root';
    const calls = [];
    const adapter = new ProxyRequest(() => serverUrl, {
        baseUrl: 'https://page.test/workspace/',
        fetch: async (...args) => {
            calls.push(args);
            return new Response('ok');
        },
    });

    await adapter.fetch('/api/items?q=1', {
        headers: {'X-Test': 'value', 'X-Proxy-Host': 'invalid.test'},
        redirect: 'manual',
    });
    serverUrl = 'https://proxy-two.test';
    await adapter.fetch('https://target.test/next');

    const firstUrl = new URL(calls[0][0]);
    assert.equal(firstUrl.origin, 'https://proxy-one.test');
    assert.equal(firstUrl.pathname, '/root/api/requestProxy/api/items');
    assert.equal(firstUrl.searchParams.get('X-Proxy-Host'), 'https://page.test');
    assert.equal(firstUrl.searchParams.get('X-Proxy-Follow-Redirect'), 'false');
    assert.equal(calls[0][1].headers.get('x-test'), 'value');
    assert.equal(calls[0][1].headers.has('x-proxy-host'), false);
    assert.equal(calls[0][1].redirect, 'manual');

    const secondUrl = new URL(calls[1][0]);
    assert.equal(secondUrl.origin, 'https://proxy-two.test');
    assert.equal(secondUrl.searchParams.get('X-Proxy-Host'), 'https://target.test');
    assert.equal(calls[1][1].redirect, 'error');
});

test('场景：fetch 接收 Request 时复用原生请求属性并只替换 URL', async () => {
    let received;
    const adapter = new ProxyRequest('https://proxy.test', {
        fetch: async (...args) => {
            received = args;
            return new Response('ok');
        },
    });
    const request = new Request('https://target.test/upload', {
        method: 'POST',
        headers: {'Content-Type': 'text/plain', 'X-Proxy-Cors': 'invalid'},
        body: 'payload',
    });

    await adapter.fetch(request);

    assert.ok(received[0] instanceof Request);
    assert.equal(received[0].method, 'POST');
    assert.equal(new URL(received[0].url).searchParams.get('X-Proxy-Host'), 'https://target.test');
    assert.equal(received[1].headers.get('content-type'), 'text/plain');
    assert.equal(received[1].headers.has('x-proxy-cors'), false);
});

test('场景：XMLHttpRequest 只改写 open 地址并继续使用原生实现', () => {
    class NativeXMLHttpRequest {
        static DONE = 4;

        headers = [];

        open(...args) {
            this.openArgs = args;
            return 'opened';
        }

        setRequestHeader(...args) {
            this.headers.push(args);
        }
    }

    let serverUrl = 'https://proxy.test';
    const adapter = new ProxyRequest(() => serverUrl, {
        baseUrl: 'https://page.test/',
        XMLHttpRequest: NativeXMLHttpRequest,
    });
    const xhr = new adapter.XMLHttpRequest();

    assert.equal(adapter.XMLHttpRequest.DONE, NativeXMLHttpRequest.DONE);
    assert.equal(xhr.open('GET', '/resource', true), 'opened');
    const proxyUrl = new URL(xhr.openArgs[1]);
    assert.equal(proxyUrl.pathname, '/api/requestProxy/resource');
    assert.equal(proxyUrl.searchParams.get('X-Proxy-Host'), 'https://page.test');
    xhr.setRequestHeader('X-Proxy-Host', 'invalid.test');
    xhr.setRequestHeader('X-Test', 'value');
    assert.deepEqual(xhr.headers, [['X-Test', 'value']]);

    serverUrl = '';
    xhr.open('POST', '/direct', false);
    assert.equal(xhr.openArgs[1], '/direct');
});

test('场景：Node http 和 https 未配置服务器地址时原样复用原生模块', () => {
    const requestResult = {};
    const getResult = {};
    const requestCalls = [];
    const getCalls = [];
    const NativeAgent = class {};
    const nativeHttp = {
        Agent: NativeAgent,
        request(...args) {
            requestCalls.push(args);
            return requestResult;
        },
        get(...args) {
            getCalls.push(args);
            return getResult;
        },
    };
    const adapter = new ProxyRequest('', {http: nativeHttp});
    const options = {hostname: 'target.test', path: '/api'};
    const callback = () => {};

    assert.equal(adapter.http.Agent, NativeAgent);
    assert.equal(adapter.http.request(options, callback), requestResult);
    assert.equal(adapter.http.get('http://target.test/file', callback), getResult);
    assert.equal(requestCalls[0][0], options);
    assert.equal(requestCalls[0][1], callback);
    assert.equal(getCalls[0][0], 'http://target.test/file');
    assert.equal(getCalls[0][1], callback);
});

test('场景：Node 请求只改写目标参数并由代理协议对应的原生模块发送', () => {
    const httpCalls = [];
    const httpsCalls = [];
    const expected = {};
    const nativeHttp = createNativeNodeModule(httpCalls);
    const nativeHttps = createNativeNodeModule(httpsCalls, expected);
    const adapter = new ProxyRequest('https://proxy.test/base', {
        http: nativeHttp,
        https: nativeHttps,
    });
    const callback = () => {};
    const targetAgent = {};

    const result = adapter.http.request({
        hostname: 'target.test',
        port: 8080,
        path: '/upload?q=1',
        method: 'POST',
        agent: targetAgent,
        headers: {
            Host: 'target.test',
            'X-Proxy-Host': 'invalid.test',
            'X-Test': 'value',
        },
    }, callback);

    assert.equal(result, expected);
    assert.equal(httpCalls.length, 0);
    assert.equal(httpsCalls.length, 1);
    const [proxyUrl, options, receivedCallback] = httpsCalls[0].args;
    assert.ok(proxyUrl instanceof URL);
    assert.equal(proxyUrl.pathname, '/base/api/requestProxy/upload');
    assert.equal(proxyUrl.searchParams.get('q'), '1');
    assert.equal(proxyUrl.searchParams.get('X-Proxy-Host'), 'http://target.test:8080');
    assert.equal(proxyUrl.searchParams.get('X-Proxy-Follow-Redirect'), 'false');
    assert.equal(options.hostname, undefined);
    assert.equal(options.path, undefined);
    assert.equal(options.agent, undefined);
    assert.deepEqual(options.headers, {'X-Test': 'value'});
    assert.equal(options.method, 'POST');
    assert.equal(receivedCallback, callback);
});

test('场景：Node 模块拒绝与入口模块不一致的目标协议', () => {
    const adapter = new ProxyRequest('https://proxy.test', {
        http: createNativeNodeModule([]),
        https: createNativeNodeModule([]),
    });

    assert.throws(
        () => adapter.http.request('https://target.test'),
        {code: 'ERR_INVALID_PROTOCOL'},
    );
});

const realProxyServerUrl = getTestArgument(testArguments, 'proxy-server-url');
const realProxyTargetUrl = getTestArgument(testArguments, 'proxy-target-url');

test('场景：通过命令行参数配置的真实 proxyRequest 服务完成 fetch 和 Node 请求', {
    skip: realProxyServerUrl && realProxyTargetUrl
        ? false
        : '需要传入 --proxy-server-url 和 --proxy-target-url',
    timeout: 30_000,
}, async () => {
    const adapter = new ProxyRequest(realProxyServerUrl, {http, https});
    const fetchResponse = await adapter.fetch(realProxyTargetUrl, {
        headers: {Accept: '*/*'},
        signal: AbortSignal.timeout(20_000),
    });
    const fetchBody = await fetchResponse.arrayBuffer();

    assert.ok(fetchResponse.status >= 200 && fetchResponse.status < 400);
    assert.ok(fetchBody.byteLength > 0);

    const target = new URL(realProxyTargetUrl);
    const nodeModule = target.protocol === 'http:' ? adapter.http : adapter.https;
    const nodeResponse = await requestWithNodeModule(nodeModule, target);
    assert.ok(nodeResponse.status >= 200 && nodeResponse.status < 400);
    assert.ok(nodeResponse.body.byteLength > 0);
});

function createNativeNodeModule(calls, result = {}) {
    return {
        request(...args) {
            calls.push({method: 'request', args});
            return result;
        },
        get(...args) {
            calls.push({method: 'get', args});
            return result;
        },
    };
}

function requestWithNodeModule(nodeModule, target) {
    return new Promise((resolve, reject) => {
        const request = nodeModule.get(target, {
            headers: {Accept: '*/*'},
            signal: AbortSignal.timeout(20_000),
        }, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve({
                status: response.statusCode,
                body: Buffer.concat(chunks),
            }));
        });
        request.on('error', reject);
    });
}
