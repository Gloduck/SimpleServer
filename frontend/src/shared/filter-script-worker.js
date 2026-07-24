const FILTER_WORKER_SOURCE = String.raw`
const nativeClose = self.close.bind(self);

self.onmessage = async (event) => {
  const port = event.ports && event.ports[0];
  if (!port || event.data?.type !== "run") return;
  const payload = event.data.payload || {};
  try {
    const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
    const run = new AsyncFunction("input", "\"use strict\";\n" + String(payload.code || ""));
    const value = await run(payload.input);
    const text = formatValue(value);
    const limit = Math.max(1, Number(payload.maxChars) || 5000);
    port.postMessage({
      type: "done",
      ok: true,
      result: {
        text: text.slice(0, limit),
        text_chars: text.length,
        returned_chars: Math.min(text.length, limit),
        truncated: text.length > limit,
      },
    });
  } catch (error) {
    port.postMessage({
      type: "done",
      ok: false,
      error: {
        name: error?.name || "Error",
        code: error?.code || "FILTER_SCRIPT_ERROR",
        message: error?.message || String(error),
      },
    });
  } finally {
    port.close();
    nativeClose();
  }
};

function formatValue(value) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value, null, 2);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}
`;

function runFilterScript(code, input, {maxChars = 5000, timeoutMs = 30_000, signal} = {}) {
    if (typeof Worker !== 'function' || typeof MessageChannel !== 'function') {
        return Promise.reject(filterError('WORKER_UNAVAILABLE', 'Web Worker is not available'));
    }
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(new Blob([FILTER_WORKER_SOURCE], {type: 'application/javascript'}));
        const worker = new Worker(objectUrl);
        const channel = new MessageChannel();
        let settled = false;

        const cleanup = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            channel.port1.close();
            worker.terminate();
            URL.revokeObjectURL(objectUrl);
        };
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        };
        const abort = () => finish(reject, signal?.reason || new DOMException('Filter cancelled', 'AbortError'));
        const timer = setTimeout(() => finish(reject, filterError('FILTER_SCRIPT_TIMEOUT', `Filter script timed out after ${timeoutMs}ms`)), timeoutMs);

        channel.port1.onmessage = (event) => {
            const message = event.data || {};
            if (message.type !== 'done') return;
            if (message.ok) finish(resolve, message.result);
            else finish(reject, Object.assign(new Error(message.error?.message || 'Filter script failed'), message.error));
        };
        channel.port1.onmessageerror = () => finish(reject, filterError('WORKER_MESSAGE_ERROR', 'Failed to deserialize filter result'));
        worker.onerror = (event) => {
            event.preventDefault?.();
            finish(reject, filterError('WORKER_ERROR', event.message || 'Unknown filter Worker error'));
        };
        signal?.addEventListener('abort', abort, {once: true});
        if (signal?.aborted) {
            abort();
            return;
        }
        channel.port1.start();
        worker.postMessage({type: 'run', payload: {code, input, maxChars}}, [channel.port2]);
    });
}

function filterError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

export {runFilterScript};
