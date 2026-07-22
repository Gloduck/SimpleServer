class FileSystemError extends Error {
    static code = 'FILE_SYSTEM_ERROR';

    constructor(message, options = {}) {
        super(message, options.cause === undefined ? undefined : {cause: options.cause});
        this.name = this.constructor.name;
        this.code = options.code || this.constructor.code || FileSystemError.code;

        for (const [key, value] of Object.entries(options)) {
            if (key !== 'cause' && value !== undefined) this[key] = value;
        }

        if (options.cause !== undefined) this.cause = options.cause;
    }
}

class FileNotFoundError extends FileSystemError {
    static code = 'FILE_NOT_FOUND';

    constructor(path, options = {}) {
        super(options.message || `File not found: ${path}`, {
            ...options,
            code: FileNotFoundError.code,
            path,
        });
    }
}

class FileAlreadyExistsError extends FileSystemError {
    static code = 'FILE_ALREADY_EXISTS';

    constructor(path, options = {}) {
        super(options.message || `File already exists: ${path}`, {
            ...options,
            code: FileAlreadyExistsError.code,
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
    static code = 'FILE_TOO_LARGE';

    constructor(path, options = {}) {
        const size = options.size;
        const maxSize = options.maxSize;
        super(options.message || `File is too large for ${options.operation || 'this operation'}: ${path} (${size} > ${maxSize} bytes)`, {
            ...options,
            code: FileTooLargeError.code,
            path,
            size,
            maxSize,
        });
    }
}

class FileUnsupportedError extends FileSystemError {
    static code = 'FILE_UNSUPPORTED';

    constructor(operation, options = {}) {
        super(options.message || `File system operation is not supported: ${operation}`, {
            ...options,
            code: FileUnsupportedError.code,
            operation,
        });
    }
}

class FilePermissionError extends FileSystemError {
    static code = 'FILE_PERMISSION_DENIED';

    constructor(path, options = {}) {
        super(options.message || `Permission denied: ${path}`, {
            ...options,
            code: FilePermissionError.code,
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
};
