import {init as initEsmLexer, parse as parseEsm} from 'es-module-lexer';

async function scanJavaScriptModuleSource(source) {
    const text = String(source || '');
    await initEsmLexer;
    const [imports, exports] = parseEsm(text);
    const esmSpecifiers = toEsmSpecifiers(text, imports);
    const codeMask = createCodeMask(text);
    const commonJsSpecifiers = scanCommonJsModuleSpecifiers(text, codeMask);
    const format = imports.length > 0 || exports.length > 0
        ? 'module'
        : detectClassicScriptFormat(text, codeMask);
    return {
        format,
        specifiers: format === 'module' ? esmSpecifiers : commonJsSpecifiers,
        esmSpecifiers,
        commonJsSpecifiers,
    };
}

async function detectJavaScriptSourceFormat(source) {
    return (await scanJavaScriptModuleSource(source)).format;
}

async function scanEsmModuleSpecifiers(source) {
    const text = String(source || '');
    await initEsmLexer;
    const [imports] = parseEsm(text);
    return toEsmSpecifiers(text, imports);
}

function scanCommonJsModuleSpecifiers(source, preparedCodeMask) {
    const text = String(source || '');
    const codeMask = preparedCodeMask || createCodeMask(text);
    const result = [];
    const pattern = /\b(require(?:\s*\.\s*resolve)?)\s*\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*\)/g;
    for (const match of text.matchAll(pattern)) {
        if (!codeMask[match.index ?? 0]) continue;
        const rawSpecifier = match[2] ?? match[3] ?? '';
        const quote = match[2] !== undefined ? '"' : "'";
        const quoteOffset = match[0].indexOf(quote);
        const start = (match.index ?? 0) + quoteOffset + 1;
        result.push({
            kind: /\./.test(match[1]) ? 'require-resolve' : 'require',
            specifier: decodeStaticModuleSpecifier(rawSpecifier),
            start,
            end: start + rawSpecifier.length,
            quote,
            literal: true,
        });
    }
    return result;
}

function toEsmSpecifiers(source, imports) {
    const result = [];
    for (const item of imports) {
        if (item.d === -2) continue;
        const dynamic = item.d >= 0;
        const range = getEsmSpecifierRange(source, item);
        result.push({
            kind: dynamic ? 'dynamic-import' : getStaticEsmKind(source, item),
            specifier: item.n ?? null,
            start: range.start,
            end: range.end,
            quote: range.quote,
            literal: item.n != null,
        });
    }
    return result;
}

function getEsmSpecifierRange(source, item) {
    if (item.n == null) return {start: item.s, end: item.e, quote: ''};
    const directQuote = source[item.s];
    if (isQuote(directQuote) && source[item.e - 1] === directQuote) {
        return {start: item.s + 1, end: item.e - 1, quote: directQuote};
    }
    const previousQuote = source[item.s - 1];
    return {start: item.s, end: item.e, quote: isQuote(previousQuote) ? previousQuote : ''};
}

function escapeModuleSpecifier(value, quote = '"') {
    let result = String(value).replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    if (quote === '`') return result.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    if (quote === "'") return result.replace(/'/g, "\\'");
    return result.replace(/"/g, '\\"');
}

function isQuote(value) {
    return value === '"' || value === "'" || value === '`';
}

function createCodeMask(source) {
    const result = new Uint8Array(source.length);
    let index = 0;
    let previousCode = '';
    while (index < source.length) {
        const value = source[index];
        const next = source[index + 1];
        if (value === '/' && next === '/') {
            index += 2;
            while (index < source.length && source[index] !== '\n') index += 1;
            continue;
        }
        if (value === '/' && next === '*') {
            index += 2;
            while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
            index = Math.min(source.length, index + 2);
            continue;
        }
        if (value === '"' || value === "'" || value === '`') {
            index = skipQuotedValue(source, index, value);
            previousCode = 'value';
            continue;
        }
        if (value === '/' && isRegexStart(source, index, previousCode)) {
            index = skipRegexLiteral(source, index);
            previousCode = 'value';
            continue;
        }
        result[index] = 1;
        if (!/\s/.test(value)) previousCode = value;
        index += 1;
    }
    return result;
}

function skipQuotedValue(source, start, quote) {
    let index = start + 1;
    while (index < source.length) {
        if (source[index] === '\\') index += 2;
        else if (source[index] === quote) return index + 1;
        else index += 1;
    }
    return source.length;
}

function isRegexStart(source, index, previousCode) {
    if (!previousCode || /[([{,:;=!?&|+\-*%^~<>]/.test(previousCode)) return true;
    const keyword = source.slice(0, index).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1];
    return ['case', 'delete', 'do', 'else', 'in', 'instanceof', 'new', 'return', 'throw', 'typeof', 'void', 'yield'].includes(keyword);
}

function skipRegexLiteral(source, start) {
    let index = start + 1;
    let characterClass = false;
    while (index < source.length) {
        if (source[index] === '\\') index += 2;
        else if (source[index] === '[') {
            characterClass = true;
            index += 1;
        } else if (source[index] === ']') {
            characterClass = false;
            index += 1;
        } else if (source[index] === '/' && !characterClass) {
            index += 1;
            while (/[A-Za-z]/.test(source[index] || '')) index += 1;
            return index;
        } else index += 1;
    }
    return source.length;
}

function getStaticEsmKind(source, item) {
    return /^\s*export\b/.test(source.slice(item.ss, item.s)) ? 'export' : 'import';
}

function detectClassicScriptFormat(source, codeMask) {
    if (hasCodeMatch(source, codeMask, /\btypeof\s+(?:module|exports|define)\b|\bdefine\s*\.\s*amd\b/g)) return 'umd';
    if (hasCodeMatch(source, codeMask, /\bmodule\s*\.\s*exports\b|\bexports\s*(?:\.|\[)|\brequire\s*\(/g)) return 'commonjs';
    return 'global';
}

function hasCodeMatch(source, codeMask, pattern) {
    for (const match of source.matchAll(pattern)) {
        if (codeMask[match.index ?? 0]) return true;
    }
    return false;
}

function decodeStaticModuleSpecifier(value) {
    return String(value).replace(/\\([\\'"bfnrtv])/g, (match, escaped) => ({
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        v: '\v',
    })[escaped] ?? escaped);
}

export {
    detectJavaScriptSourceFormat,
    escapeModuleSpecifier,
    scanCommonJsModuleSpecifiers,
    scanEsmModuleSpecifiers,
    scanJavaScriptModuleSource,
};
