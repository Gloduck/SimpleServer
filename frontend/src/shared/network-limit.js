const DEFAULT_LIMITS = Object.freeze({
    maxRequestCount: 20,
    maxResponseBytes: 50 * 1024 * 1024,
    maxResponseTotalBytes: 50 * 1024 * 1024,
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 30_000,
});

class NetworkLimit {
    constructor(network = {}, options = {}) {
        if (typeof network.fetch !== 'function') throw new TypeError('NetworkLimit requires fetch');
        this.limits = normalizeLimits(options);
        this.state = {
            requestCount: 0,
            responseBytes: 0,
            controllers: new Set(),
            requests: new Set(),
            pendingOperations: 0,
            violation: null,
        };
        const baseUrl = options.baseUrl || globalThis.location?.href || '';
        this.fetch = createLimitedFetch(network.fetch, {baseUrl, limits: this.limits, state: this.state});
        this.XMLHttpRequest = createLimitedXMLHttpRequest(network.XMLHttpRequest, {
            baseUrl,
            limits: this.limits,
            state: this.state,
        });
    }

    abortAll(reason = new DOMException('Execution stopped', 'AbortError')) {
        for (const controller of this.state.controllers) controller.abort(reason);
        for (const request of this.state.requests) request.abort();
    }

    assertHealthy() {
        if (this.state.violation) throw this.state.violation;
    }

    hasPendingOperations() {
        return this.state.controllers.size > 0 || this.state.pendingOperations > 0;
    }

    getUsage() {
        return {
            requestCount: this.state.requestCount,
            responseBytes: this.state.responseBytes,
        };
    }
}

function createLimitedFetch(fetch, {baseUrl, limits, state}) {
    return async (input, init = {}) => {
        const target = normalizeRequestInput(input, baseUrl);
        const targetUrl = new URL(target instanceof Request ? target.url : String(target));
        assertHttpUrl(targetUrl);
        consumeRequest(state, limits, targetUrl.href);

        const controller = new AbortController();
        const requestSignal = target instanceof Request ? target.signal : null;
        const sourceSignals = [requestSignal, init?.signal].filter(Boolean);
        const removeAbortListeners = sourceSignals.map((signal) => forwardAbort(signal, controller));
        const timeoutMs = normalizeTimeout(init?.timeoutMs, limits);
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort(networkError('REQUEST_TIMEOUT', `Request timed out after ${timeoutMs}ms`, {
                phase: 'download',
                url: targetUrl.href,
            }));
        }, timeoutMs);
        state.controllers.add(controller);

        try {
            const requestInit = {...init, credentials: 'omit', signal: controller.signal};
            delete requestInit.timeoutMs;
            const response = await fetch(target, requestInit);
            return await bufferLimitedResponse(response, targetUrl.href, controller, limits, state);
        } catch (error) {
            if (timedOut) {
                throw networkError('REQUEST_TIMEOUT', `Request timed out after ${timeoutMs}ms`, {
                    phase: 'download',
                    url: targetUrl.href,
                });
            }
            if (controller.signal.aborted && controller.signal.reason) throw controller.signal.reason;
            throw error;
        } finally {
            clearTimeout(timer);
            removeAbortListeners.forEach((remove) => remove());
            state.controllers.delete(controller);
        }
    };
}

async function bufferLimitedResponse(response, url, controller, limits, state) {
    if (response.status === 0 || response.type === 'opaque' || response.type === 'opaqueredirect') return response;
    const declaredSize = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredSize)) {
        assertResponseSize(declaredSize, state.responseBytes + declaredSize, url, limits, state, controller);
    }

    const chunks = [];
    let responseBytes = 0;
    if (response.body?.getReader) {
        const reader = response.body.getReader();
        try {
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
                responseBytes += chunk.byteLength;
                state.responseBytes += chunk.byteLength;
                assertResponseSize(responseBytes, state.responseBytes, url, limits, state, controller, reader);
                chunks.push(chunk);
            }
        } finally {
            reader.releaseLock?.();
        }
    } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        responseBytes = bytes.byteLength;
        state.responseBytes += responseBytes;
        assertResponseSize(responseBytes, state.responseBytes, url, limits, state, controller);
        chunks.push(bytes);
    }

    const bytes = mergeBytes(chunks, responseBytes);
    const body = [101, 204, 205, 304].includes(response.status) ? null : bytes;
    const result = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
    defineResponseProperty(result, 'url', response.url || url);
    defineResponseProperty(result, 'redirected', response.redirected);
    defineResponseProperty(result, 'type', response.type);
    return result;
}

function createLimitedXMLHttpRequest(NativeXMLHttpRequest, {baseUrl, limits, state}) {
    if (typeof NativeXMLHttpRequest !== 'function') {
        return class XMLHttpRequest {
            constructor() {
                throw new ReferenceError('XMLHttpRequest is not available in the current environment');
            }
        };
    }

    return class LimitedXMLHttpRequest extends NativeXMLHttpRequest {
        #url = '';
        #loadedBytes = 0;
        #limitError = null;
        #active = false;

        get limitError() {
            return this.#limitError;
        }

        open(method, url, ...args) {
            if (args[0] === false) throw new DOMException('Synchronous XMLHttpRequest is not supported', 'NotSupportedError');
            const target = new URL(String(url), baseUrl || undefined);
            assertHttpUrl(target);
            this.#url = target.href;
            this.#loadedBytes = 0;
            this.#limitError = null;
            return super.open(method, url, ...args);
        }

        send(body) {
            consumeRequest(state, limits, this.#url);
            this.timeout = Math.min(this.timeout || limits.defaultTimeoutMs, limits.maxTimeoutMs);
            this.#active = true;
            state.pendingOperations += 1;
            state.requests.add(this);

            const onReadyStateChange = () => {
                if (this.readyState !== this.HEADERS_RECEIVED) return;
                const declaredSize = Number(this.getResponseHeader('content-length'));
                if (!Number.isFinite(declaredSize)) return;
                try {
                    assertResponseSize(declaredSize, state.responseBytes + declaredSize, this.#url, limits, state);
                } catch (error) {
                    this.#failLimit(error);
                }
            };
            const onProgress = (event) => {
                const loaded = Math.max(this.#loadedBytes, Number(event.loaded) || 0);
                const difference = loaded - this.#loadedBytes;
                this.#loadedBytes = loaded;
                state.responseBytes += difference;
                try {
                    assertResponseSize(this.#loadedBytes, state.responseBytes, this.#url, limits, state);
                } catch (error) {
                    this.#failLimit(error);
                }
            };
            const onLoad = () => {
                const finalSize = getXMLHttpRequestResponseSize(this);
                const difference = Math.max(0, finalSize - this.#loadedBytes);
                this.#loadedBytes += difference;
                state.responseBytes += difference;
                try {
                    assertResponseSize(this.#loadedBytes, state.responseBytes, this.#url, limits, state);
                } catch (error) {
                    this.#failLimit(error);
                }
            };
            const onLoadEnd = () => {
                this.removeEventListener('readystatechange', onReadyStateChange);
                this.removeEventListener('progress', onProgress);
                this.removeEventListener('load', onLoad);
                this.removeEventListener('loadend', onLoadEnd);
                if (this.#active) {
                    this.#active = false;
                    state.pendingOperations = Math.max(0, state.pendingOperations - 1);
                    state.requests.delete(this);
                }
            };

            this.addEventListener('readystatechange', onReadyStateChange);
            this.addEventListener('progress', onProgress);
            this.addEventListener('load', onLoad);
            this.addEventListener('loadend', onLoadEnd);
            try {
                return super.send(body);
            } catch (error) {
                onLoadEnd();
                throw error;
            }
        }

        #failLimit(error) {
            if (this.#limitError) return;
            this.#limitError = error;
            recordViolation(state, error);
            super.abort();
        }
    };
}

function consumeRequest(state, limits, url) {
    state.requestCount += 1;
    if (state.requestCount <= limits.maxRequestCount) return;
    const error = networkError('REQUEST_LIMIT_EXCEEDED', `Request count exceeds ${limits.maxRequestCount}`, {
        phase: 'download',
        size: state.requestCount,
        maxSize: limits.maxRequestCount,
        url,
    });
    recordViolation(state, error);
    throw error;
}

function assertResponseSize(responseSize, totalSize, url, limits, state, controller, reader) {
    let error;
    if (responseSize > limits.maxResponseBytes) {
        error = fileTooLargeError('download', responseSize, limits.maxResponseBytes, url);
    } else if (totalSize > limits.maxResponseTotalBytes) {
        error = fileTooLargeError('download-total', totalSize, limits.maxResponseTotalBytes, url);
    }
    if (!error) return;
    recordViolation(state, error);
    void reader?.cancel?.(error);
    controller?.abort(error);
    throw error;
}

function recordViolation(state, error) {
    if (!state.violation) state.violation = error;
}

function getXMLHttpRequestResponseSize(request) {
    const response = request.response;
    if (response instanceof ArrayBuffer) return response.byteLength;
    if (ArrayBuffer.isView(response)) return response.byteLength;
    if (typeof Blob !== 'undefined' && response instanceof Blob) return response.size;
    if (typeof response === 'string') return new TextEncoder().encode(response).byteLength;
    if (response != null) {
        try {
            return new TextEncoder().encode(JSON.stringify(response)).byteLength;
        } catch {
        }
    }
    try {
        return new TextEncoder().encode(request.responseText || '').byteLength;
    } catch {
        return 0;
    }
}

function normalizeRequestInput(input, baseUrl) {
    if (typeof Request === 'function' && input instanceof Request) return input;
    if (typeof input === 'string' || input instanceof URL) return new URL(String(input), baseUrl || undefined).href;
    return input;
}

function assertHttpUrl(url) {
    if (url.protocol === 'http:' || url.protocol === 'https:') return;
    throw networkError('INVALID_REQUEST_URL', `Only HTTP and HTTPS requests are supported: ${url.href}`, {
        phase: 'download',
        url: url.href,
    });
}

function normalizeLimits(values) {
    return {
        maxRequestCount: positiveInteger(values.maxRequestCount, DEFAULT_LIMITS.maxRequestCount),
        maxResponseBytes: nonNegativeNumber(values.maxResponseBytes, DEFAULT_LIMITS.maxResponseBytes),
        maxResponseTotalBytes: nonNegativeNumber(values.maxResponseTotalBytes, DEFAULT_LIMITS.maxResponseTotalBytes),
        defaultTimeoutMs: positiveNumber(values.defaultTimeoutMs, DEFAULT_LIMITS.defaultTimeoutMs),
        maxTimeoutMs: positiveNumber(values.maxTimeoutMs, DEFAULT_LIMITS.maxTimeoutMs),
    };
}

function normalizeTimeout(value, limits) {
    const requested = positiveNumber(value, limits.defaultTimeoutMs);
    return Math.min(requested, limits.maxTimeoutMs);
}

function forwardAbort(signal, controller) {
    if (signal.aborted) {
        controller.abort(signal.reason);
        return () => {};
    }
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, {once: true});
    return () => signal.removeEventListener('abort', abort);
}

function mergeBytes(chunks, size) {
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

function defineResponseProperty(response, name, value) {
    try {
        Object.defineProperty(response, name, {configurable: true, value});
    } catch {
    }
}

function fileTooLargeError(phase, size, maxSize, url) {
    return networkError('FILE_TOO_LARGE', `Size limit exceeded: ${size} > ${maxSize} bytes`, {
        phase,
        url,
        size,
        maxSize,
        requestAborted: true,
        partialFileDiscarded: true,
    });
}

function networkError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function positiveInteger(value, fallback) {
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

function positiveNumber(value, fallback) {
    return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

function nonNegativeNumber(value, fallback) {
    return value === Infinity || (Number.isFinite(Number(value)) && Number(value) >= 0) ? Number(value) : fallback;
}

export {NetworkLimit};
