const REQUEST_PROXY_PATH = '/api/requestProxy';
const PROXY_CONTROL_HEADERS = new Set([
    'x-proxy-host',
    'x-proxy-cors',
    'x-proxy-follow-redirect',
]);
const NODE_PROXY_BLOCKED_HEADERS = new Set([...PROXY_CONTROL_HEADERS, 'host']);
const NODE_DESTINATION_OPTIONS = [
    'protocol',
    'host',
    'hostname',
    'port',
    'path',
    'pathname',
    'search',
    'href',
    'hash',
    'defaultPort',
    'socketPath',
    'createConnection',
];

class ProxyRequest {
    #serverUrlSource;
    #baseUrlSource;
    #proxyPath;
    #enableCors;
    #nativeFetch;
    #Request;
    #Headers;
    #nativeHttp;
    #nativeHttps;

    constructor(serverUrl = '', options = {}) {
        if (isOptionsObject(serverUrl)) {
            options = serverUrl;
            serverUrl = options.serverUrl ?? '';
        }

        this.#serverUrlSource = serverUrl;
        this.#baseUrlSource = options.baseUrl ?? (() => globalThis.location?.href || '');
        this.#proxyPath = normalizeProxyPath(options.proxyPath ?? REQUEST_PROXY_PATH);
        this.#enableCors = options.enableCors !== false;
        this.#nativeFetch = options.fetch ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
        this.#Request = options.Request ?? globalThis.Request;
        this.#Headers = options.Headers ?? globalThis.Headers;
        this.#nativeHttp = options.http;
        this.#nativeHttps = options.https;

        this.fetch = this.fetch.bind(this);
        const rewriteUrl = (url, requestOptions) => this.#rewriteUrl(url, requestOptions);
        this.XMLHttpRequest = createXMLHttpRequestAdapter(options.XMLHttpRequest ?? globalThis.XMLHttpRequest, rewriteUrl);
        this.http = createNodeModuleAdapter(this.#nativeHttp, (method, args) => this.#nodeRequest('http:', method, args));
        this.https = createNodeModuleAdapter(this.#nativeHttps, (method, args) => this.#nodeRequest('https:', method, args));
    }

    get serverUrl() {
        return this.#resolveServerUrl();
    }

    set serverUrl(value) {
        this.#serverUrlSource = value;
    }

    setServerUrl(value = '') {
        this.#serverUrlSource = value;
        return this;
    }

    isProxyEnabled() {
        return Boolean(this.#resolveServerUrl());
    }

    fetch(input, init) {
        if (!this.#nativeFetch) return Promise.reject(new ReferenceError('fetch is not available in the current environment'));

        let serverUrl;
        try {
            serverUrl = this.#resolveServerUrl();
        } catch (error) {
            return Promise.reject(error);
        }
        if (!serverUrl) return this.#nativeFetch(input, init);

        try {
            const requestInput = this.#Request && input instanceof this.#Request ? input : null;
            const redirect = normalizeFetchRedirect(init, requestInput);
            const baseUrl = this.#resolveBaseUrl();
            const proxyUrl = buildProxyRequestUrl(serverUrl, requestInput?.url ?? input, {
                baseUrl,
                proxyPath: this.#proxyPath,
                enableCors: this.#enableCors,
                followRedirect: redirect === 'follow',
            });
            const proxyInput = requestInput && this.#Request ? new this.#Request(proxyUrl, requestInput) : proxyUrl;
            const proxyInit = {...(init || {})};
            const hasHeaders = init?.headers !== undefined;
            if (hasHeaders || requestInput) {
                proxyInit.headers = sanitizeFetchHeaders(hasHeaders ? init.headers : requestInput.headers, this.#Headers);
            }
            // The backend handles target redirects. A remaining 3xx must not trigger a direct target request.
            proxyInit.redirect = redirect === 'manual' ? 'manual' : 'error';
            return this.#nativeFetch(proxyInput, proxyInit);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    #nodeRequest(targetProtocol, method, args) {
        const targetModule = this.#getNodeModule(targetProtocol);
        const serverUrl = this.#resolveServerUrl();
        if (!serverUrl) return callNodeMethod(targetModule, method, args);

        const parsed = parseNodeRequestArguments(targetProtocol, args);
        const baseUrl = this.#resolveBaseUrl();
        const proxyUrl = buildProxyRequestUrl(serverUrl, parsed.target, {
            baseUrl,
            proxyPath: this.#proxyPath,
            enableCors: this.#enableCors,
            followRedirect: false,
        });
        const proxyProtocol = new URL(proxyUrl).protocol;
        const proxyModule = this.#getNodeModule(proxyProtocol);
        const proxyOptions = buildNodeProxyOptions(parsed.options, parsed.target, targetProtocol, proxyProtocol);
        const proxyArgs = [new URL(proxyUrl), proxyOptions];
        if (parsed.callback) proxyArgs.push(parsed.callback);
        return callNodeMethod(proxyModule, method, proxyArgs);
    }

    #rewriteUrl(input, {followRedirect = true} = {}) {
        const serverUrl = this.#resolveServerUrl();
        if (!serverUrl) return {proxied: false, url: input};
        const baseUrl = this.#resolveBaseUrl();
        return {
            proxied: true,
            url: buildProxyRequestUrl(serverUrl, input, {
                baseUrl,
                proxyPath: this.#proxyPath,
                enableCors: this.#enableCors,
                followRedirect,
            }),
        };
    }

    #getNodeModule(protocol) {
        const module = protocol === 'http:' ? this.#nativeHttp : protocol === 'https:' ? this.#nativeHttps : null;
        if (!module) throw new ReferenceError(`Native ${protocol.replace(':', '')} module is not available`);
        return module;
    }

    #resolveServerUrl() {
        return normalizeDynamicUrl(this.#serverUrlSource, 'serverUrl');
    }

    #resolveBaseUrl() {
        return normalizeDynamicUrl(this.#baseUrlSource, 'baseUrl');
    }
}

function buildProxyRequestUrl(serverUrl, targetUrl, {
    baseUrl = '',
    proxyPath = REQUEST_PROXY_PATH,
    enableCors = true,
    followRedirect = true,
} = {}) {
    const server = resolveUrl(serverUrl, baseUrl);
    const target = resolveUrl(targetUrl, baseUrl);
    if (!isHttpProtocol(server.protocol)) throw new TypeError('Proxy server URL must use HTTP or HTTPS');
    if (!isHttpProtocol(target.protocol)) throw new TypeError('Proxy target URL must use HTTP or HTTPS');

    const serverPath = server.pathname.replace(/\/+$/, '');
    server.pathname = `${serverPath}${normalizeProxyPath(proxyPath)}${target.pathname || '/'}`;
    server.hash = '';

    const controls = new URLSearchParams({
        'X-Proxy-Host': target.origin,
        'X-Proxy-Cors': enableCors ? 'true' : 'false',
        'X-Proxy-Follow-Redirect': followRedirect ? 'true' : 'false',
    });
    const targetQuery = target.search.startsWith('?') ? target.search.slice(1) : target.search;
    server.search = targetQuery ? `?${targetQuery}&${controls}` : `?${controls}`;
    return server.href;
}

function createXMLHttpRequestAdapter(NativeXMLHttpRequest, rewriteUrl) {
    if (typeof NativeXMLHttpRequest !== 'function') {
        return class XMLHttpRequest {
            constructor() {
                throw new ReferenceError('XMLHttpRequest is not available in the current environment');
            }
        };
    }

    return class XMLHttpRequest extends NativeXMLHttpRequest {
        #proxied = false;

        open(method, url, ...args) {
            const resolved = rewriteUrl(url, {followRedirect: true});
            this.#proxied = resolved.proxied;
            return super.open(method, resolved.url, ...args);
        }

        setRequestHeader(name, value) {
            if (this.#proxied && PROXY_CONTROL_HEADERS.has(String(name).toLowerCase())) return;
            return super.setRequestHeader(name, value);
        }
    };
}

function createNodeModuleAdapter(nativeModule, invoke) {
    const adapter = Object.create(nativeModule || null);
    adapter.request = (...args) => invoke('request', args);
    adapter.get = (...args) => invoke('get', args);
    return adapter;
}

function parseNodeRequestArguments(expectedProtocol, args) {
    const [input, second, third] = args;
    const inputIsUrl = typeof input === 'string' || input instanceof URL;
    const options = inputIsUrl ? {...(typeof second === 'object' && second ? second : {})} : {...(input || {})};
    const callback = inputIsUrl
        ? (typeof second === 'function' ? second : third)
        : (typeof second === 'function' ? second : undefined);
    const target = inputIsUrl
        ? applyNodeTargetOptions(new URL(String(input)), options)
        : createNodeTargetUrl(expectedProtocol, options);

    if (target.protocol !== expectedProtocol) {
        throw nodeError('ERR_INVALID_PROTOCOL', `Protocol "${target.protocol}" not supported. Expected "${expectedProtocol}"`);
    }
    target.hash = '';
    return {target, options, callback};
}

function createNodeTargetUrl(defaultProtocol, options) {
    const protocol = normalizeProtocol(options.protocol || defaultProtocol);
    let url = new URL(`${protocol}//localhost/`);
    url = applyNodeTargetOptions(url, options);
    return url;
}

function applyNodeTargetOptions(url, options) {
    if (options.protocol != null) url.protocol = normalizeProtocol(options.protocol);
    if (options.host != null) {
        const host = new URL(`${url.protocol}//${String(options.host)}`);
        url.hostname = host.hostname;
        url.port = host.port;
    }
    if (options.hostname != null) url.hostname = String(options.hostname).replace(/^\[|\]$/g, '');
    if (options.port != null) url.port = String(options.port);
    if (options.path != null) applyNodePath(url, options.path);
    else {
        if (options.pathname != null) url.pathname = String(options.pathname);
        if (options.search != null) url.search = String(options.search);
    }
    return url;
}

function applyNodePath(url, path) {
    const value = String(path || '/');
    const resolved = new URL(`${url.protocol}//${url.host}${value.startsWith('/') ? value : `/${value}`}`);
    url.pathname = resolved.pathname;
    url.search = resolved.search;
}

function buildNodeProxyOptions(source, target, targetProtocol, proxyProtocol) {
    const options = {...source};
    NODE_DESTINATION_OPTIONS.forEach((name) => delete options[name]);
    const headers = sanitizeNodeHeaders(source.headers);
    if (headers) options.headers = headers;
    else delete options.headers;

    if (source.auth == null && target.username) {
        options.auth = `${decodeUrlComponent(target.username)}:${decodeUrlComponent(target.password)}`;
    }
    if (targetProtocol !== proxyProtocol) delete options.agent;
    return options;
}

function sanitizeFetchHeaders(headers, HeadersCtor) {
    if (typeof HeadersCtor !== 'function') return sanitizeHeaderEntries(headers, PROXY_CONTROL_HEADERS);
    const result = new HeadersCtor(headers == null ? undefined : headers);
    PROXY_CONTROL_HEADERS.forEach((name) => result.delete(name));
    return result;
}

function sanitizeNodeHeaders(headers) {
    if (headers == null) return null;
    const entries = sanitizeHeaderEntries(headers, NODE_PROXY_BLOCKED_HEADERS);
    const result = {};
    entries.forEach(([name, value]) => {
        if (result[name] === undefined) result[name] = value;
        else if (Array.isArray(result[name])) result[name].push(value);
        else result[name] = [result[name], value];
    });
    return result;
}

function sanitizeHeaderEntries(headers, blocked) {
    const entries = [];
    const append = (name, value) => {
        if (blocked.has(String(name).toLowerCase())) return;
        if (Array.isArray(value)) value.forEach((item) => entries.push([name, item]));
        else entries.push([name, value]);
    };

    if (typeof headers?.forEach === 'function') headers.forEach((value, name) => append(name, value));
    else if (Array.isArray(headers)) {
        if (headers.every(Array.isArray)) headers.forEach(([name, value]) => append(name, value));
        else for (let index = 0; index < headers.length; index += 2) append(headers[index], headers[index + 1]);
    } else if (headers) Object.entries(headers).forEach(([name, value]) => append(name, value));
    return entries;
}

function normalizeFetchRedirect(init, request) {
    const value = init?.redirect === undefined ? (request?.redirect || 'follow') : String(init.redirect);
    if (!['follow', 'error', 'manual'].includes(value)) throw new TypeError(`Invalid redirect mode: ${value}`);
    return value;
}

function callNodeMethod(module, method, args) {
    if (typeof module?.[method] !== 'function') throw new ReferenceError(`Native Node ${method} method is not available`);
    return module[method].apply(module, args);
}

function resolveUrl(value, baseUrl = '') {
    return baseUrl ? new URL(String(value), baseUrl) : new URL(String(value));
}

function normalizeDynamicUrl(source, name) {
    const value = typeof source === 'function' ? source() : source;
    if (value && typeof value.then === 'function') throw new TypeError(`${name} resolver must be synchronous`);
    return String(value ?? '').trim();
}

function normalizeProxyPath(path) {
    const value = String(path || '').trim();
    return value ? `/${value.replace(/^\/+|\/+$/g, '')}` : '';
}

function normalizeProtocol(protocol) {
    const value = String(protocol || '').toLowerCase();
    return value.endsWith(':') ? value : `${value}:`;
}

function decodeUrlComponent(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function nodeError(code, message) {
    const error = new TypeError(message);
    error.code = code;
    return error;
}

function isHttpProtocol(protocol) {
    return protocol === 'http:' || protocol === 'https:';
}

function isOptionsObject(value) {
    return value != null && typeof value === 'object' && !(value instanceof URL);
}

export {
    ProxyRequest,
    REQUEST_PROXY_PATH,
    buildProxyRequestUrl,
};
