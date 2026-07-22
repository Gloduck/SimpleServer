const AI_JAVASCRIPT_DEFAULT_TIMEOUT_MS = 30_000;
const AI_JAVASCRIPT_MAX_TIMEOUT_MS = 60 * 60 * 1000;
const AI_JAVASCRIPT_MAX_FILE_COUNT = 1000;
const AI_JAVASCRIPT_MAX_REQUEST_COUNT = 20;

function requiresAiJavaScriptWorkspace({inputFiles = [], outputFiles = [], outputDirectories = []} = {}) {
    return inputFiles.length > 0 || outputFiles.length > 0 || outputDirectories.length > 0;
}

function resolveAiJavaScriptOutputPolicy(path, outputFiles = [], outputDirectories = []) {
    const exact = outputFiles.find((item) => item.path === path);
    if (exact) return exact;
    return outputDirectories
        .filter((item) => path !== item.path && path.startsWith(`${item.path}/`))
        .sort((left, right) => right.path.length - left.path.length)[0] || null;
}

function getAiJavaScriptOutputConflict({existingKind = '', overwrite = false} = {}) {
    if (existingKind === 'directory') return 'OUTPUT_PATH_TYPE_CONFLICT';
    if (existingKind === 'file' && !overwrite) return 'FILE_ALREADY_EXISTS';
    return '';
}

function evaluateAiJavaScriptSize({itemSize, currentTotal = 0, itemLimit, totalLimit, phase} = {}) {
    const size = Number(itemSize) || 0;
    const total = currentTotal + size;
    if (size > itemLimit) return {total, violation: {phase, size, maxSize: itemLimit}};
    if (total > totalLimit) return {total, violation: {phase: `${phase}-total`, size: total, maxSize: totalLimit}};
    return {total, violation: null};
}

function normalizeAiJavaScriptTimeout(value) {
    if (value === undefined || value === null || value === '') return AI_JAVASCRIPT_DEFAULT_TIMEOUT_MS;
    const timeout = Number(value);
    if (!Number.isFinite(timeout) || timeout <= 0) {
        const error = new RangeError('timeout_ms must be a positive finite number');
        error.code = 'INVALID_TIMEOUT';
        throw error;
    }
    return Math.min(Math.ceil(timeout), AI_JAVASCRIPT_MAX_TIMEOUT_MS);
}

function serializeAiJavaScriptError(error) {
    const source = error && typeof error === 'object' ? error : {};
    const result = {
        name: source.name || 'Error',
        code: source.code || 'SCRIPT_ERROR',
        message: source.message || String(error),
    };
    [
        ['phase', 'phase'],
        ['path', 'path'],
        ['url', 'url'],
        ['operation', 'operation'],
        ['size', 'size'],
        ['maxSize', 'max_size'],
        ['requestAborted', 'request_aborted'],
        ['partialFileDiscarded', 'partial_file_discarded'],
    ].forEach(([sourceKey, resultKey]) => {
        if (source[sourceKey] !== undefined) result[resultKey] = source[sourceKey];
    });
    return result;
}

function createAiJavaScriptWorkerSource({
    maxLogs = 100,
    maxStringLength = 5000,
    maxOutputStringLength = 20000,
    maxFileCount = AI_JAVASCRIPT_MAX_FILE_COUNT,
    maxRequestCount = AI_JAVASCRIPT_MAX_REQUEST_COUNT,
} = {}) {
    return String.raw`
(() => {
const MAX_LOGS = ${maxLogs};
const MAX_STRING_LENGTH = ${maxStringLength};
const MAX_OUTPUT_STRING_LENGTH = ${maxOutputStringLength};
const MAX_FILE_COUNT = ${maxFileCount};
const MAX_REQUEST_COUNT = ${maxRequestCount};
const MAX_COLLECTION_ITEMS = 100;
const MAX_DEPTH = 5;
const REQUEST_PROXY_PATH = "/api/requestProxy";
const nativePostMessage = self.postMessage.bind(self);
const nativeFetch = self.fetch.bind(self);

function disabledApi(name) {
  return function disabledRuntimeApi() {
    throw runtimeError("RUNTIME_API_DISABLED", name + " is disabled; use the run_javascript runtime API");
  };
}

function disableGlobal(name) {
  if (!(name in self)) return;
  try {
    Object.defineProperty(self, name, {
      value: disabledApi(name),
      writable: false,
      configurable: false,
    });
  } catch {
  }
}

Object.defineProperty(self, "postMessage", {
  value: disabledApi("postMessage"),
  writable: false,
  configurable: false,
});
["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "Worker", "SharedWorker", "BroadcastChannel", "importScripts"].forEach(disableGlobal);
try {
  if (self.navigator?.storage?.getDirectory) {
    Object.defineProperty(self.navigator.storage, "getDirectory", {
      value: disabledApi("navigator.storage.getDirectory"),
      writable: false,
      configurable: false,
    });
  }
} catch {
}

function runtimeError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.entries(details).forEach(([key, value]) => {
    if (value !== undefined) error[key] = value;
  });
  return error;
}

function fileTooLargeError({ phase, path, url, size, maxSize, requestAborted = false, partialFileDiscarded = false }) {
  return runtimeError("FILE_TOO_LARGE", "Size limit exceeded: " + size + " > " + maxSize + " bytes", {
    phase,
    path,
    url,
    size,
    maxSize,
    requestAborted,
    partialFileDiscarded,
  });
}

function serializeError(error) {
  const source = error && typeof error === "object" ? error : {};
  const result = {
    name: source.name || "Error",
    code: source.code || "SCRIPT_ERROR",
    message: source.message || String(error),
  };
  ["phase", "path", "url", "operation", "size", "maxSize", "requestAborted", "partialFileDiscarded"].forEach((key) => {
    if (source[key] !== undefined) result[key] = source[key];
  });
  if (source.stack) result.stack = clipString(source.stack, MAX_OUTPUT_STRING_LENGTH);
  return result;
}

function clipString(value, maxLength = MAX_STRING_LENGTH) {
  const text = String(value);
  const limit = Math.max(1, Math.min(Number(maxLength) || MAX_STRING_LENGTH, MAX_OUTPUT_STRING_LENGTH));
  return { text: text.slice(0, limit), text_chars: text.length, returned_chars: Math.min(text.length, limit), truncated: text.length > limit };
}

function formatTextResult(value) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value, null, 2);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

function safeValue(value, depth = 0, seen = []) {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return clipString(value);
  if (typeof value === "bigint") return value.toString() + "n";
  if (typeof value === "symbol") return String(value);
  if (typeof value === "function") return "[Function" + (value.name ? " " + value.name : "") + "]";
  if (value instanceof Error) return serializeError(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  if (depth >= MAX_DEPTH) return "[MaxDepth]";
  if (seen.includes(value)) return "[Circular]";

  const nextSeen = seen.concat(value);
  if (Array.isArray(value)) {
    const output = value.slice(0, MAX_COLLECTION_ITEMS).map((item) => safeValue(item, depth + 1, nextSeen));
    if (value.length > MAX_COLLECTION_ITEMS) output.push("[" + (value.length - MAX_COLLECTION_ITEMS) + " more items]");
    return output;
  }
  if (value instanceof Map) {
    const entries = Array.from(value).slice(0, MAX_COLLECTION_ITEMS).map(([key, item]) => [safeValue(key, depth + 1, nextSeen), safeValue(item, depth + 1, nextSeen)]);
    return { type: "Map", size: value.size, entries };
  }
  if (value instanceof Set) {
    const values = Array.from(value.values()).slice(0, MAX_COLLECTION_ITEMS).map((item) => safeValue(item, depth + 1, nextSeen));
    return { type: "Set", size: value.size, values };
  }

  const output = {};
  const entries = Object.entries(value);
  entries.slice(0, MAX_COLLECTION_ITEMS).forEach(([key, item]) => { output[key] = safeValue(item, depth + 1, nextSeen); });
  if (entries.length > MAX_COLLECTION_ITEMS) output.__truncated_keys = entries.length - MAX_COLLECTION_ITEMS;
  return output;
}

function normalizePath(path) {
  const raw = String(path || "").trim();
  if (/^(?:[\\/]|[A-Za-z]:[\\/])/.test(raw)) throw runtimeError("INVALID_FILE_PATH", "Absolute file paths are not allowed: " + path, { path: raw });
  const value = raw.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!value || value.includes("\0")) throw runtimeError("INVALID_FILE_PATH", "Invalid file path: " + path, { path: String(path || "") });
  const output = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!output.length) throw runtimeError("INVALID_FILE_PATH", "File path escapes the workspace: " + path, { path: String(path || "") });
      output.pop();
      continue;
    }
    if (!output.length && /^[A-Za-z]:$/.test(part)) throw runtimeError("INVALID_FILE_PATH", "Absolute file paths are not allowed: " + path, { path: String(path || "") });
    output.push(part);
  }
  if (!output.length) throw runtimeError("INVALID_FILE_PATH", "Invalid file path: " + path, { path: String(path || "") });
  return output.join("/");
}

function isPathUnder(path, directory) {
  return path !== directory && path.startsWith(directory + "/");
}

function normalizeBytes(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  throw runtimeError("INVALID_BINARY_DATA", "Binary output must be an ArrayBuffer or typed array");
}

function mergeChunks(chunks, size) {
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function normalizeRequestHeaders(headers) {
  const result = new Headers();
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return result;
  const blocked = new Set(["host", "connection", "content-length", "transfer-encoding", "upgrade", "expect", "proxy-host", "proxy-cors", "proxy-follow-redirect"]);
  Object.entries(headers).forEach(([name, value]) => {
    const normalized = String(name || "").trim().toLowerCase();
    if (!normalized || blocked.has(normalized) || value == null) return;
    result.set(name, String(value));
  });
  return result;
}

function buildProxyUrl(network, target, followRedirect) {
  const baseUrl = String(network.backendBaseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) throw runtimeError("INVALID_PROXY_CONFIG", "Backend proxy URL is unavailable");
  const proxy = new URL(baseUrl + REQUEST_PROXY_PATH + (target.pathname || "/"));
  target.searchParams.forEach((value, key) => proxy.searchParams.append(key, value));
  proxy.searchParams.set("X-Proxy-Host", target.origin);
  proxy.searchParams.set("X-Proxy-Cors", "true");
  proxy.searchParams.set("X-Proxy-Follow-Redirect", followRedirect ? "true" : "false");
  return proxy.href;
}

async function readBoundedResponse(response, url, limits, state) {
  const declaredValue = response.headers.get("content-length");
  const declaredSize = declaredValue == null ? NaN : Number(declaredValue);
  if (Number.isFinite(declaredSize) && declaredSize > limits.maxDownloadBytes) {
    throw fileTooLargeError({ phase: "download", url, size: declaredSize, maxSize: limits.maxDownloadBytes, requestAborted: true, partialFileDiscarded: true });
  }
  if (Number.isFinite(declaredSize) && state.downloadedBytes + declaredSize > limits.maxDownloadTotalBytes) {
    throw fileTooLargeError({ phase: "download-total", url, size: state.downloadedBytes + declaredSize, maxSize: limits.maxDownloadTotalBytes, requestAborted: true, partialFileDiscarded: true });
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let responseBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      responseBytes += value.byteLength;
      state.downloadedBytes += value.byteLength;
      if (responseBytes > limits.maxDownloadBytes || state.downloadedBytes > limits.maxDownloadTotalBytes) {
        await reader.cancel().catch(() => {});
        const totalExceeded = state.downloadedBytes > limits.maxDownloadTotalBytes;
        throw fileTooLargeError({
          phase: totalExceeded ? "download-total" : "download",
          url,
          size: totalExceeded ? state.downloadedBytes : responseBytes,
          maxSize: totalExceeded ? limits.maxDownloadTotalBytes : limits.maxDownloadBytes,
          requestAborted: true,
          partialFileDiscarded: true,
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return mergeChunks(chunks, responseBytes);
}

async function performRequest(options, network, limits, state) {
  state.requestCount += 1;
  if (state.requestCount > MAX_REQUEST_COUNT) throw runtimeError("REQUEST_LIMIT_EXCEEDED", "Too many network requests", { phase: "download" });
  if (!options || typeof options !== "object" || Array.isArray(options)) throw runtimeError("INVALID_REQUEST", "runtime.request requires an options object");
  let target;
  try {
    target = new URL(options.url);
  } catch {
    throw runtimeError("INVALID_REQUEST_URL", "Invalid request URL: " + options.url, { phase: "download", url: String(options.url || "") });
  }
  if (!['http:', 'https:'].includes(target.protocol)) throw runtimeError("INVALID_REQUEST_URL", "Only HTTP and HTTPS URLs are supported", { phase: "download", url: target.href });

  const method = String(options.method || "GET").trim().toUpperCase();
  if (["GET", "HEAD"].includes(method) && options.body != null) throw runtimeError("INVALID_REQUEST_BODY", method + " requests cannot include a body", { phase: "download", url: target.href });
  const responseType = String(options.responseType || "text").toLowerCase();
  if (!["text", "json", "bytes"].includes(responseType)) throw runtimeError("INVALID_RESPONSE_TYPE", "responseType must be text, json, or bytes", { phase: "download", url: target.href });
  const followRedirect = options.followRedirect !== false;
  const requestUrl = network.proxy ? buildProxyUrl(network, target, followRedirect) : target.href;
  const requestedTimeout = options.timeoutMs == null ? network.requestTimeoutMs : Number(options.timeoutMs);
  if (!Number.isFinite(requestedTimeout) || requestedTimeout <= 0) throw runtimeError("INVALID_REQUEST_TIMEOUT", "request timeoutMs must be a positive finite number", { phase: "download", url: target.href });
  const requestTimeout = Math.min(Math.ceil(requestedTimeout), network.maxRequestTimeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeout);

  try {
    const response = await nativeFetch(requestUrl, {
      method,
      headers: normalizeRequestHeaders(options.headers),
      body: ["GET", "HEAD"].includes(method) ? undefined : options.body,
      credentials: "omit",
      redirect: network.proxy ? "manual" : (followRedirect ? "follow" : "manual"),
      signal: controller.signal,
    });
    const bytes = await readBoundedResponse(response, target.href, limits, state);
    let body = bytes;
    if (responseType !== "bytes") {
      const text = new TextDecoder().decode(bytes);
      if (responseType === "text") body = text;
      else {
        try {
          body = JSON.parse(text);
        } catch (error) {
          throw runtimeError("INVALID_RESPONSE_JSON", "Response body is not valid JSON", { phase: "download", url: target.href, cause: error });
        }
      }
    }
    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers),
      body,
      size: bytes.byteLength,
      proxied: Boolean(network.proxy),
      url: target.href,
    };
  } catch (error) {
    if (controller.signal.aborted && error?.code !== "FILE_TOO_LARGE") {
      throw runtimeError("REQUEST_TIMEOUT", "Request timed out after " + requestTimeout + "ms", { phase: "download", url: target.href });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function createRuntime(payload) {
  const inputFiles = new Map((payload.inputFiles || []).map((file) => [file.path, file]));
  const outputFiles = new Map((payload.outputFiles || []).map((file) => [file.path, file]));
  const outputDirectories = (payload.outputDirectories || []).slice().sort((left, right) => right.path.length - left.path.length);
  const pendingOutputs = new Map();
  const limits = Object.freeze({ ...payload.limits });
  const state = { downloadedBytes: 0, outputBytes: 0, requestCount: 0 };

  function requireInput(path) {
    const normalized = normalizePath(path);
    const file = inputFiles.get(normalized);
    if (!file) throw runtimeError("INPUT_FILE_NOT_DECLARED", "Input file is not declared: " + normalized, { phase: "input", path: normalized });
    return file;
  }

  function resolveOutput(path) {
    const normalized = normalizePath(path);
    const exact = outputFiles.get(normalized);
    if (exact) return { path: normalized, declaration: exact };
    const directory = outputDirectories.find((candidate) => isPathUnder(normalized, candidate.path));
    if (!directory) throw runtimeError("OUTPUT_PATH_NOT_DECLARED", "Output path is not declared: " + normalized, { phase: "output", path: normalized });
    return { path: normalized, declaration: directory };
  }

  function setOutput(path, output) {
    const resolved = resolveOutput(path);
    if (resolved.declaration.type && resolved.declaration.type !== output.type) {
      throw runtimeError("OUTPUT_TYPE_CONFLICT", "Output type does not match declaration: " + resolved.path, { phase: "output", path: resolved.path });
    }
    const previousSize = pendingOutputs.get(resolved.path)?.size || 0;
    const nextTotal = state.outputBytes - previousSize + output.size;
    if (output.size > limits.maxOutputFileBytes) throw fileTooLargeError({ phase: "output", path: resolved.path, size: output.size, maxSize: limits.maxOutputFileBytes });
    if (nextTotal > limits.maxOutputTotalBytes) throw fileTooLargeError({ phase: "output-total", path: resolved.path, size: nextTotal, maxSize: limits.maxOutputTotalBytes });
    if (!pendingOutputs.has(resolved.path) && pendingOutputs.size >= MAX_FILE_COUNT) throw runtimeError("OUTPUT_FILE_COUNT_EXCEEDED", "Too many output files", { phase: "output", path: resolved.path });
    for (const pendingPath of pendingOutputs.keys()) {
      if (pendingPath === resolved.path) continue;
      if (isPathUnder(pendingPath, resolved.path) || isPathUnder(resolved.path, pendingPath)) {
        throw runtimeError("OUTPUT_PATH_TYPE_CONFLICT", "An output file is also used as a parent path: " + resolved.path, { phase: "output", path: resolved.path });
      }
    }
    state.outputBytes = nextTotal;
    pendingOutputs.set(resolved.path, { ...output, path: resolved.path, overwrite: resolved.declaration.overwrite === true });
  }

  const files = Object.freeze({
    stat(path) {
      const file = requireInput(path);
      return Object.freeze({ path: file.path, type: file.type, size: file.size, mimeType: file.mimeType || "" });
    },
    async readText(path) {
      const file = requireInput(path);
      if (file.type !== "text") throw runtimeError("FILE_TYPE_MISMATCH", "Input file is not text: " + file.path, { phase: "input", path: file.path });
      return file.content;
    },
    async readBytes(path) {
      const file = requireInput(path);
      if (file.type !== "bytes") throw runtimeError("FILE_TYPE_MISMATCH", "Input file is not binary: " + file.path, { phase: "input", path: file.path });
      return new Uint8Array(file.content.slice(0));
    },
    writeText(path, content, mimeType = "text/plain;charset=utf-8") {
      const text = String(content ?? "");
      setOutput(path, { type: "text", content: text, size: new TextEncoder().encode(text).byteLength, mimeType: String(mimeType || "text/plain;charset=utf-8") });
    },
    writeBytes(path, content, mimeType = "application/octet-stream") {
      const bytes = normalizeBytes(content);
      setOutput(path, { type: "bytes", content: bytes, size: bytes.byteLength, mimeType: String(mimeType || "application/octet-stream") });
    },
  });

  return {
    runtime: Object.freeze({
      limits,
      network: Object.freeze({ proxy: Boolean(payload.network?.proxy) }),
      request: (options) => performRequest(options, payload.network, limits, state),
      files,
    }),
    collectOutputs: () => Array.from(pendingOutputs.values()),
  };
}

function emitLog(level, args) {
  nativePostMessage({ type: "log", log: { level, args: args.map((arg) => safeValue(arg)) } });
}

["debug", "log", "info", "warn", "error"].forEach((level) => {
  console[level] = (...args) => emitLog(level, args);
});

self.onmessage = async (event) => {
  const payload = event.data || {};
  if (payload.type !== "run") return;
  const startedAt = performance.now();
  try {
    const state = createRuntime(payload);
    const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
    const run = new AsyncFunction("input", "runtime", "\"use strict\";\n" + String(payload.code || ""));
    const result = await run(payload.input, state.runtime);
    const outputFiles = state.collectOutputs();
    const transfer = outputFiles.filter((file) => file.type === "bytes").map((file) => file.content.buffer);
    const formattedResult = payload.resultMode === "text"
      ? clipString(formatTextResult(result), payload.maxOutputChars)
      : safeValue(result);
    nativePostMessage({ type: "done", ok: true, result: formattedResult, outputFiles, elapsedMs: Math.round(performance.now() - startedAt) }, transfer);
  } catch (error) {
    nativePostMessage({ type: "done", ok: false, error: serializeError(error), outputFiles: [], elapsedMs: Math.round(performance.now() - startedAt) });
  }
};
})();
`;
}

export {
    AI_JAVASCRIPT_DEFAULT_TIMEOUT_MS,
    AI_JAVASCRIPT_MAX_FILE_COUNT,
    AI_JAVASCRIPT_MAX_REQUEST_COUNT,
    AI_JAVASCRIPT_MAX_TIMEOUT_MS,
    createAiJavaScriptWorkerSource,
    evaluateAiJavaScriptSize,
    getAiJavaScriptOutputConflict,
    normalizeAiJavaScriptTimeout,
    requiresAiJavaScriptWorkspace,
    resolveAiJavaScriptOutputPolicy,
    serializeAiJavaScriptError,
};
