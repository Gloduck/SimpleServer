import {
    base64ToBlob,
    bytesToBase64,
    getFileName,
    getMimeType,
    joinFilePath,
    normalizeFilePath,
} from '../../file-utils.js';
import {FileSystemProvider} from '../file-system-provider.js';
import {
    FileConflictError,
    FileNotFoundError,
    FilePermissionError,
    FileSystemError,
    FileUnsupportedError,
} from '../file-system-errors.js';

class GithubProvider extends FileSystemProvider {
    constructor({token, repo, branch = 'main', rootPath = '', proxy = '', apiBase = 'https://api.github.com', fetch: fetchImpl = globalThis.fetch} = {}) {
        super();
        if (!repo || !repo.includes('/')) throw new TypeError('GithubProvider requires repo in owner/name form');
        if (typeof fetchImpl !== 'function') throw new TypeError('GithubProvider requires fetch');
        this.token = token;
        this.repo = repo;
        this.branch = branch;
        this.rootPath = normalizeFilePath(rootPath);
        this.proxy = String(proxy || '').replace(/\/$/, '');
        this.apiBase = apiBase.replace(/\/$/, '');
        this.fetch = fetchImpl.bind(globalThis);
        this.branchVerified = false;
    }

    getCapabilities() {
        return {
            ...super.getCapabilities(),
            read: true,
            write: true,
            streamingRead: true,
            streamingWrite: false,
            directories: true,
            emptyDirectories: false,
            implicitDirectories: true,
            createDirectory: false,
            removeFile: true,
            move: false,
            resourceUrl: false,
            optimisticLocking: true,
            versionPrecondition: 'atomic',
            requiresExpectedVersionForUpdate: true,
            requiresExpectedVersionForDelete: true,
        };
    }

    async checkAccess(path = '', options = {}) {
        const repository = await this.#requestJson(this.#repoUrl(), {method: 'GET', signal: options.signal}, '');
        if (options.writable && repository?.permissions && !repository.permissions.push && !repository.permissions.maintain && !repository.permissions.admin) {
            throw new FilePermissionError(normalizeFilePath(path), {message: 'GitHub repository is not writable with the configured token'});
        }
        await this.#requestJson(this.#branchUrl(), {method: 'GET', signal: options.signal}, '');
        this.branchVerified = true;
        try {
            await this.#getContent(path, options);
        } catch (error) {
            if (error?.code !== FileNotFoundError.code || !this.branchVerified || !this.rootPath || normalizeFilePath(path) !== '') throw error;
        }
        return true;
    }

    async stat(path = '', options = {}) {
        const normalizedPath = normalizeFilePath(path);
        let data;
        try {
            data = await this.#getContent(normalizedPath, options);
        } catch (error) {
            if (error?.code === FileNotFoundError.code && this.branchVerified && normalizedPath === '' && this.rootPath) {
                return {path: '', name: '', kind: 'directory', size: 0, mimeType: null, version: null};
            }
            throw error;
        }
        if (Array.isArray(data)) {
            return {
                path: normalizedPath,
                name: getFileName(normalizedPath),
                kind: 'directory',
                size: 0,
                mimeType: null,
                version: null,
            };
        }
        return githubEntry(normalizedPath, data);
    }

    async list(path = '', options = {}) {
        const {limit = Infinity} = options;
        const normalizedPath = normalizeFilePath(path);
        let data;
        try {
            data = await this.#getContent(normalizedPath, options);
        } catch (error) {
            if (error?.code === FileNotFoundError.code && this.branchVerified && normalizedPath === '' && this.rootPath) return [];
            throw error;
        }
        if (!Array.isArray(data)) {
            throw new FileUnsupportedError('list', {
                path: normalizedPath,
                message: `Cannot list a file: ${normalizedPath}`,
            });
        }
        return data
            .map((entry) => githubEntry(joinFilePath(normalizedPath, entry.name), entry))
            .sort((left, right) => left.name.localeCompare(right.name))
            .slice(0, limit);
    }

    async openRead(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const data = await this.#getContent(normalizedPath, options);
        if (Array.isArray(data) || data.type !== 'file') {
            throw new FileUnsupportedError('openRead', {
                path: normalizedPath,
                message: `Cannot read a directory: ${normalizedPath}`,
            });
        }

        if (data.encoding === 'base64' && typeof data.content === 'string') {
            const blob = base64ToBlob(data.content, getMimeType(normalizedPath));
            return {
                path: normalizedPath,
                name: getFileName(normalizedPath),
                kind: 'file',
                size: blob.size,
                mimeType: blob.type,
                version: data.sha,
                blob,
                stream: blob.stream(),
            };
        }
        if (data.download_url) {
            const response = await this.fetch(this.#proxyUrl(data.download_url), {
                headers: this.#downloadHeaders(),
                signal: options.signal,
            });
            if (!response.ok) throw await this.#httpError(response, normalizedPath);
            if (!response.body) throw new FileSystemError(`GitHub did not return a streaming response: ${normalizedPath}`, {
                code: 'INVALID_PROVIDER_RESPONSE',
                path: normalizedPath,
            });
            const contentLengthHeader = response.headers.get('content-length');
            const contentLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader);
            return {
                path: normalizedPath,
                name: getFileName(normalizedPath),
                kind: 'file',
                size: Number.isFinite(Number(data.size)) ? Number(data.size) : (Number.isFinite(contentLength) ? contentLength : undefined),
                mimeType: getMimeType(normalizedPath),
                version: data.sha,
                stream: response.body,
            };
        }
        throw new FileSystemError(`GitHub did not return file content: ${normalizedPath}`, {
            code: 'INVALID_PROVIDER_RESPONSE',
            path: normalizedPath,
        });
    }

    async write(path, blob, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        if (options.expectedVersion === undefined) {
            throw new FileConflictError(normalizedPath, {
                expectedVersion: undefined,
                message: `GitHub write requires the version that was originally read: ${normalizedPath}`,
            });
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const body = {
            message: options.message || `Update ${normalizedPath}`,
            content: bytesToBase64(bytes),
            branch: this.branch,
        };
        if (typeof options.expectedVersion === 'string') body.sha = options.expectedVersion;

        const data = await this.#requestJson(this.#contentUrl(normalizedPath), {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
            signal: options.signal,
        }, normalizedPath, options.expectedVersion);
        const content = data.content || {};
        return githubEntry(normalizedPath, {
            ...content,
            type: 'file',
            size: blob.size,
        });
    }

    async remove(path, options = {}) {
        const normalizedPath = normalizeFilePath(path);
        const version = options.expectedVersion;
        if (version === undefined) {
            throw new FileConflictError(normalizedPath, {
                expectedVersion: undefined,
                message: `GitHub delete requires the version that was originally read: ${normalizedPath}`,
            });
        }
        if (version === null) {
            let actualVersion = null;
            try {
                actualVersion = (await this.stat(normalizedPath, options)).version;
            } catch (error) {
                if (error?.code === FileNotFoundError.code) throw error;
                throw error;
            }
            throw new FileConflictError(normalizedPath, {expectedVersion: null, actualVersion});
        }

        await this.#requestJson(this.#contentUrl(normalizedPath), {
            method: 'DELETE',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                message: options.message || `Delete ${normalizedPath}`,
                sha: version,
                branch: this.branch,
            }),
            signal: options.signal,
        }, normalizedPath, version);
        return true;
    }

    async #getContent(path, options = {}) {
        return this.#requestJson(`${this.#contentUrl(path)}?ref=${encodeURIComponent(this.branch)}`, {
            method: 'GET',
            signal: options.signal,
        }, path);
    }

    async #requestJson(url, options, path, expectedVersion) {
        const response = await this.fetch(url, {
            ...options,
            headers: {...this.#headers(), ...options.headers},
        });
        if (!response.ok) throw await this.#httpError(response, path, expectedVersion);
        if (response.status === 204) return null;
        return response.json();
    }

    async #httpError(response, path, expectedVersion) {
        let message = `GitHub request failed with status ${response.status}`;
        try {
            const data = await response.json();
            if (data?.message) message = data.message;
        } catch {
        }
        const options = {message, status: response.status};
        if (response.status === 404 && typeof expectedVersion === 'string') {
            return new FileConflictError(path, {...options, expectedVersion, actualVersion: null});
        }
        if (response.status === 404) return new FileNotFoundError(path, options);
        if (response.status === 401 || response.status === 403) return new FilePermissionError(path, options);
        if (response.status === 409 || (response.status === 422 && isVersionConflictMessage(message))) {
            return new FileConflictError(path, {...options, expectedVersion});
        }
        return new FileSystemError(message, {code: 'GITHUB_HTTP_ERROR', path, status: response.status});
    }

    #headers() {
        return {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(this.token ? {Authorization: `Bearer ${this.token}`} : {}),
        };
    }

    #downloadHeaders() {
        if (this.#usesDownloadProxy() || !this.token) return {};
        return {Authorization: `Bearer ${this.token}`};
    }

    #repoUrl() {
        return `${this.apiBase}/repos/${this.repo.split('/').map(encodeURIComponent).join('/')}`;
    }

    #branchUrl() {
        return `${this.#repoUrl()}/branches/${encodeURIComponent(this.branch)}`;
    }

    #contentUrl(path) {
        const repositoryPath = joinFilePath(this.rootPath, path);
        const encodedPath = repositoryPath.split('/').map(encodeURIComponent).join('/');
        return `${this.#repoUrl()}/contents${encodedPath ? `/${encodedPath}` : ''}`;
    }

    #proxyUrl(url) {
        return this.#usesDownloadProxy() ? `${this.proxy}/${url}` : url;
    }

    #usesDownloadProxy() {
        return Boolean(this.proxy && !this.token);
    }
}

function isVersionConflictMessage(message) {
    return /\bsha\b|already exists|does not match/i.test(String(message || ''));
}

function githubEntry(path, entry) {
    const kind = entry.type === 'dir' ? 'directory' : 'file';
    return {
        path,
        name: getFileName(path) || entry.name || '',
        kind,
        size: kind === 'file' ? (entry.size || 0) : 0,
        mimeType: kind === 'file' ? getMimeType(path) : null,
        version: kind === 'file' ? entry.sha || null : null,
    };
}

export {GithubProvider};
