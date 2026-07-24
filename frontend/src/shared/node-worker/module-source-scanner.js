import {init as initEsmLexer, parse as parseEsm} from 'es-module-lexer';

async function scanJavaScriptModuleSource(source) {
    const text = String(source || '');
    await initEsmLexer;
    const [imports, exports] = parseEsm(text);
    const esmSpecifiers = toEsmSpecifiers(text, imports);
    const commonJsSpecifiers = scanCommonJsModuleSpecifiers(text);
    const format = imports.length > 0 || exports.length > 0
        ? 'module'
        : looksLikeCommonJsOrUmd(text) ? 'umd' : 'global';
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

function scanCommonJsModuleSpecifiers(source) {
    const text = String(source || '');
    const result = [];
    const pattern = /\b(require(?:\s*\.\s*resolve)?)\s*\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*\)/g;
    for (const match of text.matchAll(pattern)) {
        const rawSpecifier = match[2] ?? match[3] ?? '';
        const quote = match[2] !== undefined ? '"' : "'";
        const quoteOffset = match[0].indexOf(quote);
        const start = (match.index ?? 0) + quoteOffset + 1;
        result.push({
            kind: /\./.test(match[1]) ? 'require-resolve' : 'require',
            specifier: decodeStaticModuleSpecifier(rawSpecifier),
            start,
            end: start + rawSpecifier.length,
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
        result.push({
            kind: dynamic ? 'dynamic-import' : getStaticEsmKind(source, item),
            specifier: item.n ?? null,
            start: item.s,
            end: item.e,
            literal: item.n != null,
        });
    }
    return result;
}

function getStaticEsmKind(source, item) {
    return /^\s*export\b/.test(source.slice(item.ss, item.s)) ? 'export' : 'import';
}

function looksLikeCommonJsOrUmd(source) {
    return /\bmodule\s*\.\s*exports\b|\bexports\s*(?:\.|\[)|\brequire\s*\(|\btypeof\s+(?:module|exports)\b|\bdefine\s*\.\s*amd\b/.test(source);
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
    scanCommonJsModuleSpecifiers,
    scanEsmModuleSpecifiers,
    scanJavaScriptModuleSource,
};
