function runAiNodeWorker(payload, {signal, timeoutMs = 30_000, onLog} = {}) {
    if (typeof Worker !== 'function' || typeof MessageChannel !== 'function') {
        return Promise.reject(workerError('WORKER_UNAVAILABLE', 'Web Worker is not available'));
    }
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./ai-node-worker-entry.js', import.meta.url), {
            type: 'module',
            name: `ai-node-worker-${Date.now()}`,
        });
        const channel = new MessageChannel();
        let settled = false;
        let workerErrorTimer = 0;

        const cleanup = () => {
            clearTimeout(timer);
            clearTimeout(workerErrorTimer);
            signal?.removeEventListener('abort', abort);
            channel.port1.close();
            worker.terminate();
        };
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        };
        const abort = () => finish(reject, signal?.reason || new DOMException('Execution cancelled', 'AbortError'));
        const timer = setTimeout(() => finish(reject, workerError('SCRIPT_TIMEOUT', `JavaScript timed out after ${timeoutMs}ms`, {
            phase: 'execution',
        })), timeoutMs);

        channel.port1.onmessage = (event) => {
            const message = event.data || {};
            if (message.type === 'log') {
                onLog?.(message.log);
                return;
            }
            if (message.type === 'done') finish(resolve, message);
        };
        channel.port1.onmessageerror = () => finish(reject, workerError('WORKER_MESSAGE_ERROR', 'Failed to deserialize Worker result'));
        worker.onerror = (event) => {
            event.preventDefault?.();
            const error = createWorkerEventError(event);
            if (!event.error && !event.message) {
                workerErrorTimer = setTimeout(() => finish(reject, error), 25);
                return;
            }
            finish(reject, error);
        };
        signal?.addEventListener('abort', abort, {once: true});
        if (signal?.aborted) {
            abort();
            return;
        }
        channel.port1.start();
        try {
            worker.postMessage({type: 'run', payload}, [channel.port2]);
        } catch (error) {
            finish(reject, error);
        }
    });
}

function createWorkerEventError(event) {
    const source = event?.error && typeof event.error === 'object' ? event.error : null;
    const code = typeof source?.code === 'string' && source.code ? source.code : 'WORKER_ERROR';
    const error = workerError(code, source?.message || event?.message || 'Unknown Worker error', {
        filename: event?.filename || source?.filename,
        lineno: event?.lineno || source?.lineno,
        colno: event?.colno || source?.colno,
    });
    if (source?.name) error.name = source.name;
    if (source?.stack) error.stack = source.stack;
    for (const name of ['phase', 'path', 'url', 'operation', 'size', 'maxSize', 'specifier', 'parent', 'format', 'exitCode', 'operations']) {
        if (source?.[name] !== undefined) error[name] = source[name];
    }
    return error;
}

function workerError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

export {runAiNodeWorker};
