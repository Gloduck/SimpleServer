class FileSystemError extends Error {
    constructor(message, options = {}) {
        super(message, options.cause === undefined ? undefined : {cause: options.cause});
        this.name = this.constructor.name;
        this.code = options.code || 'FILE_SYSTEM_ERROR';

        for (const [key, value] of Object.entries(options)) {
            if (key !== 'cause' && value !== undefined) this[key] = value;
        }

        if (options.cause !== undefined) this.cause = options.cause;
    }
}

class FileNotFoundError extends FileSystemError {
    constructor(path, options = {}) {
        super(options.message || `File not found: ${path}`, {
            ...options,
            code: 'FILE_NOT_FOUND',
            path,
        });
    }
}

class FileAlreadyExistsError extends FileSystemError {
    constructor(path, options = {}) {
        super(options.message || `File already exists: ${path}`, {
            ...options,
            code: 'FILE_ALREADY_EXISTS',
            path,
        });
    }
}

class FileConflictError extends FileSystemError {
    static code = 'FILE_CONFLICT';

    constructor(path, options = {}) {
        super(options.message || `File version conflict: ${path}`, {
            ...options,
            code: FileConflictError.code,
            path,
        });
    }
}

class FileTooLargeError extends FileSystemError {
    constructor(path, options = {}) {
        const size = options.size;
        const maxSize = options.maxSize;
        super(options.message || `File is too large for ${options.operation || 'this operation'}: ${path} (${size} > ${maxSize} bytes)`, {
            ...options,
            code: 'FILE_TOO_LARGE',
            path,
            size,
            maxSize,
        });
    }
}

class FileUnsupportedError extends FileSystemError {
    constructor(operation, options = {}) {
        super(options.message || `File system operation is not supported: ${operation}`, {
            ...options,
            code: 'FILE_UNSUPPORTED',
            operation,
        });
    }
}

class FilePermissionError extends FileSystemError {
    constructor(path, options = {}) {
        super(options.message || `Permission denied: ${path}`, {
            ...options,
            code: 'FILE_PERMISSION_DENIED',
            path,
        });
    }
}

class FileAbortedError extends FileSystemError {
    constructor(path, options = {}) {
        super(options.message || `File operation was aborted: ${path}`, {
            ...options,
            code: 'FILE_ABORTED',
            path,
        });
    }
}

export {
    FileSystemError,
    FileNotFoundError,
    FileAlreadyExistsError,
    FileConflictError,
    FileTooLargeError,
    FileUnsupportedError,
    FilePermissionError,
    FileAbortedError,
};
