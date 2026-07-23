const AI_CREDENTIAL_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const AI_CREDENTIAL_TEMPLATE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?:\|(raw|urlencode|json|base64))?\}/g;
const AI_CREDENTIAL_MAX_VALUE_BYTES = 2048;

function parseAiCredentialText(content) {
    const values = new Map();
    String(content ?? '').split(/\r?\n/).forEach((line, index) => {
        let assignment = line.trim();
        if (!assignment || assignment.startsWith('#')) return;
        if (assignment.startsWith('export ')) assignment = assignment.slice(7).trimStart();
        const separator = assignment.indexOf('=');
        if (separator <= 0) throw credentialError('INVALID_CREDENTIAL_FILE', `Invalid credential assignment at line ${index + 1}`);
        const key = assignment.slice(0, separator).trim();
        if (!AI_CREDENTIAL_KEY_PATTERN.test(key)) throw credentialError('INVALID_CREDENTIAL_FILE', `Invalid credential key at line ${index + 1}`);
        const value = parseCredentialValue(assignment.slice(separator + 1).trim(), index + 1);
        if (/[\u0000-\u001f\u007f]/.test(value)) throw credentialError('INVALID_CREDENTIAL_FILE', `Credential value contains control characters at line ${index + 1}`);
        if (new TextEncoder().encode(value).byteLength > AI_CREDENTIAL_MAX_VALUE_BYTES) {
            throw credentialError('INVALID_CREDENTIAL_FILE', `Credential value exceeds ${AI_CREDENTIAL_MAX_VALUE_BYTES} bytes at line ${index + 1}`);
        }
        values.set(key, value);
    });
    return values;
}

function parseCredentialValue(value, lineNumber) {
    if (!value) return '';
    const quote = value[0];
    if (quote !== '"' && quote !== "'") return value;
    let closingIndex = -1;
    let escaped = false;
    for (let index = 1; index < value.length; index += 1) {
        const character = value[index];
        if (quote === '"' && character === '\\' && !escaped) {
            escaped = true;
            continue;
        }
        if (character === quote && !escaped) {
            closingIndex = index;
            break;
        }
        escaped = false;
    }
    if (closingIndex !== value.length - 1) throw credentialError('INVALID_CREDENTIAL_FILE', `Invalid quoted credential value at line ${lineNumber}`);
    const inner = value.slice(1, closingIndex);
    if (quote === "'") return inner;
    return inner.replace(/\\("|\\)/g, (_match, escapedCharacter) => escapedCharacter);
}

class AiCredentialStore {
    #sources = new Map();
    #revision = 0;

    load(source, content) {
        const normalizedSource = String(source || '').trim();
        if (!normalizedSource) throw credentialError('CREDENTIAL_SOURCE_REQUIRED', 'Credential source is required');
        const values = parseAiCredentialText(content);
        const before = this.#activeEntries();
        this.#sources.set(normalizedSource, {source: normalizedSource, revision: ++this.#revision, values});
        const overriddenKeys = Array.from(values.keys()).filter((key) => before.get(key)?.source !== normalizedSource && before.has(key));
        return {source: normalizedSource, loaded_keys: Array.from(values.keys()), overridden_keys: overriddenKeys};
    }

    clear() {
        this.#sources.clear();
    }

    list() {
        return Array.from(this.#activeEntries().entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => ({key, source: entry.source}));
    }

    select(keys) {
        const requested = normalizeCredentialKeys(keys);
        const active = this.#activeEntries();
        const values = Object.create(null);
        const missing = [];
        requested.forEach((key) => {
            const entry = active.get(key);
            values[key] = entry?.value ?? '';
            if (!entry) missing.push(key);
        });
        return {requested, missing, values};
    }

    resolveTemplate(value, selection) {
        const source = String(value ?? '');
        const declared = new Set(selection.requested);
        let output = '';
        let cursor = 0;
        AI_CREDENTIAL_TEMPLATE_PATTERN.lastIndex = 0;
        for (const match of source.matchAll(AI_CREDENTIAL_TEMPLATE_PATTERN)) {
            const offset = match.index;
            if (offset > 0 && source[offset - 1] === '$') {
                output += source.slice(cursor, offset - 1) + match[0];
                cursor = offset + match[0].length;
                continue;
            }
            const key = match[1];
            if (!declared.has(key)) throw credentialError('CREDENTIAL_NOT_DECLARED', `Credential is not declared for this request: ${key}`);
            output += source.slice(cursor, offset) + transformCredential(selection.values[key], match[2] || 'raw');
            cursor = offset + match[0].length;
        }
        return output + source.slice(cursor);
    }

    #activeEntries() {
        const active = new Map();
        this.#sources.forEach((source) => {
            source.values.forEach((value, key) => {
                const current = active.get(key);
                if (!current || source.revision > current.revision) active.set(key, {value, source: source.source, revision: source.revision});
            });
        });
        return active;
    }
}

function normalizeCredentialKeys(keys) {
    if (keys == null) return [];
    if (!Array.isArray(keys)) throw credentialError('INVALID_CREDENTIAL_KEYS', 'credentials must be an array');
    return Array.from(new Set(keys.map((key) => String(key || '').trim()).filter(Boolean))).map((key) => {
        if (!AI_CREDENTIAL_KEY_PATTERN.test(key)) throw credentialError('INVALID_CREDENTIAL_KEY', `Invalid credential key: ${key}`);
        return key;
    });
}

function transformCredential(value, transform) {
    const text = String(value ?? '');
    switch (transform) {
        case 'raw': return text;
        case 'urlencode': return encodeURIComponent(text);
        case 'json': return JSON.stringify(text);
        case 'base64': return encodeCredentialBase64(text);
        default: throw credentialError('INVALID_CREDENTIAL_TRANSFORM', `Unsupported credential transform: ${transform}`);
    }
}

function encodeCredentialBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
}

function credentialError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

export {
    AI_CREDENTIAL_KEY_PATTERN,
    AI_CREDENTIAL_MAX_VALUE_BYTES,
    AiCredentialStore,
    normalizeCredentialKeys,
    parseAiCredentialText,
};
