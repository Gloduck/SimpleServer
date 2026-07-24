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

        const cleanup = () => {
            clearTimeout(timer);
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
            finish(reject, workerError('WORKER_ERROR', event.message || 'Unknown Worker error', {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
            }));
        };
        signal?.addEventListener('abort', abort, {once: true});
        if (signal?.aborted) {
            abort();
            return;
        }
        channel.port1.start();
        worker.postMessage({type: 'run', payload}, [channel.port2]);
    });
}

function workerError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

export {runAiNodeWorker};
