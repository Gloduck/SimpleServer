import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import test from 'node:test';
import {RequestProxy, buildRequestProxyUrl} from '../../src/shared/request-proxy.js';
import {getTestArgument, loadTestArguments} from '../test-helpers.js';

const testArguments = loadTestArguments();

test('场景：代理地址保留目标路径和查询参数并附加控制参数', () => {
    const result = new URL(buildRequestProxyUrl(
        'https://proxy.test/base/',
        'https://target.test/files/a%20b?tag=one&tag=two&X-Proxy-Host=https%3A%2F%2Finvalid.test#section',
    ));

    assert.equal(result.origin, 'https://proxy.test');
    assert.equal(result.pathname, '/base/api/requestProxy/files/a%20b');
    assert.deepEqual(result.searchParams.getAll('tag'), ['one', 'two']);
    assert.equal(result.searchParams.get('X-Proxy-Host'), 'https://target.test');
    assert.deepEqual(result.searchParams.getAll('X-Proxy-Host'), ['https://target.test']);
    assert.equal(result.searchParams.get('X-Proxy-Cors'), 'true');
    assert.equal(result.searchParams.get('X-Proxy-Follow-Redirect'), 'true');
    assert.equal(result.searchParams.get('X-Proxy-Origin'), 'false');
    assert.equal(result.searchParams.get('X-Proxy-Referer'), 'false');
});

test('场景：fetch 在服务器地址为空时原样调用原生实现', async () => {
    const input = {url: 'unchanged'};
    const init = {method: 'POST'};
    const expected = {ok: true};
    let received;
    const proxy = new RequestProxy('', {
        fetch: async (...args) => {
            received = args;
            return expected;
        },
    });

    const result = await proxy.fetch(input, init);

    assert.equal(result, expected);
    assert.equal(received[0], input);
    assert.equal(received[1], init);
});

test('场景：fetch 动态切换代理地址并过滤代理内部请求头', async () => {
    let serverUrl = 'https://proxy-one.test/root';
    const calls = [];
    const proxy = new RequestProxy(() => serverUrl, {
        baseUrl: 'https://page.test/workspace/',
        enableCors: false,
        useTargetOrigin: true,
        useTargetReferer: true,
        fetch: async (...args) => {
            calls.push(args);
            return new Response('ok');
        },
    });

    await proxy.fetch('/api/items?q=1', {
        headers: {
            'X-Test': 'value',
            'X-Proxy-Host': 'invalid.test',
            'X-Proxy-Origin': 'invalid',
            'Proxy-Referer': 'invalid',
            'Proxy-Cors': 'invalid',
            Host: 'invalid.test',
            Connection: 'close',
            'Content-Length': '1',
        },
        redirect: 'manual',
    });
    serverUrl = 'https://proxy-two.test';
    await proxy.fetch('https://target.test/next');

    const firstUrl = new URL(calls[0][0]);
    assert.equal(firstUrl.origin, 'https://proxy-one.test');
    assert.equal(firstUrl.pathname, '/root/api/requestProxy/api/items');
    assert.equal(firstUrl.searchParams.get('X-Proxy-Host'), 'https://page.test');
    assert.equal(firstUrl.searchParams.get('X-Proxy-Cors'), 'false');
    assert.equal(firstUrl.searchParams.get('X-Proxy-Follow-Redirect'), 'false');
    assert.equal(firstUrl.searchParams.get('X-Proxy-Origin'), 'true');
    assert.equal(firstUrl.searchParams.get('X-Proxy-Referer'), 'true');
    assert.equal(calls[0][1].headers.get('x-test'), 'value');
    assert.equal(calls[0][1].headers.has('x-proxy-host'), false);
    assert.equal(calls[0][1].headers.has('x-proxy-origin'), false);
    assert.equal(calls[0][1].headers.has('proxy-referer'), false);
    assert.equal(calls[0][1].headers.has('proxy-cors'), false);
    assert.equal(calls[0][1].headers.has('host'), false);
    assert.equal(calls[0][1].headers.has('connection'), false);
    assert.equal(calls[0][1].headers.has('content-length'), false);
    assert.equal(calls[0][1].redirect, 'manual');

    const secondUrl = new URL(calls[1][0]);
    assert.equal(secondUrl.origin, 'https://proxy-two.test');
    assert.equal(secondUrl.searchParams.get('X-Proxy-Host'), 'https://target.test');
    assert.equal(calls[1][1].redirect, 'error');
});

test('场景：fetch 接收 Request 时复用原生请求属性并只替换 URL', async () => {
    let received;
    const proxy = new RequestProxy('https://proxy.test', {
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

    await proxy.fetch(request);

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
    const proxy = new RequestProxy(() => serverUrl, {
        baseUrl: 'https://page.test/',
        useTargetOrigin: true,
        useTargetReferer: true,
        XMLHttpRequest: NativeXMLHttpRequest,
    });
    const xhr = new proxy.XMLHttpRequest();

    assert.equal(proxy.XMLHttpRequest.DONE, NativeXMLHttpRequest.DONE);
    assert.equal(xhr.open('GET', '/resource', true), 'opened');
    const proxyUrl = new URL(xhr.openArgs[1]);
    assert.equal(proxyUrl.pathname, '/api/requestProxy/resource');
    assert.equal(proxyUrl.searchParams.get('X-Proxy-Host'), 'https://page.test');
    assert.equal(proxyUrl.searchParams.get('X-Proxy-Origin'), 'true');
    assert.equal(proxyUrl.searchParams.get('X-Proxy-Referer'), 'true');
    xhr.setRequestHeader('X-Proxy-Host', 'invalid.test');
    xhr.setRequestHeader('Connection', 'close');
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
    const proxy = new RequestProxy('', {http: nativeHttp});
    const options = {hostname: 'target.test', path: '/api'};
    const callback = () => {};

    assert.equal(proxy.http.Agent, NativeAgent);
    assert.equal(proxy.http.request(options, callback), requestResult);
    assert.equal(proxy.http.get('http://target.test/file', callback), getResult);
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
    const proxy = new RequestProxy('https://proxy.test/base', {
        http: nativeHttp,
        https: nativeHttps,
    });
    const callback = () => {};
    const targetAgent = {};

    const result = proxy.http.request({
        hostname: 'target.test',
        port: 8080,
        path: '/upload?q=1',
        method: 'POST',
        agent: targetAgent,
        headers: {
            Host: 'target.test',
            Connection: 'close',
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
    const proxy = new RequestProxy('https://proxy.test', {
        http: createNativeNodeModule([]),
        https: createNativeNodeModule([]),
    });

    assert.throws(
        () => proxy.http.request('https://target.test'),
        {code: 'ERR_INVALID_PROTOCOL'},
    );
});

const realProxyServerUrl = getTestArgument(testArguments, 'proxy-server-url');
const realProxyTargetUrl = getTestArgument(testArguments, 'proxy-target-url');

test('场景：通过命令行参数配置的真实 RequestProxy 服务完成 fetch 和 Node 请求', {
    skip: realProxyServerUrl && realProxyTargetUrl
        ? false
        : '需要传入 --proxy-server-url 和 --proxy-target-url',
    timeout: 30_000,
}, async () => {
    const proxy = new RequestProxy(realProxyServerUrl, {http, https});
    const fetchResponse = await proxy.fetch(realProxyTargetUrl, {
        headers: {Accept: '*/*'},
        signal: AbortSignal.timeout(20_000),
    });
    const fetchBody = await fetchResponse.arrayBuffer();

    assert.ok(fetchResponse.status >= 200 && fetchResponse.status < 400);
    assert.ok(fetchBody.byteLength > 0);

    const target = new URL(realProxyTargetUrl);
    const nodeModule = target.protocol === 'http:' ? proxy.http : proxy.https;
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
