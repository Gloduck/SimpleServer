import {toReadableStream} from '../file-utils.js';

async function writeFileTarget(target, source, options = {}) {
    if (!target || typeof target.createWritable !== 'function') {
        throw new TypeError('File target must provide createWritable()');
    }
    const stream = toReadableStream(source);
    let writable;
    try {
        writable = await target.createWritable();
        await stream.pipeTo(writable, options.signal ? {signal: options.signal} : undefined);
    } catch (error) {
        if (writable && typeof writable.abort === 'function') {
            try {
                await writable.abort(error);
            } catch {
            }
        }
        throw error;
    }
}

export {writeFileTarget};
